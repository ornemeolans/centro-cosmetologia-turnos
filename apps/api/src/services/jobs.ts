import { CENTER_ZONE, isReliableClient } from '@turnos/shared';
import { DateTime } from 'luxon';
import { prisma } from '../db';
import { rulesFor } from './appointments';
import { getSettings } from './center';
import { expireCredits } from './credits';
import { dispatchDue, notifyOnce } from './notifications';
import { processWebhookEvent, reconcilePending, refreshExpiringTokens } from './payments';
import { storage } from './storage';
import { onSlotFreed } from './waitlist';

/** Hora local desde la que se manda el aviso de "hoy vence el plazo". */
const NOTICE_HOUR = 9;

/** Una pasada de todas las tareas periódicas. La llama cron-job.org cada 5 minutos. */
export async function runTick(now = new Date()) {
  const report: Record<string, number> = {};

  // 1. Reservas sin pagar que vencieron: liberan el horario y avisan a la lista de espera.
  const stale = await prisma.appointment.findMany({ where: { status: 'PENDING_PAYMENT', holdExpiresAt: { lt: now } } });
  for (const a of stale) {
    const { count } = await prisma.appointment.updateMany({ where: { id: a.id, status: 'PENDING_PAYMENT' }, data: { status: 'EXPIRED' } });
    if (count) await onSlotFreed(a, now);
  }
  report.holdsExpired = stale.length;

  // 2. Saldos a favor vencidos.
  report.creditsExpired = await expireCredits(now);

  // 3. Recordatorio 24 h antes (con botones Confirmo / Cancelo).
  const tomorrow = await prisma.appointment.findMany({
    where: { status: 'CONFIRMED', startAt: { gte: new Date(now.getTime() + 23 * 3_600_000), lte: new Date(now.getTime() + 25 * 3_600_000) } },
    select: { id: true },
  });
  report.reminders = 0;
  for (const a of tomorrow) if (await notifyOnce('recordatorio_turno', a.id)) report.reminders++;

  // 4. "Hoy vence el plazo para cambios": la mañana del día del vencimiento.
  const local = DateTime.fromJSDate(now, { zone: CENTER_ZONE });
  report.deadlineNotices = 0;
  if (local.hour >= NOTICE_HOUR) {
    const upcoming = await prisma.appointment.findMany({
      where: { status: 'CONFIRMED', startAt: { gt: now, lte: new Date(now.getTime() + 14 * 86_400_000) } },
    });
    for (const a of upcoming) {
      const { deadline } = await rulesFor(a, now);
      const deadlineDay = DateTime.fromJSDate(deadline, { zone: CENTER_ZONE }).toISODate();
      if (deadlineDay === local.toISODate() && now < deadline) {
        if (await notifyOnce('aviso_plazo', a.id, { deadline: deadline.toISOString() })) report.deadlineNotices++;
      }
    }
  }

  // 5. Envío de avisos pendientes (incluye reintentos y la segunda ronda de la lista de espera).
  report.notificationsSent = await dispatchDue(now);

  // 6. Webhooks de Mercado Pago que fallaron al procesarse.
  const failed = await prisma.webhookEvent.findMany({
    where: { processedAt: null, attempts: { lt: 10 }, createdAt: { gt: new Date(now.getTime() - 3 * 86_400_000) } },
    take: 20,
  });
  for (const e of failed) await processWebhookEvent(e.id);
  report.webhooksRetried = failed.length;

  // 7. Conciliación de pagos (por si un webhook nunca llegó).
  await reconcilePending();

  // 8. Una vez por día.
  report.daily = (await runDailyIfDue(now)) ? 1 : 0;
  return report;
}

async function runDailyIfDue(now: Date): Promise<boolean> {
  const settings = await getSettings();
  const today = DateTime.fromJSDate(now, { zone: CENTER_ZONE }).toISODate();
  const last = settings.lastDailyJobAt ? DateTime.fromJSDate(settings.lastDailyJobAt, { zone: CENTER_ZONE }).toISODate() : null;
  if (last === today) return false;
  // Se marca primero para que dos ticks simultáneos no la corran dos veces.
  const { count } = await prisma.centerSettings.updateMany({
    where: { id: 1, OR: [{ lastDailyJobAt: null }, { lastDailyJobAt: settings.lastDailyJobAt }] },
    data: { lastDailyJobAt: now },
  });
  if (count === 0) return false;

  await refreshExpiringTokens();
  await recomputeReliability(now);
  await purgeExpiredRecords(now);
  return true;
}

/** Clienta cumplidora: últimos 6 meses, umbrales editables por la OWNER. */
export async function recomputeReliability(now = new Date()) {
  const settings = await getSettings();
  const since = new Date(now.getTime() - 182 * 86_400_000);
  const rows = await prisma.appointment.groupBy({
    by: ['clientRecordId', 'status'],
    where: { startAt: { gte: since, lt: now }, status: { in: ['COMPLETED', 'NO_SHOW', 'CANCELED'] } },
    _count: true,
  });
  const late = await prisma.auditLog.findMany({
    where: { entity: 'appointment', action: 'CANCEL', createdAt: { gte: since }, diff: { path: ['outcome'], equals: 'FORFEIT' } },
    select: { entityId: true },
  });
  const lateAppts = await prisma.appointment.findMany({ where: { id: { in: late.map((l) => l.entityId) } }, select: { clientRecordId: true } });

  const stats = new Map<string, { completed: number; noShows: number; lateCancellations: number }>();
  const get = (id: string) => stats.get(id) ?? stats.set(id, { completed: 0, noShows: 0, lateCancellations: 0 }).get(id)!;
  for (const r of rows) {
    if (r.status === 'COMPLETED') get(r.clientRecordId).completed += r._count;
    if (r.status === 'NO_SHOW') get(r.clientRecordId).noShows += r._count;
  }
  for (const a of lateAppts) get(a.clientRecordId).lateCancellations++;

  const thresholds = { minAppointments: settings.reliableMinVisits, minCompletionRate: settings.reliableMinRate };
  const reliable: string[] = [];
  for (const [id, s] of stats) {
    const confirmed = s.completed + s.noShows + s.lateCancellations;
    if (isReliableClient({ ...s, confirmed }, thresholds)) reliable.push(id);
  }
  await prisma.$transaction([
    prisma.clientRecord.updateMany({ where: { isReliable: true, id: { notIn: reliable } }, data: { isReliable: false } }),
    prisma.clientRecord.updateMany({ where: { id: { in: reliable } }, data: { isReliable: true } }),
  ]);
  return reliable.length;
}

/**
 * Retención (Ley 25.326): pasados 2 años del último turno se borran la historia clínica, las fotos y las
 * recomendaciones. Se conservan los datos de contacto y los turnos (registro contable de señas).
 */
export async function purgeExpiredRecords(now = new Date()) {
  const expired = await prisma.clientRecord.findMany({ where: { retentionUntil: { lt: now } } });
  for (const r of expired) {
    const future = await prisma.appointment.count({ where: { clientRecordId: r.id, startAt: { gt: now } } });
    if (future > 0) continue;
    const photos = await prisma.recordPhoto.findMany({ where: { clientRecordId: r.id } });
    await storage.remove(photos.map((p) => p.storagePath));
    await prisma.$transaction([
      prisma.recordPhoto.deleteMany({ where: { clientRecordId: r.id } }),
      prisma.recordEntry.deleteMany({ where: { clientRecordId: r.id } }),
      prisma.recommendation.deleteMany({ where: { clientRecordId: r.id } }),
      prisma.clientRecord.update({
        where: { id: r.id },
        data: { antecedentes: null, alergias: null, medicacion: null, skinType: null, birthDate: null, retentionUntil: null },
      }),
      prisma.auditLog.create({ data: { entity: 'client_record', entityId: r.id, action: 'RETENTION_PURGE' } }),
    ]);
  }
  return expired.length;
}
