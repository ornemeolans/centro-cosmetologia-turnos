import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { Card, PageHeader } from '../components/ui';
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
    <Card className="mx-auto max-w-lg">
      <PageHeader title="Agregá tu turno al calendario" subtitle={data.title} />
      <p className="mb-6 text-[1.6rem] leading-tight first-letter:uppercase text-ink-strong">{dateTimeLabel(data.startAt)} a {timeLabel(data.endAt)}</p>
      {data.status === 'CANCELED' ? (
        <p className="rounded-lg bg-red-bg px-3.5 py-2.5 text-red-fg">Este turno fue cancelado.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          <a href={data.googleUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-peach px-4 py-2 text-[15px] font-medium text-n8 transition hover:bg-[#b07a7d]">Google Calendar</a>
          <a href={data.icsUrl} className="inline-flex min-h-11 items-center justify-center rounded-lg border border-line bg-surface px-4 py-2 text-[15px] text-ink-strong transition hover:border-n4">Apple, Outlook u otro (.ics)</a>
        </div>
      )}
    </Card>
  );
}
