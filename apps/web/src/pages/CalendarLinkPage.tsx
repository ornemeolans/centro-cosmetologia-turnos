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
      <p className="mb-6 font-serif text-xl capitalize text-ink-strong">{dateTimeLabel(data.startAt)} a {timeLabel(data.endAt)}</p>
      {data.status === 'CANCELED' ? (
        <p className="rounded-md bg-red-bg px-3 py-2 text-red-fg">Este turno fue cancelado.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          <a href={data.googleUrl} target="_blank" rel="noreferrer" className="rounded-md bg-ink-strong px-4 py-2 text-sm font-medium text-white">Google Calendar</a>
          <a href={data.icsUrl} className="rounded-md border border-line px-4 py-2 text-sm">Apple, Outlook u otro (.ics)</a>
        </div>
      )}
    </Card>
  );
}
