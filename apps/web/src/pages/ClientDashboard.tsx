import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { googleCalendarUrl } from '@turnos/shared';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Field, FormError, SubmitButton } from '../components/Field';
import { SlotPicker } from '../components/SlotPicker';
import { Badge, Button, Card, Dialog, Empty, PageHeader, Section, Select } from '../components/ui';
import { api, CENTER_WHATSAPP, send } from '../lib/api';
import { errorMessage, useMe } from '../lib/auth';
import { addDays, dateTimeLabel, isoDay, money, statusLabel, timeLabel } from '../lib/format';

export interface ApptDto {
  id: string;
  startAt: string;
  endAt: string;
  status: string;
  isFirstVisit: boolean;
  professional: { id: string; displayName: string };
  treatments: { id: string; name: string; durationMin: number; priceCents: number }[];
  depositTotalCents: number;
  depositPaidCents: number;
  holdExpiresAt: string | null;
  rules: { deadline: string; onTime: boolean; canReschedule: boolean; reschedulesLeft: number } | null;
}

const whatsappLink = `https://wa.me/${CENTER_WHATSAPP}?text=${encodeURIComponent('Hola, quiero pedir mi primer turno')}`;

export function ClientDashboard() {
  const { data: me } = useMe();
  if (!me) return null;
  if (!me.record) return <RecordNotLinked email={me.user.email ?? ''} />;
  if (me.record.status === 'PRIMERA_VEZ') return <FirstVisit name={me.record.firstName} />;

  return (
    <div className="space-y-12">
      <PageHeader title={`Hola, ${me.record.firstName}`} subtitle="Tus turnos, tu saldo y las recomendaciones de tu cosmetóloga."
        action={<Link to="/reservar" className="rounded-md bg-ink-strong px-4 py-2 text-sm font-medium text-white hover:bg-[#333333]">Reservar turno</Link>} />
      {me.needsPhone && <PhoneForm />}
      <Upcoming />
      <div className="grid gap-12 lg:grid-cols-2">
        <Recommendations />
        <div className="space-y-12">
          <Credits />
          <Waitlist />
        </div>
      </div>
      <Past />
    </div>
  );
}

function FirstVisit({ name }: { name: string }) {
  const { data } = useQuery({ queryKey: ['appointments', 'upcoming'], queryFn: () => api<{ appointments: ApptDto[] }>('/me/appointments?scope=upcoming') });
  return (
    <div className="space-y-8">
      <PageHeader title={`¡Hola, ${name}!`} subtitle="Vas a poder usar todas las funciones después de tu primera sesión." />
      <div className="space-y-3">{data?.appointments.map((a) => <AppointmentCard key={a.id} appt={a} />)}</div>
    </div>
  );
}

function Upcoming() {
  const { data, isLoading } = useQuery({ queryKey: ['appointments', 'upcoming'], queryFn: () => api<{ appointments: ApptDto[] }>('/me/appointments?scope=upcoming') });
  return (
    <Section title="Próximos turnos">
      {isLoading && <p className="text-muted">Cargando…</p>}
      {data?.appointments.length === 0 && <Empty>No tenés turnos próximos.</Empty>}
      <div className="space-y-3">{data?.appointments.map((a) => <AppointmentCard key={a.id} appt={a} />)}</div>
    </Section>
  );
}

function Past() {
  const { data } = useQuery({ queryKey: ['appointments', 'past'], queryFn: () => api<{ appointments: ApptDto[] }>('/me/appointments?scope=past') });
  if (!data?.appointments.length) return null;
  return (
    <Section title="Historial">
      <ul className="divide-y divide-line text-sm">
        {data.appointments.map((a) => (
          <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <span className="capitalize">{dateTimeLabel(a.startAt)} · {a.treatments.map((t) => t.name).join(' + ')} · {a.professional.displayName}</span>
            <Badge tone={statusLabel[a.status]?.tone}>{statusLabel[a.status]?.text ?? a.status}</Badge>
          </li>
        ))}
      </ul>
    </Section>
  );
}

function AppointmentCard({ appt }: { appt: ApptDto }) {
  const [dialog, setDialog] = useState<'reschedule' | 'cancel' | null>(null);
  const qc = useQueryClient();
  const pay = useMutation({
    mutationFn: () => send<{ checkoutUrl: string }>(`/appointments/${appt.id}/checkout`, 'POST'),
    onSuccess: ({ checkoutUrl }) => window.location.assign(checkoutUrl),
    onError: () => qc.invalidateQueries({ queryKey: ['appointments'] }),
  });
  const treatments = appt.treatments.map((t) => t.name).join(' + ');
  const google = googleCalendarUrl({
    uid: appt.id, sequence: 0, title: `${treatments} con ${appt.professional.displayName}`,
    description: 'Turno del centro de cosmetología', location: '', start: new Date(appt.startAt), end: new Date(appt.endAt),
  });

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-serif text-xl capitalize text-ink-strong">{dateTimeLabel(appt.startAt)}</p>
          <p className="text-sm text-muted">{treatments} · {appt.professional.displayName}</p>
        </div>
        <Badge tone={statusLabel[appt.status]?.tone}>{statusLabel[appt.status]?.text}</Badge>
      </div>

      {appt.status === 'PENDING_PAYMENT' && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button onClick={() => pay.mutate()} disabled={pay.isPending}>Pagar seña ({money(appt.depositTotalCents)})</Button>
          {appt.holdExpiresAt && <span className="text-xs text-muted">Reservado hasta las {timeLabel(appt.holdExpiresAt)}</span>}
          <FormError>{pay.isError ? errorMessage(pay.error) : undefined}</FormError>
        </div>
      )}

      {appt.status === 'CONFIRMED' && appt.rules && (
        <>
          <p className="mt-3 text-xs text-muted">
            {appt.rules.onTime
              ? <>Podés cambiarlo o cancelarlo sin perder la seña hasta el <span className="capitalize">{dateTimeLabel(appt.rules.deadline)}</span>.</>
              : 'Ya pasó el plazo para cambios: si cancelás, la seña no se reintegra.'}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <a href={google} target="_blank" rel="noreferrer" className="rounded-md border border-line px-3 py-1.5 text-sm hover:bg-sunken">Google Calendar</a>
            <a href={`/api/v1/appointments/${appt.id}/calendar.ics`} className="rounded-md border border-line px-3 py-1.5 text-sm hover:bg-sunken">Descargar .ics</a>
            {appt.rules.canReschedule && <Button variant="secondary" className="py-1.5" onClick={() => setDialog('reschedule')}>Reprogramar</Button>}
            <Button variant="ghost" className="py-1.5" onClick={() => setDialog('cancel')}>Cancelar</Button>
          </div>
        </>
      )}

      <Dialog open={dialog === 'reschedule'} onClose={() => setDialog(null)} title="Reprogramar turno">
        <RescheduleForm appt={appt} onDone={() => setDialog(null)} />
      </Dialog>
      <Dialog open={dialog === 'cancel'} onClose={() => setDialog(null)} title="Cancelar turno">
        <CancelForm appt={appt} onDone={() => setDialog(null)} />
      </Dialog>
    </Card>
  );
}

function RescheduleForm({ appt, onDone }: { appt: ApptDto; onDone: () => void }) {
  const [start, setStart] = useState<string>();
  const qc = useQueryClient();
  const move = useMutation({
    mutationFn: () => send(`/appointments/${appt.id}/reschedule`, 'POST', { startAt: start }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['appointments'] });
      onDone();
    },
  });
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">Te quedan {appt.rules?.reschedulesLeft} reprogramaciones para este turno. La seña pasa al nuevo horario.</p>
      <SlotPicker professionalId={appt.professional.id} treatmentIds={appt.treatments.map((t) => t.id)} value={start} onChange={setStart} />
      <FormError>{move.isError ? errorMessage(move.error) : undefined}</FormError>
      <Button disabled={!start || move.isPending} onClick={() => move.mutate()}>Confirmar cambio</Button>
    </div>
  );
}

function CancelForm({ appt, onDone }: { appt: ApptDto; onDone: () => void }) {
  const qc = useQueryClient();
  const late = !appt.rules?.onTime;
  const cancel = useMutation({
    mutationFn: () => send<{ outcome: string; creditCents: number }>(`/appointments/${appt.id}/cancel`, 'POST', { acceptForfeit: late }),
    onSuccess: async () => {
      await qc.invalidateQueries();
      onDone();
    },
  });
  return (
    <div className="space-y-4">
      {appt.depositPaidCents === 0 ? (
        <p className="text-sm">Este turno no tiene seña registrada.</p>
      ) : late ? (
        <p className="rounded-md bg-red-bg px-3 py-2 text-sm text-red-fg">Ya pasó el plazo de 2 días hábiles: si cancelás ahora, la seña de {money(appt.depositPaidCents)} no se reintegra.</p>
      ) : (
        <p className="rounded-md bg-green-bg px-3 py-2 text-sm text-green-fg">La seña de {money(appt.depositPaidCents)} queda como saldo a favor con {appt.professional.displayName}: tenés 30 días para usarla en una nueva reserva.</p>
      )}
      <FormError>{cancel.isError ? errorMessage(cancel.error) : undefined}</FormError>
      <div className="flex gap-2">
        <Button variant="danger" disabled={cancel.isPending} onClick={() => cancel.mutate()}>Cancelar turno</Button>
        <Button variant="secondary" onClick={onDone}>Volver</Button>
      </div>
    </div>
  );
}

function Recommendations() {
  const { data } = useQuery({
    queryKey: ['recommendations'],
    queryFn: () => api<{ recommendations: { id: string; body: string; createdAt: string; professional?: string }[] }>('/me/recommendations'),
  });
  return (
    <Section title="Recomendaciones">
      {data?.recommendations.length === 0 && <Empty>Tu cosmetóloga todavía no dejó recomendaciones.</Empty>}
      <ul className="space-y-4">
        {data?.recommendations.map((r) => (
          <li key={r.id} className="border-l-2 border-line pl-4">
            <p className="whitespace-pre-line">{r.body}</p>
            <p className="mt-1 text-xs text-muted">{r.professional} · <span className="capitalize">{dateTimeLabel(r.createdAt)}</span></p>
          </li>
        ))}
      </ul>
    </Section>
  );
}

function Credits() {
  const { data } = useQuery({
    queryKey: ['credits'],
    queryFn: () => api<{ credits: { professionalId: string; professional?: string; amountCents: number; nextExpiry: string }[] }>('/me/credits'),
  });
  if (!data?.credits.length) return null;
  return (
    <Section title="Saldo a favor">
      <ul className="space-y-2">
        {data.credits.map((c) => (
          <li key={c.professionalId} className="flex items-baseline justify-between gap-4">
            <span>{c.professional}</span>
            <span className="text-right">
              <span className="font-mono text-ink-strong">{money(c.amountCents)}</span>
              <span className="block text-xs text-muted">Reservá antes del <span className="capitalize">{dateTimeLabel(c.nextExpiry)}</span></span>
            </span>
          </li>
        ))}
      </ul>
    </Section>
  );
}

function Waitlist() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ['waitlist'],
    queryFn: () => api<{ lastMinuteAlerts: boolean; entries: { id: string; professional?: string; dateFrom: string; dateTo: string }[] }>('/me/waitlist'),
  });
  const pros = useQuery({ queryKey: ['professionals'], queryFn: () => api<{ professionals: { id: string; displayName: string }[] }>('/professionals') });
  const [form, setForm] = useState({ professionalId: '', dateFrom: addDays(isoDay(), 1), dateTo: addDays(isoDay(), 7) });
  const refresh = () => qc.invalidateQueries({ queryKey: ['waitlist'] });
  const alerts = useMutation({ mutationFn: (v: boolean) => send('/me/alerts', 'PATCH', { lastMinuteAlerts: v }), onSuccess: refresh });
  const add = useMutation({ mutationFn: () => send('/me/waitlist', 'POST', form), onSuccess: refresh });
  const remove = useMutation({ mutationFn: (id: string) => send(`/me/waitlist/${id}`, 'DELETE'), onSuccess: refresh });

  return (
    <Section title="Lista de espera">
      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" className="mt-1 accent-ink-strong" checked={data?.lastMinuteAlerts ?? false}
          onChange={(e) => alerts.mutate(e.target.checked)} />
        <span>Avisame por WhatsApp si se libera un turno de último momento con mi cosmetóloga (máximo 3 avisos por semana).</span>
      </label>
      <ul className="divide-y divide-line text-sm">
        {data?.entries.map((e) => (
          <li key={e.id} className="flex items-center justify-between py-2">
            <span>{e.professional}: del {e.dateFrom.split('-').reverse().join('/')} al {e.dateTo.split('-').reverse().join('/')}</span>
            <Button variant="ghost" className="py-1" onClick={() => remove.mutate(e.id)}>Quitar</Button>
          </li>
        ))}
      </ul>
      <form className="grid gap-3 sm:grid-cols-[1fr_auto_auto_auto] sm:items-end" onSubmit={(e) => { e.preventDefault(); add.mutate(); }}>
        <Select label="Profesional" required value={form.professionalId} onChange={(e) => setForm({ ...form, professionalId: e.target.value })}>
          <option value="" disabled>Elegí</option>
          {pros.data?.professionals.map((p) => <option key={p.id} value={p.id}>{p.displayName}</option>)}
        </Select>
        <Field label="Desde" type="date" value={form.dateFrom} min={isoDay()} onChange={(e) => setForm({ ...form, dateFrom: e.target.value })} />
        <Field label="Hasta" type="date" value={form.dateTo} min={form.dateFrom} onChange={(e) => setForm({ ...form, dateTo: e.target.value })} />
        <Button type="submit" variant="secondary" disabled={add.isPending}>Anotarme</Button>
      </form>
      <FormError>{add.isError ? errorMessage(add.error) : undefined}</FormError>
    </Section>
  );
}

function PhoneForm() {
  const [phone, setPhone] = useState('+549');
  const qc = useQueryClient();
  const save = useMutation({
    mutationFn: () => send('/me', 'PATCH', { phoneE164: phone.replace(/[\s-]/g, '') }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['me'] }),
  });
  function onSubmit(e: FormEvent) {
    e.preventDefault();
    save.mutate();
  }
  return (
    <form onSubmit={onSubmit} className="space-y-3 rounded-xl border border-yellow-bg bg-yellow-bg/60 p-5">
      <p className="text-sm">Dejanos tu celular para enviarte las confirmaciones y recordatorios por WhatsApp.</p>
      <Field label="Celular" type="tel" autoComplete="tel" required value={phone} onChange={(e) => setPhone(e.target.value)}
        hint="Con código de país y de área, sin el 15. Ejemplo: +5491123456789" />
      <FormError>{save.isError ? errorMessage(save.error) : undefined}</FormError>
      <SubmitButton pending={save.isPending}>Guardar</SubmitButton>
    </form>
  );
}

function RecordNotLinked({ email }: { email: string }) {
  const [professionalId, setProfessionalId] = useState('');
  const [message, setMessage] = useState('');
  const { data } = useQuery({
    queryKey: ['professionals'],
    queryFn: () => api<{ professionals: { id: string; displayName: string }[] }>('/professionals'),
  });
  const request = useMutation({
    mutationFn: () => send('/me/email-change-request', 'POST', { professionalId, message: message || undefined }),
  });
  function onSubmit(e: FormEvent) {
    e.preventDefault();
    request.mutate();
  }

  return (
    <section className="max-w-prose space-y-6">
      <h1 className="text-3xl">No encontramos tu ficha</h1>
      <p className="text-muted">
        Entraste con <strong className="text-ink-strong">{email}</strong>, pero tu cosmetóloga tiene cargado otro email. Pedile que lo
        actualice y la próxima vez que entres vas a ver tus turnos.
      </p>
      {request.isSuccess ? (
        <p className="rounded-md bg-green-bg px-3 py-2 text-green-fg">Listo, le avisamos por email.</p>
      ) : (
        <form onSubmit={onSubmit} className="space-y-3">
          <Select label="Tu cosmetóloga" required value={professionalId} onChange={(e) => setProfessionalId(e.target.value)}>
            <option value="" disabled>Elegí una opción</option>
            {data?.professionals.map((p) => <option key={p.id} value={p.id}>{p.displayName}</option>)}
          </Select>
          <Field label="Mensaje (opcional)" value={message} onChange={(e) => setMessage(e.target.value)} maxLength={500} />
          <FormError>{request.isError ? errorMessage(request.error) : undefined}</FormError>
          <SubmitButton pending={request.isPending}>Pedir que actualice mi email</SubmitButton>
        </form>
      )}
      <p className="text-sm text-muted">
        ¿Es tu primera vez? <a className="text-ink-strong underline" target="_blank" rel="noreferrer" href={whatsappLink}>Pedí tu turno por WhatsApp</a>
      </p>
    </section>
  );
}
