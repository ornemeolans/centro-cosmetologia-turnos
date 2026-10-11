import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { FormError } from '../components/Field';
import { SlotPicker } from '../components/SlotPicker';
import { Button, Card, PageHeader } from '../components/ui';
import { api, send } from '../lib/api';
import { errorMessage } from '../lib/auth';
import { dateTimeLabel, money } from '../lib/format';
import { useBookingStore } from '../stores/booking';

interface Professional { id: string; displayName: string; acceptsOnlineBooking: boolean }
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
        <h2 className="mb-4 text-lg">1. Profesional</h2>
        <div className="grid gap-2 sm:grid-cols-3">
          {pros.data?.professionals.map((p) => (
            <button key={p.id} type="button" disabled={!p.acceptsOnlineBooking || Boolean(offer)} aria-pressed={professionalId === p.id}
              onClick={() => set({ professionalId: p.id, treatmentIds: [], slotStart: undefined })}
              className="rounded-lg border border-line bg-surface px-4 py-3 text-left disabled:opacity-50 aria-pressed:border-ink-strong aria-pressed:bg-sunken">
              <span className="block font-medium text-ink-strong">{p.displayName}</span>
              {!p.acceptsOnlineBooking && <span className="text-xs text-muted">Turnos por WhatsApp</span>}
            </button>
          ))}
        </div>
      </Card>

      {professionalId && (
        <Card>
          <h2 className="mb-1 text-lg">2. Tratamiento</h2>
          <p className="mb-4 text-sm text-muted">Podés sumar más de uno si se pueden combinar.</p>
          <ul className="divide-y divide-line">
            {catalog.data?.treatments.map((t) => {
              const checked = treatmentIds.includes(t.id);
              const disabled = !checked && treatmentIds.length > 0 && !canAdd(t.id);
              return (
                <li key={t.id}>
                  <label className={`flex items-start gap-3 py-3 ${disabled ? 'opacity-40' : 'cursor-pointer'}`}>
                    <input type="checkbox" className="mt-1.5 accent-ink-strong" checked={checked} disabled={disabled} onChange={() => toggle(t.id)} />
                    <span className="flex-1">
                      <span className="block font-medium text-ink-strong">{t.name}</span>
                      {t.description && <span className="block text-sm text-muted">{t.description}</span>}
                      <span className="font-mono text-xs text-muted">{t.durationMin} min · {money(t.priceCents)} · seña {t.depositPercent}% ({money(t.depositCents)})</span>
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
          <h2 className="mb-4 text-lg">3. Día y horario</h2>
          <SlotPicker professionalId={professionalId} treatmentIds={treatmentIds} value={slotStart}
            onChange={(start) => set({ slotStart: start })} initialDate={offer?.date} offer={offerToken ?? undefined}
            minDate={offer?.date} />
        </Card>
      )}

      {slotStart && selected.length > 0 && (
        <Card className="bg-sunken">
          <h2 className="mb-3 text-lg">Resumen</h2>
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm">
            <dt className="text-muted">Cuándo</dt><dd className="capitalize">{dateTimeLabel(slotStart)}</dd>
            <dt className="text-muted">Tratamiento</dt><dd>{selected.map((t) => t.name).join(' + ')} ({duration} min)</dd>
            <dt className="text-muted">Seña</dt><dd>{money(deposit)}</dd>
            {credit > 0 && <><dt className="text-muted">Saldo a favor</dt><dd>− {money(credit)}</dd></>}
            <dt className="font-medium text-ink-strong">A pagar ahora</dt><dd className="font-medium text-ink-strong">{money(deposit - credit)}</dd>
          </dl>
          <p className="mt-3 text-xs text-muted">
            El resto se abona en el local. El horario queda reservado 20 minutos mientras pagás. Podés cambiar o cancelar sin perder la seña hasta 2 días hábiles completos antes del turno.
          </p>
          <FormError>{book.isError ? errorMessage(book.error) : undefined}</FormError>
          <Button className="mt-4 w-full sm:w-auto" disabled={book.isPending} onClick={() => book.mutate()}>
            {deposit - credit > 0 ? 'Pagar seña con Mercado Pago' : 'Confirmar turno'}
          </Button>
        </Card>
      )}
    </div>
  );
}
