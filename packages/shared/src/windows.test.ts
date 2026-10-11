import { describe, expect, it } from 'vitest';
import { dayWorkWindows } from './windows';

const weekly = [{ start: '09:00', end: '13:00' }, { start: '14:00', end: '18:00' }];

describe('dayWorkWindows', () => {
  it('sin excepciones devuelve la agenda semanal', () => {
    expect(dayWorkWindows(weekly, [], false)).toEqual(weekly);
  });

  it('un bloqueo parcial recorta la franja', () => {
    expect(dayWorkWindows(weekly, [{ type: 'BLOCK', start: '10:00', end: '11:30' }], false)).toEqual([
      { start: '09:00', end: '10:00' },
      { start: '11:30', end: '13:00' },
      { start: '14:00', end: '18:00' },
    ]);
  });

  it('un bloqueo sin horario anula el día', () => {
    expect(dayWorkWindows(weekly, [{ type: 'BLOCK' }], false)).toEqual([]);
  });

  it('una franja extra se suma y se une con la existente', () => {
    expect(dayWorkWindows(weekly, [{ type: 'EXTRA', start: '13:00', end: '14:00' }], false)).toEqual([{ start: '09:00', end: '18:00' }]);
  });

  it('un feriado vacía la agenda, salvo franjas extra', () => {
    expect(dayWorkWindows(weekly, [], true)).toEqual([]);
    expect(dayWorkWindows(weekly, [{ type: 'EXTRA', start: '10:00', end: '12:00' }], true)).toEqual([{ start: '10:00', end: '12:00' }]);
  });
});
