import type { Appointment } from '@prisma/client';
import { prisma } from '../db';
import { env } from '../env';
import { getSettings, localDay } from './center';
import { notify } from './notifications';
import { signOffer } from './offers';

/** Un horario que se libera con menos de esto de anticipación cuenta como "último momento". */
const LAST_MINUTE_HOURS = 72;

/**
 * Se liberó un horario (cancelación, reprogramación o reserva vencida): se avisa a la lista de espera
 * y a quienes activaron alertas de último momento. Primero a las clientas cumplidoras; al resto, minutos después.
 */
export async function onSlotFreed(slot: Pick<Appointment, 'professionalId' | 'startAt' | 'endAt' | 'clientRecordId'>, now = new Date()) {
  if (slot.startAt <= now) return;
  const settings = await getSettings();
  const professional = await prisma.professional.findUnique({ where: { id: slot.professionalId } });
  if (!professional?.isActive) return;

  const day = localDay(slot.startAt);
  const dayDate = new Date(`${day}T00:00:00Z`);
  const waitlisted = await prisma.waitlistEntry.findMany({
    where: { professionalId: slot.professionalId, status: 'ACTIVE', dateFrom: { lte: dayDate }, dateTo: { gte: dayDate } },
    select: { clientRecordId: true },
  });
  const lastMinute = slot.startAt.getTime() - now.getTime() <= LAST_MINUTE_HOURS * 3_600_000
    ? await prisma.clientRecord.findMany({
        where: {
          lastMinuteAlerts: true,
          status: 'ACTIVA',
          OR: [{ ownerProfessionalId: slot.professionalId }, { appointments: { some: { professionalId: slot.professionalId } } }],
        },
        select: { id: true },
      })
    : [];

  const ids = new Set([...waitlisted.map((w) => w.clientRecordId), ...lastMinute.map((r) => r.id)]);
  ids.delete(slot.clientRecordId);
  if (ids.size === 0) return;

  const weekAgo = new Date(now.getTime() - 7 * 86_400_000);
  const records = await prisma.clientRecord.findMany({ where: { id: { in: [...ids] }, status: 'ACTIVA' } });
  const token = signOffer({ professionalId: slot.professionalId, date: day, start: slot.startAt.toISOString() });
  const link = `${env.WEB_ORIGIN}/reservar?oferta=${encodeURIComponent(token)}`;

  for (const r of records) {
    const recent = await prisma.notification.count({
      where: { clientRecordId: r.id, template: 'turno_disponible', createdAt: { gte: weekAgo }, status: { not: 'SKIPPED' }, channel: 'WHATSAPP' },
    });
    if (recent >= settings.maxAlertsPerWeek) continue;
    await notify({
      template: 'turno_disponible',
      clientRecordId: r.id,
      payload: {
        professionalId: slot.professionalId,
        professionalName: professional.displayName,
        start: slot.startAt.toISOString(),
        end: slot.endAt.toISOString(),
        link,
      },
      // Prioridad: las cumplidoras reciben el aviso primero.
      scheduledFor: r.isReliable ? now : new Date(now.getTime() + settings.waitlistPriorityMin * 60_000),
    });
  }
}
