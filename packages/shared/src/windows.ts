/** Rango horario del día en 'HH:mm'. */
export interface TimeRange {
  start: string;
  end: string;
}

export interface DayException {
  type: 'BLOCK' | 'EXTRA';
  /** Sin horario = día completo (solo tiene sentido en BLOCK). */
  start?: string | null;
  end?: string | null;
}

function merge(ranges: TimeRange[]): TimeRange[] {
  const sorted = [...ranges].sort((a, b) => a.start.localeCompare(b.start));
  const out: TimeRange[] = [];
  for (const r of sorted) {
    const last = out.at(-1);
    if (last && r.start <= last.end) last.end = r.end > last.end ? r.end : last.end;
    else out.push({ ...r });
  }
  return out;
}

function subtract(ranges: TimeRange[], cut: TimeRange): TimeRange[] {
  return ranges.flatMap((r) => {
    if (cut.end <= r.start || cut.start >= r.end) return [r];
    const parts: TimeRange[] = [];
    if (cut.start > r.start) parts.push({ start: r.start, end: cut.start });
    if (cut.end < r.end) parts.push({ start: cut.end, end: r.end });
    return parts;
  });
}

/**
 * Franjas de trabajo de una profesional en un día concreto:
 * agenda semanal (vacía si es feriado) + franjas EXTRA − bloqueos BLOCK.
 */
export function dayWorkWindows(weekly: TimeRange[], exceptions: DayException[], isHoliday: boolean): TimeRange[] {
  let ranges = isHoliday ? [] : weekly.map((w) => ({ ...w }));
  for (const e of exceptions) {
    if (e.type === 'EXTRA' && e.start && e.end) ranges.push({ start: e.start, end: e.end });
  }
  ranges = merge(ranges);
  for (const e of exceptions) {
    if (e.type !== 'BLOCK') continue;
    ranges = e.start && e.end ? subtract(ranges, { start: e.start, end: e.end }) : [];
  }
  return ranges;
}
