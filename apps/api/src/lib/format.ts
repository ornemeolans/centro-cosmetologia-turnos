import { CENTER_ZONE } from '@turnos/shared';
import { DateTime } from 'luxon';

const local = (d: Date) => DateTime.fromJSDate(d, { zone: CENTER_ZONE }).setLocale('es-AR');

/** "lunes 9/11" */
export const dayLabel = (d: Date) => local(d).toFormat("cccc d/M");
/** "10:00" */
export const timeLabel = (d: Date) => local(d).toFormat('HH:mm');
/** "lunes 9/11 a las 10:00" */
export const dateTimeLabel = (d: Date) => `${dayLabel(d)} a las ${timeLabel(d)}`;
/** "$ 12.500" (centavos → pesos) */
export const money = (cents: number) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(cents / 100);
