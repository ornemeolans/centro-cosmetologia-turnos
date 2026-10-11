import { DateTime } from 'luxon';
import { CENTER_ZONE } from './types';

export interface Interval {
  start: Date;
  end: Date;
}

export interface AvailabilityInput {
  /** Día a calcular, 'yyyy-MM-dd' en la zona del centro. */
  date: string;
  /** Ventanas de trabajo de la profesional ese día ('HH:mm'), ya con excepciones BLOCK/EXTRA y feriados aplicados. */
  windows: { start: string; end: string }[];
  /** Turnos activos de la profesional: [start_at, blocked_until). blocked_until ya incluye el buffer. */
  busy: Interval[];
  /** Suma de duraciones de los tratamientos elegidos (un tratamiento o un combo). */
  durationMin: number;
  /** Tiempo entre turnos (center_settings.buffer_min). */
  bufferMin: number;
  stepMin?: number;
  /** Anticipación mínima / máxima ya resueltas como instantes. */
  notBefore?: Date;
  notAfter?: Date;
  zone?: string;
}

export interface Slot {
  start: Date;
  end: Date;
  /** Pegado al final de un turno existente: la UI lo muestra primero para evitar huecos sueltos. */
  adjacent: boolean;
}

interface Gap {
  start: DateTime;
  end: DateTime;
  startsAfterBusy: boolean;
  endsAtBusy: boolean;
}

/**
 * Horarios libres encadenados: el primer candidato de cada hueco es su inicio exacto
 * (fin del turno anterior + buffer); los siguientes, cada `stepMin` minutos.
 */
export function computeSlots(input: AvailabilityInput): Slot[] {
  const zone = input.zone ?? CENTER_ZONE;
  const step = input.stepMin ?? 15;
  const day = DateTime.fromISO(input.date, { zone });
  const at = (hhmm: string) => {
    const [hour, minute] = hhmm.split(':').map(Number);
    return day.set({ hour, minute, second: 0, millisecond: 0 });
  };

  const busy = input.busy
    .map((b) => ({ start: DateTime.fromJSDate(b.start, { zone }), end: DateTime.fromJSDate(b.end, { zone }) }))
    .sort((a, b) => a.start.toMillis() - b.start.toMillis());

  const gaps: Gap[] = [];
  for (const w of input.windows) {
    let cursor = at(w.start);
    let afterBusy = false;
    const windowEnd = at(w.end);
    for (const b of busy) {
      if (b.end <= cursor || b.start >= windowEnd) continue;
      if (b.start > cursor) gaps.push({ start: cursor, end: b.start, startsAfterBusy: afterBusy, endsAtBusy: true });
      if (b.end > cursor) {
        cursor = b.end;
        afterBusy = true;
      }
    }
    if (cursor < windowEnd) gaps.push({ start: cursor, end: windowEnd, startsAfterBusy: afterBusy, endsAtBusy: false });
  }

  const slots: Slot[] = [];
  for (const gap of gaps) {
    // Si el hueco termina en otro turno, el buffer también tiene que entrar; si termina en el cierre de la franja, no.
    const needed = input.durationMin + (gap.endsAtBusy ? input.bufferMin : 0);
    for (let s = gap.start; s.plus({ minutes: needed }) <= gap.end; s = s.plus({ minutes: step })) {
      if (input.notBefore && s.toJSDate() < input.notBefore) continue;
      if (input.notAfter && s.toJSDate() > input.notAfter) continue;
      slots.push({
        start: s.toJSDate(),
        end: s.plus({ minutes: input.durationMin }).toJSDate(),
        adjacent: gap.startsAfterBusy && s.equals(gap.start),
      });
    }
  }
  return slots;
}

/** blocked_until = fin del turno + buffer: es el rango que protege la restricción EXCLUDE. */
export function blockedUntil(startAt: Date, durationMin: number, bufferMin: number): Date {
  return new Date(startAt.getTime() + (durationMin + bufferMin) * 60_000);
}
