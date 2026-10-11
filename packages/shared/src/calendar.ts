export interface CalendarEvent {
  uid: string;
  /** Aumenta con cada cambio: los calendarios reemplazan el evento con el mismo UID. */
  sequence: number;
  title: string;
  description: string;
  location: string;
  start: Date;
  end: Date;
  canceled?: boolean;
}

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

/** Texto según RFC 5545: escapa \ ; , y saltos de línea, y corta líneas a 75 caracteres. */
function escape(text: string) {
  return text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

function fold(line: string) {
  const parts: string[] = [];
  for (let i = 0; i < line.length; i += 74) parts.push((i === 0 ? '' : ' ') + line.slice(i, i + 74));
  return parts.join('\r\n');
}

export function buildIcs(e: CalendarEvent, now = new Date()): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Centro de Cosmetologia//Turnos//ES',
    'CALSCALE:GREGORIAN',
    `METHOD:${e.canceled ? 'CANCEL' : 'PUBLISH'}`,
    'BEGIN:VEVENT',
    `UID:${e.uid}`,
    `SEQUENCE:${e.sequence}`,
    `DTSTAMP:${stamp(now)}`,
    `DTSTART:${stamp(e.start)}`,
    `DTEND:${stamp(e.end)}`,
    `SUMMARY:${escape(e.title)}`,
    `DESCRIPTION:${escape(e.description)}`,
    `LOCATION:${escape(e.location)}`,
    `STATUS:${e.canceled ? 'CANCELLED' : 'CONFIRMED'}`,
    ...(e.canceled ? [] : ['BEGIN:VALARM', 'TRIGGER:-PT2H', 'ACTION:DISPLAY', `DESCRIPTION:${escape(e.title)}`, 'END:VALARM']),
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.map(fold).join('\r\n') + '\r\n';
}

/** Enlace "Agregar a Google Calendar" (plantilla: no pide permisos a la clienta). */
export function googleCalendarUrl(e: CalendarEvent): string {
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: e.title,
    dates: `${stamp(e.start)}/${stamp(e.end)}`,
    details: e.description,
    location: e.location,
    ctz: 'America/Argentina/Buenos_Aires',
  });
  return `https://calendar.google.com/calendar/render?${params}`;
}
