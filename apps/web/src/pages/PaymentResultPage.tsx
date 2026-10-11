import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { StatusCard } from '../components/AuthShell';
import { ArrowRight, Check, Close } from '../components/icons';
import { api } from '../lib/api';
import { dateTimeLabel } from '../lib/format';
import { useBookingStore } from '../stores/booking';
import type { ApptDto } from './ClientDashboard';

/** Vuelta desde Mercado Pago. Lo que confirma el turno es el webhook: acá solo se espera a verlo confirmado. */
export function PaymentResultPage() {
  const { status } = useParams();
  const [params] = useSearchParams();
  const id = params.get('turno');
  const reset = useBookingStore((s) => s.reset);
  const [timedOut, setTimedOut] = useState(false);

  const { data } = useQuery({
    queryKey: ['appointment', id],
    queryFn: () => api<{ appointment: ApptDto }>(`/appointments/${id}`),
    enabled: Boolean(id),
    refetchInterval: (q) => (q.state.data?.appointment.status === 'CONFIRMED' || timedOut ? false : 2000),
  });
  useEffect(() => {
    const t = setTimeout(() => setTimedOut(true), 60_000);
    return () => clearTimeout(t);
  }, []);
  const confirmed = data?.appointment.status === 'CONFIRMED';
  useEffect(() => {
    if (confirmed) reset();
  }, [confirmed, reset]);

  if (status === 'error') {
    return (
      <StatusCard tone="error" icon={<Close />} eyebrow="Mercado Pago" title="El pago no se completó"
        text="No se cobró nada. Podés intentarlo de nuevo mientras dure la reserva.">
        <Link to="/mis-turnos" className="inline-flex min-h-12 items-center justify-center gap-2.5 rounded-lg border border-line bg-surface px-5 font-medium text-ink-strong transition hover:border-n4">Volver a mis turnos</Link>
      </StatusCard>
    );
  }
  return (
    confirmed ? (
      <StatusCard tone="ok" icon={<Check />} eyebrow="Seña acreditada" title="¡Turno confirmado!"
        text={<>Te esperamos el <span className="text-ink-strong">{dateTimeLabel(data!.appointment.startAt).toLowerCase()}</span>. Te mandamos la confirmación por WhatsApp y desde tus turnos lo podés sumar al calendario.</>}>
        <Link to="/mis-turnos" className="inline-flex min-h-12 items-center justify-center gap-2.5 rounded-lg bg-peach px-5 font-medium text-n8 transition hover:bg-[#b07a7d] active:scale-[0.98]">Ver mis turnos <ArrowRight /></Link>
      </StatusCard>
    ) : timedOut || status === 'pendiente' ? (
      <StatusCard tone="wait" icon={<span className="font-mono text-xl">…</span>} eyebrow="Mercado Pago" title="Estamos esperando la confirmación del pago"
        text="Apenas Mercado Pago lo acredite te avisamos por WhatsApp. No hace falta que pagues de nuevo." />
    ) : (
      <StatusCard icon={<span className="size-6 animate-spin rounded-full border-2 border-n4 border-t-peach motion-reduce:animate-none" />} eyebrow="Mercado Pago"
        title="Confirmando tu pago…" text="Esto suele tardar unos segundos." />
    )
  );
}
