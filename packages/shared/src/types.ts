export const CENTER_ZONE = 'America/Argentina/Buenos_Aires';

/** Luxon weekday: 1 = lunes … 7 = domingo. */
export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

/** Horas en formato 'HH:mm', hora local del centro. */
export interface DayHours {
  open: string;
  close: string;
}

/** Horario del centro (tabla center_hours). Un día sin entrada = cerrado = no hábil. */
export type CenterHours = Partial<Record<Weekday, DayHours>>;

export type Role = 'CLIENT' | 'PROFESSIONAL' | 'RECEPTION' | 'OWNER';

export type AppointmentStatus =
  | 'PENDING_PAYMENT'
  | 'CONFIRMED'
  | 'COMPLETED'
  | 'NO_SHOW'
  | 'EXPIRED'
  | 'CANCELED'
  | 'RESCHEDULED';

export type ClientRecordStatus = 'PRIMERA_VEZ' | 'ACTIVA';
