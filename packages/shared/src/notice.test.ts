import { describe, expect, it } from 'vitest';
import { modifyDeadline, modifyRules, type NoticeConfig } from './notice';

// Lunes a viernes de 9 a 18 (decisión del centro).
const weekdays = { open: '09:00', close: '18:00' };
const cfg: NoticeConfig = {
  centerHours: { 1: weekdays, 2: weekdays, 3: weekdays, 4: weekdays, 5: weekdays },
  holidays: new Set(),
};

// Buenos Aires = UTC-3 todo el año: 18:00 local = 21:00Z.
const local = (iso: string) => new Date(`${iso}-03:00`);

describe('modifyDeadline (48 h hábiles = 2 días hábiles completos)', () => {
  it('turno el lunes → miércoles anterior al cierre', () => {
    expect(modifyDeadline(local('2026-11-09T10:00:00'), cfg)).toEqual(local('2026-11-04T18:00:00'));
    expect(modifyDeadline(local('2026-11-09T17:00:00'), cfg)).toEqual(local('2026-11-04T18:00:00'));
  });

  it('turno el miércoles → viernes anterior al cierre', () => {
    expect(modifyDeadline(local('2026-11-11T15:00:00'), cfg)).toEqual(local('2026-11-06T18:00:00'));
  });

  it('turno el viernes → martes de esa semana al cierre', () => {
    expect(modifyDeadline(local('2026-11-13T09:00:00'), cfg)).toEqual(local('2026-11-10T18:00:00'));
  });

  it('un feriado no cuenta como día hábil', () => {
    const withHoliday = { ...cfg, holidays: new Set(['2026-11-10']) };
    expect(modifyDeadline(local('2026-11-12T11:00:00'), withHoliday)).toEqual(local('2026-11-06T18:00:00'));
  });

  it('si el centro cambia su horario, la regla se ajusta sola', () => {
    const withSaturday = { ...cfg, centerHours: { ...cfg.centerHours, 6: { open: '09:00', close: '13:00' } } };
    // Turno el lunes 9/11: hábiles anteriores = sáb 7 (1), vie 6 (2), jue 5 (3).
    expect(modifyDeadline(local('2026-11-09T10:00:00'), withSaturday)).toEqual(local('2026-11-05T18:00:00'));
  });
});

describe('modifyRules', () => {
  const startAt = local('2026-11-09T10:00:00');

  it('dentro del plazo se puede reprogramar hasta 2 veces', () => {
    const r = modifyRules({ now: local('2026-11-04T17:59:00'), startAt, rescheduleCount: 1 }, cfg);
    expect(r).toMatchObject({ onTime: true, canReschedule: true, reschedulesLeft: 1, lateCancelForfeitsDeposit: false });
  });

  it('con 2 reprogramaciones solo queda cancelar', () => {
    const r = modifyRules({ now: local('2026-11-02T10:00:00'), startAt, rescheduleCount: 2 }, cfg);
    expect(r).toMatchObject({ onTime: true, canReschedule: false, reschedulesLeft: 0 });
  });

  it('fuera del plazo no se reprograma y cancelar pierde la seña', () => {
    const r = modifyRules({ now: local('2026-11-04T18:01:00'), startAt, rescheduleCount: 0 }, cfg);
    expect(r).toMatchObject({ onTime: false, canReschedule: false, lateCancelForfeitsDeposit: true });
  });
});
