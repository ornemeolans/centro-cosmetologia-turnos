import { buildIcs, googleCalendarUrl, type CalendarEvent } from '@turnos/shared';
import { env } from '../env';
import { money } from '../lib/format';
import type { AppointmentFull } from './appointments';

export function eventFor(a: AppointmentFull): CalendarEvent {
  const treatments = a.items.map((i) => i.treatment.name).join(' + ');
  const total = a.items.reduce((s, i) => s + i.priceCents, 0);
  return {
    uid: `${a.icsUid}@turnos`,
    sequence: a.version,
    title: `${treatments} con ${a.professional.displayName}`,
    description:
      `${env.CENTER_NAME}\n` +
      (a.depositPaidCents > 0 ? `Seña pagada: ${money(a.depositPaidCents)}. Resto a abonar en el local: ${money(total - a.depositPaidCents)}.\n` : '') +
      `Mis turnos: ${env.WEB_ORIGIN}/mis-turnos`,
    location: env.CENTER_ADDRESS || env.CENTER_NAME,
    start: a.startAt,
    end: a.endAt,
    canceled: a.status === 'CANCELED',
  };
}

export function calendarLinks(a: AppointmentFull) {
  const event = eventFor(a);
  return { googleUrl: googleCalendarUrl(event), ics: buildIcs(event) };
}
