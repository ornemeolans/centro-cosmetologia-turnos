const zone = 'America/Argentina/Buenos_Aires';

const dayFmt = new Intl.DateTimeFormat('es-AR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: zone });
const shortDayFmt = new Intl.DateTimeFormat('es-AR', { weekday: 'short', day: 'numeric', month: 'numeric', timeZone: zone });
const timeFmt = new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: zone });
const isoFmt = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: zone });

export const dayLabel = (d: string | Date) => dayFmt.format(new Date(d));
export const shortDay = (d: string | Date) => shortDayFmt.format(new Date(d));
export const timeLabel = (d: string | Date) => timeFmt.format(new Date(d));
export const dateTimeLabel = (d: string | Date) => `${dayLabel(d)}, ${timeLabel(d)}`;

/** 'yyyy-MM-dd' en la zona del centro. */
export const isoDay = (d: Date = new Date()) => isoFmt.format(d);
export const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00-03:00`);
  d.setUTCDate(d.getUTCDate() + n);
  return isoDay(d);
};

export const money = (cents: number) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(cents / 100);

export const weekdays = ['', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

export const statusLabel: Record<string, { text: string; tone: 'gray' | 'red' | 'blue' | 'green' | 'yellow' }> = {
  PENDING_PAYMENT: { text: 'Falta la seña', tone: 'yellow' },
  CONFIRMED: { text: 'Confirmado', tone: 'green' },
  COMPLETED: { text: 'Realizado', tone: 'blue' },
  NO_SHOW: { text: 'Ausente', tone: 'red' },
  CANCELED: { text: 'Cancelado', tone: 'gray' },
  EXPIRED: { text: 'Vencido', tone: 'gray' },
  RESCHEDULED: { text: 'Reprogramado', tone: 'gray' },
};
