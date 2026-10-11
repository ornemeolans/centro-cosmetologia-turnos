import { CENTER_ZONE } from '@turnos/shared';
import { DateTime } from 'luxon';
import { prisma } from '../db';
import { workWindows } from './availability';

const minutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3));

async function availableMinutes(professionalId: string, from: string, to: string) {
  let total = 0;
  for (let d = DateTime.fromISO(from, { zone: CENTER_ZONE }); d.toISODate()! <= to; d = d.plus({ days: 1 })) {
    for (const w of await workWindows(professionalId, d.toISODate()!)) total += minutes(w.end) - minutes(w.start);
  }
  return total;
}

async function lateCancelIds(from: Date, to: Date) {
  const rows = await prisma.auditLog.findMany({
    where: { entity: 'appointment', action: 'CANCEL', diff: { path: ['outcome'], equals: 'FORFEIT' } },
    select: { entityId: true },
  });
  const appts = await prisma.appointment.findMany({ where: { id: { in: rows.map((r) => r.entityId) }, startAt: { gte: from, lte: to } }, select: { id: true } });
  return new Set(appts.map((a) => a.id));
}

/** Resumen por profesional en un rango (fechas locales 'yyyy-MM-dd', inclusive). */
export async function professionalSummary(professionalIds: string[], fromIso: string, toIso: string) {
  const from = DateTime.fromISO(fromIso, { zone: CENTER_ZONE }).startOf('day').toJSDate();
  const to = DateTime.fromISO(toIso, { zone: CENTER_ZONE }).endOf('day').toJSDate();
  const late = await lateCancelIds(from, to);
  const now = new Date();

  const professionals = await prisma.professional.findMany({ where: { id: { in: professionalIds } }, orderBy: { displayName: 'asc' } });
  return Promise.all(professionals.map(async (p) => {
    const appts = await prisma.appointment.findMany({
      where: { professionalId: p.id, startAt: { gte: from, lte: to }, status: { notIn: ['EXPIRED', 'RESCHEDULED', 'PENDING_PAYMENT'] } },
      include: { items: { include: { treatment: { select: { name: true } } } } },
    });
    const count = (pred: (a: (typeof appts)[number]) => boolean) => appts.filter(pred).length;
    const booked = appts
      .filter((a) => ['CONFIRMED', 'COMPLETED', 'NO_SHOW'].includes(a.status))
      .reduce((s, a) => s + (a.endAt.getTime() - a.startAt.getTime()) / 60_000, 0);
    const available = await availableMinutes(p.id, fromIso, toIso);

    const [deposits, credits, alerts] = await Promise.all([
      prisma.payment.aggregate({ where: { professionalId: p.id, status: 'approved', createdAt: { gte: from, lte: to } }, _sum: { amountCents: true } }),
      prisma.creditLedger.aggregate({ where: { professionalId: p.id, amountCents: { gt: 0 }, remainingCents: { gt: 0 }, expiresAt: { gt: now } }, _sum: { remainingCents: true } }),
      prisma.notification.count({
        where: { template: 'turno_disponible', status: { in: ['SENT', 'DELIVERED', 'READ'] }, createdAt: { gte: from, lte: to }, payload: { path: ['professionalId'], equals: p.id } },
      }),
    ]);
    const forfeited = appts
      .filter((a) => a.status === 'NO_SHOW' || late.has(a.id))
      .reduce((s, a) => s + a.depositPaidCents, 0);

    const byTreatment = new Map<string, { name: string; count: number; revenueCents: number }>();
    for (const a of appts.filter((x) => ['CONFIRMED', 'COMPLETED'].includes(x.status))) {
      const key = a.items.map((i) => i.treatment.name).join(' + ');
      const row = byTreatment.get(key) ?? { name: key, count: 0, revenueCents: 0 };
      row.count++;
      row.revenueCents += a.items.reduce((s, i) => s + i.priceCents, 0);
      byTreatment.set(key, row);
    }

    return {
      professional: { id: p.id, displayName: p.displayName },
      occupancy: { bookedMinutes: Math.round(booked), availableMinutes: available, rate: available ? booked / available : 0 },
      activity: {
        completed: count((a) => a.status === 'COMPLETED'),
        upcoming: count((a) => a.status === 'CONFIRMED'),
        noShows: count((a) => a.status === 'NO_SHOW'),
        canceledOnTime: count((a) => a.status === 'CANCELED' && !late.has(a.id) && !a.forcedByOwnerReason),
        canceledLate: count((a) => late.has(a.id)),
        forced: count((a) => Boolean(a.forcedByOwnerReason)),
        firstVisits: count((a) => a.isFirstVisit),
      },
      money: {
        depositsCollectedCents: deposits._sum.amountCents ?? 0,
        depositsForfeitedCents: forfeited,
        creditsOutstandingCents: credits._sum.remainingCents ?? 0,
      },
      waitlistAlertsSent: alerts,
      treatments: [...byTreatment.values()].sort((a, b) => b.count - a.count),
    };
  }));
}

/** Cumplimiento por clienta (últimos 6 meses), para decidir prioridades. */
export async function clientReliability(professionalIds: string[] | null) {
  const since = new Date(Date.now() - 182 * 86_400_000);
  const late = await lateCancelIds(since, new Date());
  const appts = await prisma.appointment.findMany({
    where: {
      startAt: { gte: since, lt: new Date() },
      status: { in: ['COMPLETED', 'NO_SHOW', 'CANCELED'] },
      ...(professionalIds ? { professionalId: { in: professionalIds } } : {}),
    },
    select: { id: true, status: true, clientRecordId: true },
  });
  const rows = new Map<string, { completed: number; noShows: number; lateCancellations: number }>();
  for (const a of appts) {
    const r = rows.get(a.clientRecordId) ?? { completed: 0, noShows: 0, lateCancellations: 0 };
    if (a.status === 'COMPLETED') r.completed++;
    if (a.status === 'NO_SHOW') r.noShows++;
    if (late.has(a.id)) r.lateCancellations++;
    rows.set(a.clientRecordId, r);
  }
  const records = await prisma.clientRecord.findMany({
    where: { id: { in: [...rows.keys()] } },
    select: { id: true, firstName: true, lastName: true, isReliable: true },
  });
  return records
    .map((rec) => {
      const s = rows.get(rec.id)!;
      const total = s.completed + s.noShows + s.lateCancellations;
      return { id: rec.id, name: `${rec.firstName} ${rec.lastName}`, isReliable: rec.isReliable, ...s, rate: total ? s.completed / total : 0 };
    })
    .sort((a, b) => b.rate - a.rate || b.completed - a.completed);
}
