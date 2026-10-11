import type { Prisma } from '@prisma/client';
import { CENTER_ZONE, computeSlots, dayWorkWindows, type Slot } from '@turnos/shared';
import { DateTime } from 'luxon';
import { prisma } from '../db';
import { HttpError } from '../http';
import { dateOnly, getHolidaySet, getSettings } from './center';

type Db = Prisma.TransactionClient | typeof prisma;

export interface ResolvedItem {
  treatmentId: string;
  name: string;
  durationMin: number;
  priceCents: number;
  depositPercent: number;
}

/** Valida que la profesional ofrezca esos tratamientos y que, si son varios, estén marcados como combinables entre sí. */
export async function resolveTreatments(professionalId: string, treatmentIds: string[], db: Db = prisma): Promise<ResolvedItem[]> {
  if (treatmentIds.length === 0) throw new HttpError(400, 'NO_TREATMENTS');
  if (new Set(treatmentIds).size !== treatmentIds.length) throw new HttpError(400, 'DUPLICATED_TREATMENT');

  const configured = await db.professionalTreatment.findMany({
    where: { professionalId, treatmentId: { in: treatmentIds }, isActive: true, treatment: { isActive: true } },
    include: { treatment: true },
  });
  if (configured.length !== treatmentIds.length) throw new HttpError(422, 'TREATMENT_NOT_OFFERED');

  if (treatmentIds.length > 1) {
    const combos = await db.treatmentCombo.findMany({ where: { professionalId } });
    const allowed = new Set(combos.map((c) => `${c.treatmentAId}:${c.treatmentBId}`));
    for (let i = 0; i < treatmentIds.length; i++) {
      for (let j = i + 1; j < treatmentIds.length; j++) {
        const key = [treatmentIds[i], treatmentIds[j]].sort().join(':');
        if (!allowed.has(key)) throw new HttpError(422, 'COMBO_NOT_ALLOWED');
      }
    }
  }
  // Respeta el orden que eligió la clienta.
  return treatmentIds.map((id) => {
    const c = configured.find((x) => x.treatmentId === id)!;
    return { treatmentId: id, name: c.treatment.name, durationMin: c.durationMin, priceCents: c.priceCents, depositPercent: c.depositPercent };
  });
}

export async function workWindows(professionalId: string, date: string, db: Db = prisma) {
  const day = DateTime.fromISO(date, { zone: CENTER_ZONE });
  const [weekly, exceptions, holidays] = await Promise.all([
    db.schedule.findMany({
      where: {
        professionalId,
        weekday: day.weekday,
        AND: [
          { OR: [{ validFrom: null }, { validFrom: { lte: dateOnly(date) } }] },
          { OR: [{ validTo: null }, { validTo: { gte: dateOnly(date) } }] },
        ],
      },
    }),
    db.scheduleException.findMany({ where: { professionalId, date: dateOnly(date) } }),
    getHolidaySet(),
  ]);
  return dayWorkWindows(
    weekly.map((w) => ({ start: w.startTime, end: w.endTime })),
    exceptions.map((e) => ({ type: e.type, start: e.startTime, end: e.endTime })),
    holidays.has(date),
  );
}

/** Turnos que ocupan agenda: confirmados y pendientes de pago con la reserva temporal vigente. */
export function activeAppointmentsWhere(professionalId: string, from: Date, to: Date, excludeId?: string): Prisma.AppointmentWhereInput {
  return {
    professionalId,
    id: excludeId ? { not: excludeId } : undefined,
    startAt: { lt: to },
    blockedUntil: { gt: from },
    OR: [{ status: 'CONFIRMED' }, { status: 'PENDING_PAYMENT', holdExpiresAt: { gt: new Date() } }],
  };
}

export interface SlotQuery {
  professionalId: string;
  treatmentIds: string[];
  date: string;
  /** Staff y alertas de último momento: sin anticipación mínima ni máxima (solo no en el pasado). */
  ignoreAdvanceRules?: boolean;
  /** Al reprogramar, el turno que se mueve no cuenta como ocupado. */
  excludeAppointmentId?: string;
  now?: Date;
}

export async function availableSlots(q: SlotQuery, db: Db = prisma): Promise<{ slots: Slot[]; items: ResolvedItem[]; durationMin: number }> {
  const professional = await db.professional.findUnique({ where: { id: q.professionalId } });
  if (!professional?.isActive) throw new HttpError(404, 'PROFESSIONAL_NOT_FOUND');

  const [items, settings, windows] = await Promise.all([
    resolveTreatments(q.professionalId, q.treatmentIds, db),
    getSettings(),
    workWindows(q.professionalId, q.date, db),
  ]);
  const durationMin = items.reduce((s, i) => s + i.durationMin, 0);
  const day = DateTime.fromISO(q.date, { zone: CENTER_ZONE });
  const busy = await db.appointment.findMany({
    where: activeAppointmentsWhere(q.professionalId, day.startOf('day').toJSDate(), day.endOf('day').toJSDate(), q.excludeAppointmentId),
    select: { startAt: true, blockedUntil: true },
  });

  const now = q.now ?? new Date();
  const slots = computeSlots({
    date: q.date,
    windows,
    busy: busy.map((b) => ({ start: b.startAt, end: b.blockedUntil })),
    durationMin,
    bufferMin: settings.bufferMin,
    notBefore: q.ignoreAdvanceRules ? now : new Date(now.getTime() + professional.minAdvanceHours * 3_600_000),
    notAfter: q.ignoreAdvanceRules ? undefined : new Date(now.getTime() + professional.maxAdvanceDays * 86_400_000),
  });
  return { slots, items, durationMin };
}

export async function assertSlotAvailable(q: Omit<SlotQuery, 'date'> & { startAt: Date }, db: Db = prisma) {
  const result = await availableSlots({ ...q, date: DateTime.fromJSDate(q.startAt, { zone: CENTER_ZONE }).toISODate()! }, db);
  if (!result.slots.some((s) => s.start.getTime() === q.startAt.getTime())) throw new HttpError(409, 'SLOT_TAKEN');
  return result;
}
