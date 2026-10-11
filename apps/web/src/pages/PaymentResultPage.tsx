import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Card, PageHeader } from '../components/ui';
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
      <Card>
        <PageHeader title="El pago no se completó" subtitle="No se cobró nada. Podés intentarlo de nuevo mientras dure la reserva." />
        <Link to="/mis-turnos" className="underline">Volver a mis turnos</Link>
      </Card>
    );
  }
  return (
    <Card>
      {confirmed ? (
        <>
          <PageHeader title="¡Turno confirmado!" subtitle={`Te esperamos el ${dateTimeLabel(data!.appointment.startAt)}. Te mandamos la confirmación por WhatsApp.`} />
          <Link to="/mis-turnos" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-peach px-4 py-2 text-[15px] font-medium text-n8 transition hover:bg-[#b07a7d]">Ver mis turnos y agregarlo al calendario</Link>
        </>
      ) : timedOut || status === 'pendiente' ? (
        <PageHeader title="Estamos esperando la confirmación del pago" subtitle="Apenas Mercado Pago lo acredite te avisamos por WhatsApp. No hace falta que pagues de nuevo." />
      ) : (
        <PageHeader title="Confirmando tu pago…" subtitle="Esto suele tardar unos segundos." />
      )}
    </Card>
  );
}
