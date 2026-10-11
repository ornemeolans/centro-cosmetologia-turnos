import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { FormError } from '../components/Field';
import { SlotPicker } from '../components/SlotPicker';
import { Check } from '../components/icons';
import { Button, Card, Eyebrow, PageHeader, Panel } from '../components/ui';
import { api, send } from '../lib/api';
import { errorMessage } from '../lib/auth';
import { dateTimeLabel, money } from '../lib/format';
import { lineFor } from '../lib/lines';
import { useBookingStore } from '../stores/booking';

interface Professional { id: string; displayName: string; acceptsOnlineBooking: boolean }
function Step({ n, title, hint }: { n: string; title: string; hint?: string }) {
  return (
    <div className="mb-5">
      <Eyebrow dot="bg-peach">Paso {n}</Eyebrow>
      <h2 className="mt-2 text-[1.6rem]">{title}</h2>
      {hint && <p className="mt-1 text-muted">{hint}</p>}
    </div>
  );
}

interface Treatment { id: string; name: string; description: string | null; durationMin: number; priceCents: number; depositPercent: number; depositCents: number }

/** El enlace de una alerta trae profesional, día y horario firmados; acá solo se leen para preseleccionar. */
function readOffer(token: string | null): { professionalId: string; date: string; start: string } | null {
  if (!token) return null;
  try {
    return JSON.parse(atob(token.split('.')[0].replace(/-/g, '+').replace(/_/g, '/')));
  } catch {
    return null;
  }
}

export function BookingWizard() {
  const [params] = useSearchParams();
  const offerToken = params.get('oferta');
  const offer = useMemo(() => readOffer(offerToken), [offerToken]);
  const navigate = useNavigate();
  const { professionalId, treatmentIds, slotStart, set } = useBookingStore();

  useEffect(() => {
    if (offer) set({ professionalId: offer.professionalId, slotStart: offer.start });
  }, [offer, set]);

  const pros = useQuery({ queryKey: ['professionals'], queryFn: () => api<{ professionals: Professional[] }>('/professionals') });
  const catalog = useQuery({
    queryKey: ['treatments', professionalId],
    queryFn: () => api<{ treatments: Treatment[]; combos: [string, string][] }>(`/professionals/${professionalId}/treatments`),
    enabled: Boolean(professionalId),
  });
  const credits = useQuery({
    queryKey: ['credits'],
    queryFn: () => api<{ credits: { professionalId: string; amountCents: number }[] }>('/me/credits'),
  });

  const combos = new Set((catalog.data?.combos ?? []).map(([a, b]) => [a, b].sort().join(':')));
  const canAdd = (id: string) => treatmentIds.every((t) => combos.has([t, id].sort().join(':')));
  const selected = (catalog.data?.treatments ?? []).filter((t) => treatmentIds.includes(t.id));
  const deposit = selected.reduce((s, t) => s + t.depositCents, 0);
  const credit = Math.min(deposit, credits.data?.credits.find((c) => c.professionalId === professionalId)?.amountCents ?? 0);
  const duration = selected.reduce((s, t) => s + t.durationMin, 0);

  const book = useMutation({
    mutationFn: () =>
      send<{ appointment: { id: string; status: string }; checkoutUrl: string | null }>('/appointments', 'POST', {
        professionalId, treatmentIds, startAt: slotStart, offer: offerToken ?? undefined,
      }),
    onSuccess: ({ appointment, checkoutUrl }) => {
      set({ appointmentId: appointment.id });
      if (checkoutUrl) window.location.assign(checkoutUrl);
      else navigate(`/pago/exito?turno=${appointment.id}`);
    },
  });

  function toggle(id: string) {
    const next = treatmentIds.includes(id) ? treatmentIds.filter((t) => t !== id) : [...treatmentIds, id];
    set({ treatmentIds: next, slotStart: offer ? slotStart : undefined });
  }

  return (
    <div className="space-y-8">
      <PageHeader title="Reservar turno" subtitle={offer ? 'Se liberó un horario: si te sirve, reservalo ahora.' : 'Elegí profesional, tratamiento y horario.'} />

      <Card>
        <Step n="01" title="Profesional" />
        <div className="grid gap-2 sm:grid-cols-3">
          {pros.data?.professionals.map((p) => (
            <button key={p.id} type="button" disabled={!p.acceptsOnlineBooking || Boolean(offer)} aria-pressed={professionalId === p.id}
              onClick={() => set({ professionalId: p.id, treatmentIds: [], slotStart: undefined })}
              className="flex min-h-14 items-center justify-between gap-3 rounded-xl border border-line bg-surface px-4 py-3 text-left transition hover:border-n4 disabled:opacity-50 aria-pressed:border-peach aria-pressed:bg-t4-bg">
              <span>
                <span className="block font-medium text-ink-strong">{p.displayName}</span>
                {!p.acceptsOnlineBooking && <span className="font-mono text-[12px] text-muted">Turnos por WhatsApp</span>}
              </span>
              {professionalId === p.id && <Check className="text-accent-ink" />}
            </button>
          ))}
        </div>
      </Card>

      {professionalId && (
        <Card>
          <Step n="02" title="Tratamiento" hint="Podés sumar más de uno si se pueden combinar." />
          <ul className="grid gap-2">
            {catalog.data?.treatments.map((t) => {
              const checked = treatmentIds.includes(t.id);
              const disabled = !checked && treatmentIds.length > 0 && !canAdd(t.id);
              const line = lineFor(t.id);
              return (
                <li key={t.id}>
                  <label className={`relative flex items-start gap-3 overflow-hidden rounded-xl border py-3.5 pl-5 pr-4 transition ${checked ? `${line.border} ${line.soft}` : 'border-line bg-surface hover:border-n4'} ${disabled ? 'opacity-40' : 'cursor-pointer'}`}>
                    <span className={`absolute inset-y-0 left-0 w-1.5 ${line.band}`} />
                    <input type="checkbox" className="mt-1.5 accent-ink-strong" checked={checked} disabled={disabled} onChange={() => toggle(t.id)} />
                    <span className="flex-1">
                      <span className="block font-medium text-ink-strong">{t.name}</span>
                      {t.description && <span className="block text-sm text-muted">{t.description}</span>}
                      <span className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[12px] text-muted">
                        <span>{t.durationMin} min</span><span>{money(t.priceCents)}</span><span>Seña {t.depositPercent}% · {money(t.depositCents)}</span>
                      </span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {professionalId && treatmentIds.length > 0 && (
        <Card>
          <Step n="03" title="Día y horario" />
          <SlotPicker professionalId={professionalId} treatmentIds={treatmentIds} value={slotStart}
            onChange={(start) => set({ slotStart: start })} initialDate={offer?.date} offer={offerToken ?? undefined}
            minDate={offer?.date} />
        </Card>
      )}

      {slotStart && selected.length > 0 && (
        <Panel>
          <Eyebrow className="text-daisy/70">Resumen</Eyebrow>
          <p className="mt-3 text-[1.9rem] first-letter:uppercase leading-tight text-daisy">{dateTimeLabel(slotStart)}</p>
          <dl className="mt-6 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 border-t border-panel-2 pt-5 font-mono text-[13px]">
            <dt className="text-daisy/60">Tratamiento</dt><dd>{selected.map((t) => t.name).join(' + ')} · {duration} min</dd>
            <dt className="text-daisy/60">Seña</dt><dd>{money(deposit)}</dd>
            {credit > 0 && <><dt className="text-daisy/60">Saldo a favor</dt><dd>− {money(credit)}</dd></>}
            <dt className="text-daisy">A pagar ahora</dt><dd className="text-lg text-golden">{money(deposit - credit)}</dd>
          </dl>
          <p className="mt-5 text-sm text-daisy/65">
            El resto se abona en el local. El horario queda reservado 20 minutos mientras pagás. Podés cambiar o cancelar sin perder la seña hasta 2 días hábiles completos antes del turno.
          </p>
          <FormError>{book.isError ? errorMessage(book.error) : undefined}</FormError>
          <Button className="mt-6 min-h-12 w-full sm:w-auto sm:px-6" disabled={book.isPending} onClick={() => book.mutate()}>
            {deposit - credit > 0 ? 'Pagar seña con Mercado Pago' : 'Confirmar turno'}
          </Button>
        </Panel>
      )}
    </div>
  );
}
