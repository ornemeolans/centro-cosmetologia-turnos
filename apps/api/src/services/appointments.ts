import type { Appointment, AppointmentSource, Prisma, User } from '@prisma/client';
import { blockedUntil, itemDeposit, modifyRules } from '@turnos/shared';
import { prisma } from '../db';
import { forbidden, HttpError, isOverlapError, notFound } from '../http';
import { assertSlotAvailable } from './availability';
import { getNoticeConfig, getSettings } from './center';
import { addCredit, availableCredit, consumeCredit } from './credits';
import { notify } from './notifications';
import { verifyOffer } from './offers';
import { audit, recordAccess } from './records';
import { onSlotFreed } from './waitlist';

type Tx = Prisma.TransactionClient;

export const appointmentInclude = {
  items: { include: { treatment: { select: { name: true } } }, orderBy: { sort: 'asc' } },
  professional: { select: { id: true, displayName: true } },
  clientRecord: { select: { id: true, firstName: true, lastName: true, phoneE164: true, email: true, isReliable: true, status: true, userId: true } },
} satisfies Prisma.AppointmentInclude;

export type AppointmentFull = Prisma.AppointmentGetPayload<{ include: typeof appointmentInclude }>;

/** Las reservas temporales vencidas siguen bloqueando la restricción EXCLUDE hasta marcarse EXPIRED: se limpian antes de insertar. */
async function expireStaleHolds(tx: Tx, professionalId: string) {
  await tx.appointment.updateMany({
    where: { professionalId, status: 'PENDING_PAYMENT', holdExpiresAt: { lt: new Date() } },
    data: { status: 'EXPIRED' },
  });
}

async function withOverlapGuard<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (isOverlapError(err)) throw new HttpError(409, 'SLOT_TAKEN');
    throw err;
  }
}

// ───────────────────────────── Crear ─────────────────────────────

export interface CreateInput {
  actor: User;
  clientRecordId: string;
  professionalId: string;
  treatmentIds: string[];
  startAt: Date;
  source: AppointmentSource;
  offerToken?: string;
}

export async function createAppointment(input: CreateInput): Promise<AppointmentFull> {
  const settings = await getSettings();
  const record = await prisma.clientRecord.findUnique({ where: { id: input.clientRecordId } });
  if (!record) throw notFound('RECORD_NOT_FOUND');

  const professional = await prisma.professional.findFirst({ where: { id: input.professionalId, isActive: true } });
  if (!professional) throw notFound('PROFESSIONAL_NOT_FOUND');

  const isClient = input.source === 'CLIENT';
  if (isClient) {
    if (record.userId !== input.actor.id) throw forbidden();
    if (record.status !== 'ACTIVA') throw new HttpError(422, 'FIRST_VISIT_PENDING');
  }
  const offer = input.offerToken ? verifyOffer(input.offerToken) : null;
  const offerApplies = Boolean(offer && offer.professionalId === input.professionalId && new Date(offer.start).getTime() === input.startAt.getTime());

  const appointment = await withOverlapGuard(() => prisma.$transaction(async (tx) => {
    await expireStaleHolds(tx, professional.id);
    const { items, durationMin } = await assertSlotAvailable({
      professionalId: professional.id,
      treatmentIds: input.treatmentIds,
      startAt: input.startAt,
      ignoreAdvanceRules: !isClient || offerApplies,
    }, tx);

    const deposits = items.map((i) => (isClient ? itemDeposit(i) : 0));
    const depositTotal = deposits.reduce((a, b) => a + b, 0);
    if (isClient && depositTotal > 0 && !professional.mpAccessTokenEnc) {
      throw new HttpError(422, 'PROFESSIONAL_MP_NOT_CONNECTED');
    }
    const credit = isClient ? Math.min(depositTotal, await availableCredit(record.id, professional.id, tx)) : 0;
    const confirmedNow = !isClient || depositTotal - credit === 0;

    const endAt = new Date(input.startAt.getTime() + durationMin * 60_000);
    const created = await tx.appointment.create({
      data: {
        clientRecordId: record.id,
        professionalId: professional.id,
        startAt: input.startAt,
        endAt,
        blockedUntil: blockedUntil(input.startAt, durationMin, settings.bufferMin),
        status: confirmedNow ? 'CONFIRMED' : 'PENDING_PAYMENT',
        source: input.source,
        isFirstVisit: record.status === 'PRIMERA_VEZ',
        depositTotalCents: depositTotal,
        creditAppliedCents: credit,
        depositPaidCents: confirmedNow ? depositTotal : 0,
        holdExpiresAt: confirmedNow ? null : new Date(Date.now() + settings.holdMin * 60_000),
        items: {
          create: items.map((i, idx) => ({
            treatmentId: i.treatmentId, sort: idx, durationMin: i.durationMin, priceCents: i.priceCents,
            depositPercent: isClient ? i.depositPercent : 0, depositAmountCents: deposits[idx],
          })),
        },
      },
      include: appointmentInclude,
    });
    if (confirmedNow && credit > 0) {
      await consumeCredit(tx, { clientRecordId: record.id, professionalId: professional.id, amountCents: credit, appointmentId: created.id });
    }
    return created;
  }));

  await audit(input.actor.id, 'appointment', appointment.id, 'CREATE', { source: input.source });
  if (appointment.status === 'CONFIRMED') {
    await notify({ template: isClient ? 'turno_confirmado' : 'turno_agendado', appointmentId: appointment.id });
  }
  return appointment;
}

/** Confirmación por pago aprobado (webhook o conciliación). Idempotente. Devuelve false si el horario ya no está libre. */
export async function confirmPaidAppointment(appointmentId: string): Promise<'CONFIRMED' | 'ALREADY' | 'SLOT_LOST' | 'NOT_CONFIRMABLE'> {
  const appt = await prisma.appointment.findUnique({ where: { id: appointmentId } });
  if (!appt) return 'NOT_CONFIRMABLE';
  if (appt.status === 'CONFIRMED') return 'ALREADY';
  if (appt.status !== 'PENDING_PAYMENT' && appt.status !== 'EXPIRED') return 'NOT_CONFIRMABLE';

  try {
    await prisma.$transaction(async (tx) => {
      // Un pago tardío sobre una reserva vencida: se reactiva solo si el horario sigue libre (la restricción EXCLUDE lo garantiza).
      const { count } = await tx.appointment.updateMany({
        where: { id: appt.id, status: { in: ['PENDING_PAYMENT', 'EXPIRED'] } },
        data: { status: 'CONFIRMED', holdExpiresAt: null, depositPaidCents: appt.depositTotalCents },
      });
      if (count === 0) return;
      if (appt.creditAppliedCents > 0) {
        await consumeCredit(tx, { clientRecordId: appt.clientRecordId, professionalId: appt.professionalId, amountCents: appt.creditAppliedCents, appointmentId: appt.id });
      }
    });
  } catch (err) {
    if (isOverlapError(err)) return 'SLOT_LOST';
    throw err;
  }
  await notify({ template: 'turno_confirmado', appointmentId: appt.id });
  return 'CONFIRMED';
}

// ───────────────────────── Reglas de cambio ─────────────────────────

export async function rulesFor(appt: Pick<Appointment, 'startAt' | 'rescheduleCount'>, now = new Date()) {
  const cfg = await getNoticeConfig();
  return modifyRules({ now, startAt: appt.startAt, rescheduleCount: appt.rescheduleCount, maxReschedules: cfg.maxReschedules }, cfg);
}

type Actor = 'CLIENT' | 'STAFF' | 'OWNER_FORCE';

async function loadForChange(user: User, id: string, forced: boolean): Promise<{ appt: AppointmentFull; actor: Actor }> {
  const appt = await prisma.appointment.findUnique({ where: { id }, include: appointmentInclude });
  if (!appt) throw notFound('APPOINTMENT_NOT_FOUND');
  if (forced) {
    if (user.role !== 'OWNER') throw forbidden();
    return { appt, actor: 'OWNER_FORCE' };
  }
  if (user.role === 'CLIENT') {
    if (appt.clientRecord.userId !== user.id) throw notFound('APPOINTMENT_NOT_FOUND');
    return { appt, actor: 'CLIENT' };
  }
  if (user.role === 'PROFESSIONAL') await recordAccess(user, appt.clientRecordId);
  return { appt, actor: 'STAFF' };
}

// ───────────────────────────── Reprogramar ─────────────────────────────

export async function rescheduleAppointment(user: User, id: string, newStartAt: Date, forcedReason?: string): Promise<AppointmentFull> {
  const forced = Boolean(forcedReason);
  const { appt, actor } = await loadForChange(user, id, forced);
  if (appt.status !== 'CONFIRMED') throw new HttpError(422, 'NOT_RESCHEDULABLE');

  if (!forced) {
    const rules = await rulesFor(appt);
    if (!rules.onTime) throw new HttpError(422, 'OUTSIDE_NOTICE_PERIOD', { deadline: rules.deadline });
    if (rules.reschedulesLeft <= 0) throw new HttpError(422, 'RESCHEDULE_LIMIT');
  }
  const settings = await getSettings();

  const next = await withOverlapGuard(() => prisma.$transaction(async (tx) => {
    await expireStaleHolds(tx, appt.professionalId);
    const { durationMin } = await assertSlotAvailable({
      professionalId: appt.professionalId,
      treatmentIds: appt.items.map((i) => i.treatmentId),
      startAt: newStartAt,
      excludeAppointmentId: appt.id,
      ignoreAdvanceRules: actor !== 'CLIENT',
    }, tx);
    await tx.appointment.update({ where: { id: appt.id }, data: { status: 'RESCHEDULED' } });
    return tx.appointment.create({
      data: {
        clientRecordId: appt.clientRecordId,
        professionalId: appt.professionalId,
        startAt: newStartAt,
        endAt: new Date(newStartAt.getTime() + durationMin * 60_000),
        blockedUntil: blockedUntil(newStartAt, durationMin, settings.bufferMin),
        status: 'CONFIRMED',
        source: appt.source,
        isFirstVisit: appt.isFirstVisit,
        depositTotalCents: appt.depositTotalCents,
        creditAppliedCents: appt.creditAppliedCents,
        depositPaidCents: appt.depositPaidCents,
        // El cambio forzado por la OWNER no cuenta como reprogramación de la clienta.
        rescheduleCount: appt.rescheduleCount + (forced ? 0 : 1),
        rescheduledFromId: appt.id,
        forcedByOwnerReason: forcedReason,
        icsUid: appt.icsUid, // mismo UID: el calendario de la clienta actualiza el evento
        version: appt.version + 1,
        items: {
          create: appt.items.map((i) => ({
            treatmentId: i.treatmentId, sort: i.sort, durationMin: i.durationMin, priceCents: i.priceCents,
            depositPercent: i.depositPercent, depositAmountCents: i.depositAmountCents,
          })),
        },
      },
      include: appointmentInclude,
    });
  }));

  await audit(user.id, 'appointment', appt.id, forced ? 'FORCED_RESCHEDULE' : 'RESCHEDULE', { to: next.id, reason: forcedReason });
  await notify({ template: 'turno_reprogramado', appointmentId: next.id, payload: { previousStartAt: appt.startAt.toISOString() } });
  await onSlotFreed(appt);
  return next;
}

// ───────────────────────────── Cancelar ─────────────────────────────

export type CancelOutcome = 'CREDIT' | 'FORFEIT' | 'NO_DEPOSIT';

export async function cancelAppointment(
  user: User, id: string, opts: { acceptForfeit?: boolean; forcedReason?: string } = {},
): Promise<{ outcome: CancelOutcome; creditCents: number }> {
  const forced = Boolean(opts.forcedReason);
  const { appt, actor } = await loadForChange(user, id, forced);

  // Una reserva sin pagar se puede abandonar sin consecuencias.
  if (appt.status === 'PENDING_PAYMENT' && actor === 'CLIENT') {
    await prisma.appointment.update({ where: { id: appt.id }, data: { status: 'EXPIRED', holdExpiresAt: null } });
    return { outcome: 'NO_DEPOSIT', creditCents: 0 };
  }
  if (appt.status !== 'CONFIRMED') throw new HttpError(422, 'NOT_CANCELABLE');

  let outcome: CancelOutcome;
  if (forced) {
    outcome = 'CREDIT';
  } else {
    const rules = await rulesFor(appt);
    if (rules.onTime) outcome = 'CREDIT';
    else if (actor === 'CLIENT') {
      if (!opts.acceptForfeit) throw new HttpError(422, 'LATE_CANCEL_FORFEITS_DEPOSIT', { deadline: rules.deadline, depositCents: appt.depositPaidCents });
      outcome = 'FORFEIT';
    } else throw new HttpError(422, 'OUTSIDE_NOTICE_PERIOD', { deadline: rules.deadline });
  }
  if (appt.depositPaidCents === 0) outcome = 'NO_DEPOSIT';

  const settings = await getSettings();
  const creditCents = outcome === 'CREDIT' ? appt.depositPaidCents : 0;
  await prisma.$transaction(async (tx) => {
    await tx.appointment.update({ where: { id: appt.id }, data: { status: 'CANCELED', canceledAt: new Date(), forcedByOwnerReason: opts.forcedReason } });
    await addCredit(tx, {
      clientRecordId: appt.clientRecordId, professionalId: appt.professionalId, amountCents: creditCents,
      appointmentId: appt.id, reason: 'CANCEL_ON_TIME', validDays: settings.creditValidDays,
    });
  });

  await audit(user.id, 'appointment', appt.id, forced ? 'FORCED_CANCEL' : 'CANCEL', { outcome, by: actor, reason: opts.forcedReason });
  await notify({ template: 'turno_cancelado', appointmentId: appt.id, payload: { outcome, creditCents, validDays: settings.creditValidDays } });
  await onSlotFreed(appt);
  return { outcome, creditCents };
}

// ───────────────────────────── Estado ─────────────────────────────

export async function setAttendance(user: User, id: string, status: 'COMPLETED' | 'NO_SHOW') {
  const { appt } = await loadForChange(user, id, false);
  if (user.role === 'CLIENT' || user.role === 'RECEPTION') throw forbidden();
  if (appt.status !== 'CONFIRMED') throw new HttpError(422, 'NOT_CONFIRMED');
  if (appt.startAt > new Date()) throw new HttpError(422, 'NOT_STARTED');

  await prisma.$transaction([
    prisma.appointment.update({ where: { id: appt.id }, data: { status } }),
    // Retención: la historia se guarda 2 años desde el último turno.
    ...(status === 'COMPLETED'
      ? [prisma.clientRecord.update({ where: { id: appt.clientRecordId }, data: { retentionUntil: new Date(appt.startAt.getTime() + 2 * 365 * 86_400_000) } })]
      : []),
  ]);
  await audit(user.id, 'appointment', appt.id, status);
}

/** Forma pública de un turno para la clienta y el staff. */
export async function serializeAppointment(a: AppointmentFull, now = new Date()) {
  const base = {
    id: a.id,
    startAt: a.startAt,
    endAt: a.endAt,
    status: a.status,
    source: a.source,
    isFirstVisit: a.isFirstVisit,
    professional: a.professional,
    treatments: a.items.map((i) => ({ id: i.treatmentId, name: i.treatment.name, durationMin: i.durationMin, priceCents: i.priceCents })),
    depositTotalCents: a.depositTotalCents,
    depositPaidCents: a.depositPaidCents,
    holdExpiresAt: a.holdExpiresAt,
    clientConfirmedAt: a.clientConfirmedAt,
  };
  if (a.status !== 'CONFIRMED') return { ...base, rules: null };
  const rules = await rulesFor(a, now);
  return { ...base, rules: { deadline: rules.deadline, onTime: rules.onTime, canReschedule: rules.canReschedule, reschedulesLeft: rules.reschedulesLeft } };
}
