import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { StatusCard } from '../components/AuthShell';
import { Calendar, Download } from '../components/icons';
import { api } from '../lib/api';
import { dateTimeLabel, timeLabel } from '../lib/format';

/** Página del enlace que llega por WhatsApp: funciona sin iniciar sesión. */
export function CalendarLinkPage() {
  const { token } = useParams();
  const { data, isError } = useQuery({
    queryKey: ['calendar-link', token],
    queryFn: () => api<{ title: string; startAt: string; endAt: string; status: string; googleUrl: string; icsUrl: string }>(`/c/${token}`),
  });
  if (isError) return <p className="text-muted">El enlace no es válido.</p>;
  if (!data) return <p className="text-muted">Cargando…</p>;
  return (
    <StatusCard tone={data.status === 'CANCELED' ? 'error' : 'neutral'} icon={<Calendar />} eyebrow={data.title}
      title={data.status === 'CANCELED' ? 'Este turno fue cancelado' : 'Agregá tu turno al calendario'}
      text={<span className="inline-block font-mono text-[15px] text-ink-strong first-letter:uppercase">{dateTimeLabel(data.startAt)} a {timeLabel(data.endAt)}</span>}>
      {data.status !== 'CANCELED' && (
        <>
          <a href={data.googleUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-12 items-center justify-center gap-2.5 rounded-lg bg-peach px-5 font-medium text-n8 transition hover:bg-[#b07a7d] active:scale-[0.98]"><Calendar /> Google Calendar</a>
          <a href={data.icsUrl} className="inline-flex min-h-12 items-center justify-center gap-2.5 rounded-lg border border-line bg-surface px-5 font-medium text-ink-strong transition hover:border-n4"><Download /> Apple, Outlook u otro</a>
        </>
      )}
    </StatusCard>
  );
}
