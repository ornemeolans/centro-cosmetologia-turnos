import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../lib/api';
import { errorMessage } from '../lib/auth';
import { addDays, isoDay, shortDay, timeLabel } from '../lib/format';
import { FormError } from './Field';

interface SlotDto {
  start: string;
  end: string;
  adjacent: boolean;
}

/** Elegir día y horario libre (los horarios ya vienen encadenados desde la API). */
export function SlotPicker({
  professionalId, treatmentIds, value, onChange, initialDate, offer, minDate,
}: {
  professionalId: string;
  treatmentIds: string[];
  value?: string;
  onChange: (start: string) => void;
  initialDate?: string;
  offer?: string;
  minDate?: string;
}) {
  const first = minDate ?? isoDay();
  const [date, setDate] = useState(initialDate ?? addDays(isoDay(), 1));
  // Siete días alrededor del elegido, sin mostrar días anteriores al mínimo.
  const windowStart = addDays(date, -3) < first ? first : addDays(date, -3);
  const days = Array.from({ length: 7 }, (_, i) => addDays(windowStart, i));

  const enabled = treatmentIds.length > 0;
  const { data, isLoading, error } = useQuery({
    queryKey: ['availability', professionalId, treatmentIds.join(','), date, offer ?? ''],
    queryFn: () =>
      api<{ slots: SlotDto[]; durationMin: number }>(
        `/availability?professionalId=${professionalId}&treatmentIds=${treatmentIds.join(',')}&date=${date}${offer ? `&offer=${encodeURIComponent(offer)}` : ''}`,
      ),
    enabled,
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {/* `relative` contiene a los elementos absolutos: si no, en el celular ensanchan toda la página. */}
        <div className="relative flex min-w-0 flex-1 gap-2 overflow-x-auto pb-1" role="group" aria-label="Días">
          {days.map((d) => (
            <button key={d} type="button" onClick={() => setDate(d)} aria-pressed={d === date} disabled={d < first}
              className="min-w-16 rounded-md border border-line bg-surface px-2 py-1.5 text-center text-xs capitalize disabled:opacity-40 aria-pressed:border-ink-strong aria-pressed:bg-ink-strong aria-pressed:text-white">
              {shortDay(`${d}T12:00:00-03:00`)}
            </button>
          ))}
        </div>
        <label className="relative shrink-0 text-xs text-muted">
          <span className="sr-only">Otro día</span>
          <input type="date" value={date} min={first} onChange={(e) => e.target.value && setDate(e.target.value)}
            className="rounded-md border border-line bg-surface px-2 py-1" />
        </label>
      </div>

      {!enabled && <p className="text-sm text-muted">Elegí al menos un tratamiento para ver horarios.</p>}
      {isLoading && enabled && <p className="text-sm text-muted">Buscando horarios…</p>}
      <FormError>{error ? errorMessage(error) : undefined}</FormError>
      {data && data.slots.length === 0 && <p className="text-sm text-muted">No hay horarios libres ese día. Probá con otro.</p>}
      {data && data.slots.length > 0 && (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-6" aria-label="Horarios disponibles">
          {data.slots.map((s) => (
            <li key={s.start}>
              <button type="button" onClick={() => onChange(s.start)} aria-pressed={value === s.start}
                className="w-full rounded-md border border-line bg-surface px-2 py-2 font-mono text-sm hover:border-ink/30 aria-pressed:border-ink-strong aria-pressed:bg-ink-strong aria-pressed:text-white">
                {timeLabel(s.start)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
