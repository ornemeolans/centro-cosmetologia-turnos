import { DateTime } from 'luxon';
import { CENTER_ZONE, type CenterHours, type Weekday } from './types';

export interface NoticeConfig {
  centerHours: CenterHours;
  /** Feriados en formato ISO 'yyyy-MM-dd'. */
  holidays: ReadonlySet<string>;
  /** Días hábiles completos que tienen que quedar entre el cambio y el día del turno (center_settings.notice_business_days). */
  noticeBusinessDays?: number;
  zone?: string;
}

export function isBusinessDay(day: DateTime, cfg: NoticeConfig): boolean {
  return Boolean(cfg.centerHours[day.weekday as Weekday]) && !cfg.holidays.has(day.toISODate()!);
}

/**
 * Momento límite para reprogramar o cancelar sin perder la seña:
 * cierre del centro del (noticeBusinessDays + 1)-ésimo día hábil anterior al día del turno.
 * Con 2 días: turno el lunes → miércoles anterior al cierre.
 */
export function modifyDeadline(startAt: Date, cfg: NoticeConfig): Date {
  const zone = cfg.zone ?? CENTER_ZONE;
  const target = (cfg.noticeBusinessDays ?? 2) + 1;
  let day = DateTime.fromJSDate(startAt, { zone }).startOf('day');
  let counted = 0;
  let guard = 0;
  while (counted < target) {
    if (++guard > 366) throw new Error('No hay días hábiles configurados en center_hours');
    day = day.minus({ days: 1 });
    if (isBusinessDay(day, cfg)) counted++;
  }
  const [hour, minute] = cfg.centerHours[day.weekday as Weekday]!.close.split(':').map(Number);
  return day.set({ hour, minute, second: 0, millisecond: 0 }).toJSDate();
}

export interface ModifyRulesInput {
  now: Date;
  startAt: Date;
  rescheduleCount: number;
  maxReschedules?: number;
}

export interface ModifyRules {
  deadline: Date;
  /** Dentro del plazo: cancelar deja la seña como saldo a favor. */
  onTime: boolean;
  canReschedule: boolean;
  reschedulesLeft: number;
  /** Fuera del plazo la clienta puede cancelar, pero pierde la seña. */
  lateCancelForfeitsDeposit: boolean;
}

export function modifyRules(input: ModifyRulesInput, cfg: NoticeConfig): ModifyRules {
  const max = input.maxReschedules ?? 2;
  const deadline = modifyDeadline(input.startAt, cfg);
  const onTime = input.now.getTime() <= deadline.getTime();
  const reschedulesLeft = Math.max(0, max - input.rescheduleCount);
  return {
    deadline,
    onTime,
    canReschedule: onTime && reschedulesLeft > 0,
    reschedulesLeft,
    lateCancelForfeitsDeposit: !onTime,
  };
}
