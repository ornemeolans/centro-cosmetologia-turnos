import { describe, expect, it } from 'vitest';
import { blockedUntil, computeSlots } from './availability';

const local = (iso: string) => new Date(`${iso}-03:00`);
const hhmm = (d: Date) =>
  d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Argentina/Buenos_Aires' });

const base = { date: '2026-11-09', windows: [{ start: '09:00', end: '13:00' }], bufferMin: 15 };

describe('computeSlots (horarios encadenados)', () => {
  it('el siguiente horario empieza al terminar el turno anterior + buffer', () => {
    const facial = local('2026-11-09T09:00:00');
    const slots = computeSlots({
      ...base,
      durationMin: 45,
      busy: [{ start: facial, end: blockedUntil(facial, 60, 15) }],
    });
    expect(hhmm(slots[0].start)).toBe('10:15');
    expect(slots[0].adjacent).toBe(true);
    expect(hhmm(slots.at(-1)!.start)).toBe('12:15'); // 12:15 + 45 = 13:00, cierre de la franja
    expect(slots).toHaveLength(9);
  });

  it('si el hueco termina en otro turno, también tiene que entrar el buffer', () => {
    const a = local('2026-11-09T09:00:00');
    const b = local('2026-11-09T11:15:00');
    const slots = computeSlots({
      ...base,
      durationMin: 45,
      busy: [
        { start: a, end: blockedUntil(a, 60, 15) }, // hasta 10:15
        { start: b, end: blockedUntil(b, 45, 15) }, // 11:15–12:15
      ],
    });
    expect(slots.map((s) => hhmm(s.start))).toEqual(['10:15', '12:15']);
  });

  it('respeta la anticipación mínima', () => {
    const slots = computeSlots({ ...base, durationMin: 60, busy: [], notBefore: local('2026-11-09T11:00:00') });
    expect(hhmm(slots[0].start)).toBe('11:00');
  });

  it('un combo usa la suma de duraciones', () => {
    const slots = computeSlots({ ...base, durationMin: 60 + 45, busy: [] });
    expect(hhmm(slots.at(-1)!.start)).toBe('11:15');
  });
});
