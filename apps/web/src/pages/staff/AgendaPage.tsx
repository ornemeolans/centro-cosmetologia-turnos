import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Field, FormError } from '../../components/Field';
import { SlotPicker } from '../../components/SlotPicker';
import { ArrowLeft, ArrowRight, Plus } from '../../components/icons';
import { Badge, Button, Card, Dialog, Empty, Eyebrow, PageHeader, Select, Textarea } from '../../components/ui';
import { api, send } from '../../lib/api';
import { errorMessage, useMe } from '../../lib/auth';
import { addDays, dayLabel, isoDay, money, statusLabel, timeLabel } from '../../lib/format';
import { lineFor } from '../../lib/lines';
import type { ApptDto } from '../ClientDashboard';

type AgendaAppt = ApptDto & { blockedUntil: string; client: { id: string; name: string; phone: string | null; isReliable: boolean } };
interface Column { professional: { id: string; displayName: string }; windows: { start: string; end: string }[]; appointments: AgendaAppt[] }

export function AgendaPage() {
  const { data: me } = useMe();
  const [date, setDate] = useState(isoDay());
  const [professionalId, setProfessionalId] = useState('');
  const [newOpen, setNewOpen] = useState<null | { recordId?: string }>(null);
  const [firstVisitOpen, setFirstVisitOpen] = useState(false);
  const seesAll = me?.user.role === 'OWNER' || me?.user.role === 'RECEPTION';

  const pros = useQuery({ queryKey: ['professionals'], queryFn: () => api<{ professionals: { id: string; displayName: string }[] }>('/professionals'), enabled: seesAll });
  const agenda = useQuery({
    queryKey: ['agenda', date, professionalId],
    queryFn: () => api<{ columns: Column[] }>(`/staff/agenda?date=${date}${professionalId ? `&professionalId=${professionalId}` : ''}`),
    refetchInterval: 30_000,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Agenda"
        subtitle={dayLabel(`${date}T12:00:00-03:00`)}
        action={
          <div className="flex flex-wrap gap-2">
            {me?.user.role !== 'PROFESSIONAL' && <Button variant="secondary" onClick={() => setFirstVisitOpen(true)}>Primera vez</Button>}
            <Button onClick={() => setNewOpen({})}><Plus /> Nuevo turno</Button>
          </div>
        }
      />
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-xl bg-sunken p-1">
          <Button variant="ghost" aria-label="Día anterior" onClick={() => setDate(addDays(date, -1))}><ArrowLeft /></Button>
          <Button variant="ghost" className="font-mono text-[13px]" onClick={() => setDate(isoDay())}>Hoy</Button>
          <Button variant="ghost" aria-label="Día siguiente" onClick={() => setDate(addDays(date, 1))}><ArrowRight /></Button>
        </div>
        <input type="date" aria-label="Fecha" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} className="min-h-11 rounded-lg border border-line bg-surface px-3 font-mono text-[13px] text-ink-strong hover:border-n4" />
        {seesAll && (
          <select aria-label="Profesional" value={professionalId} onChange={(e) => setProfessionalId(e.target.value)} className="min-h-11 rounded-lg border border-line bg-surface px-3 text-[15px] text-ink-strong hover:border-n4">
            <option value="">Todas las profesionales</option>
            {pros.data?.professionals.map((p) => <option key={p.id} value={p.id}>{p.displayName}</option>)}
          </select>
        )}
      </div>

      {agenda.isLoading && <p className="text-muted">Cargando…</p>}
      <div className={`grid gap-4 ${agenda.data && agenda.data.columns.length > 1 ? 'lg:grid-cols-2 xl:grid-cols-3' : ''}`}>
        {agenda.data?.columns.map((c) => <AgendaColumn key={c.professional.id} column={c} showName={seesAll} />)}
      </div>

      <Dialog open={Boolean(newOpen)} onClose={() => setNewOpen(null)} title="Nuevo turno">
        <NewAppointment initialRecordId={newOpen?.recordId} onDone={() => setNewOpen(null)} />
      </Dialog>
      <Dialog open={firstVisitOpen} onClose={() => setFirstVisitOpen(false)} title="Primera vez">
        <FirstVisitForm onCreated={(recordId) => { setFirstVisitOpen(false); setNewOpen({ recordId }); }} />
      </Dialog>
    </div>
  );
}

function AgendaColumn({ column, showName }: { column: Column; showName: boolean }) {
  return (
    <Card>
      {showName && <h2 className="mb-2 text-[1.6rem]">{column.professional.displayName}</h2>}
      <Eyebrow dot={column.windows.length ? 'bg-olive' : 'bg-n4'} className="mb-5 text-muted">
        {column.windows.length ? `Atiende ${column.windows.map((w) => `${w.start}–${w.end}`).join(', ')}` : 'No atiende este día'}
      </Eyebrow>
      {column.appointments.length === 0 ? <Empty>Sin turnos.</Empty> : (
        <ol className="space-y-3">{column.appointments.map((a) => <AgendaItem key={a.id} appt={a} />)}</ol>
      )}
    </Card>
  );
}

function AgendaItem({ appt }: { appt: AgendaAppt }) {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const [dialog, setDialog] = useState<'reschedule' | 'cancel' | 'force' | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ['agenda'] });
  const attend = useMutation({ mutationFn: (status: 'COMPLETED' | 'NO_SHOW') => send(`/staff/appointments/${appt.id}/status`, 'PATCH', { status }), onSuccess: refresh });
  const started = new Date(appt.startAt) <= new Date();
  const canAttend = me?.user.role !== 'RECEPTION' && appt.status === 'CONFIRMED' && started;
  const s = statusLabel[appt.status];
  const line = lineFor(appt.treatments[0]?.id ?? appt.id);
  const inactive = ['CANCELED', 'NO_SHOW', 'EXPIRED', 'RESCHEDULED'].includes(appt.status);

  return (
    <li className={`relative overflow-hidden rounded-xl border py-3 pl-5 pr-3 ${inactive ? 'border-line bg-surface opacity-60' : `${line.border} ${line.soft}`}`}>
      <span className={`absolute inset-y-0 left-0 w-1.5 ${line.band}`} />
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-mono text-[13px] text-ink-strong">{timeLabel(appt.startAt)}–{timeLabel(appt.endAt)}</p>
          <Link to={`/fichas/${appt.client.id}`} className="font-medium text-ink-strong underline-offset-2 hover:underline">{appt.client.name}</Link>
          <p className="text-sm text-muted">{appt.treatments.map((t) => t.name).join(' + ')}</p>
        </div>
        <div className="flex flex-wrap justify-end gap-1">
          {appt.isFirstVisit && <Badge tone="blue">Primera vez</Badge>}
          {appt.client.isReliable && <Badge tone="green">Cumplidora</Badge>}
          <Badge tone={s?.tone}>{s?.text}</Badge>
        </div>
      </div>
      {appt.depositPaidCents > 0 && <p className="mt-1 font-mono text-[12px] text-muted">Seña {money(appt.depositPaidCents)}</p>}
      {appt.status === 'CONFIRMED' && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {canAttend && <Button variant="secondary" className="min-h-9 px-3 py-1" onClick={() => attend.mutate('COMPLETED')}>Realizado</Button>}
          {canAttend && <Button variant="secondary" className="min-h-9 px-3 py-1" onClick={() => attend.mutate('NO_SHOW')}>Ausente</Button>}
          {!started && appt.rules?.onTime && <Button variant="ghost" className="min-h-9 px-3 py-1" onClick={() => setDialog('reschedule')}>Reprogramar</Button>}
          {!started && appt.rules?.onTime && <Button variant="ghost" className="min-h-9 px-3 py-1" onClick={() => setDialog('cancel')}>Cancelar</Button>}
          {!started && !appt.rules?.onTime && me?.user.role === 'OWNER' && <Button variant="ghost" className="min-h-9 px-3 py-1" onClick={() => setDialog('force')}>Cambio fuera de plazo</Button>}
        </div>
      )}
      <FormError>{attend.isError ? errorMessage(attend.error) : undefined}</FormError>

      <Dialog open={dialog === 'reschedule'} onClose={() => setDialog(null)} title="Reprogramar">
        <StaffReschedule appt={appt} onDone={() => { setDialog(null); refresh(); }} />
      </Dialog>
      <Dialog open={dialog === 'cancel'} onClose={() => setDialog(null)} title="Cancelar turno">
        <StaffCancel appt={appt} onDone={() => { setDialog(null); refresh(); }} />
      </Dialog>
      <Dialog open={dialog === 'force'} onClose={() => setDialog(null)} title="Cambio fuera de plazo">
        <ForceChange appt={appt} onDone={() => { setDialog(null); refresh(); }} />
      </Dialog>
    </li>
  );
}

function StaffReschedule({ appt, onDone }: { appt: AgendaAppt; onDone: () => void }) {
  const [start, setStart] = useState<string>();
  const move = useMutation({ mutationFn: () => send(`/appointments/${appt.id}/reschedule`, 'POST', { startAt: start }), onSuccess: onDone });
  return (
    <div className="space-y-4">
      <SlotPicker professionalId={appt.professional.id} treatmentIds={appt.treatments.map((t) => t.id)} value={start} onChange={setStart} initialDate={isoDay(new Date(appt.startAt))} minDate={isoDay()} />
      <FormError>{move.isError ? errorMessage(move.error) : undefined}</FormError>
      <Button disabled={!start || move.isPending} onClick={() => move.mutate()}>Mover turno y avisar a la clienta</Button>
    </div>
  );
}

function StaffCancel({ appt, onDone }: { appt: AgendaAppt; onDone: () => void }) {
  const cancel = useMutation({ mutationFn: () => send(`/appointments/${appt.id}/cancel`, 'POST', {}), onSuccess: onDone });
  return (
    <div className="space-y-4">
      <p className="text-sm">{appt.depositPaidCents > 0 ? `La seña de ${money(appt.depositPaidCents)} queda como saldo a favor de la clienta por 30 días.` : 'El turno no tiene seña.'} Se le avisa por WhatsApp.</p>
      <FormError>{cancel.isError ? errorMessage(cancel.error) : undefined}</FormError>
      <Button variant="danger" disabled={cancel.isPending} onClick={() => cancel.mutate()}>Cancelar turno</Button>
    </div>
  );
}

function ForceChange({ appt, onDone }: { appt: AgendaAppt; onDone: () => void }) {
  const [action, setAction] = useState<'RESCHEDULE' | 'CANCEL'>('RESCHEDULE');
  const [reason, setReason] = useState('');
  const [start, setStart] = useState<string>();
  const force = useMutation({
    mutationFn: () => send(`/admin/appointments/${appt.id}/force`, 'POST', action === 'CANCEL' ? { action, reason } : { action, reason, startAt: start }),
    onSuccess: onDone,
  });
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">Solo la dueña puede cambiar un turno fuera del plazo. La seña queda a favor de la clienta y no cuenta como reprogramación suya.</p>
      <Select label="Acción" value={action} onChange={(e) => setAction(e.target.value as 'RESCHEDULE' | 'CANCEL')}>
        <option value="RESCHEDULE">Reprogramar</option>
        <option value="CANCEL">Cancelar</option>
      </Select>
      {action === 'RESCHEDULE' && <SlotPicker professionalId={appt.professional.id} treatmentIds={appt.treatments.map((t) => t.id)} value={start} onChange={setStart} minDate={isoDay()} />}
      <Textarea label="Motivo (obligatorio)" required minLength={5} value={reason} onChange={(e) => setReason(e.target.value)} />
      <FormError>{force.isError ? errorMessage(force.error) : undefined}</FormError>
      <Button disabled={reason.length < 5 || (action === 'RESCHEDULE' && !start) || force.isPending} onClick={() => force.mutate()}>Confirmar</Button>
    </div>
  );
}

interface RecordRow { id: string; firstName: string; lastName: string; email: string; status: string }

function NewAppointment({ initialRecordId, onDone }: { initialRecordId?: string; onDone: () => void }) {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [recordId, setRecordId] = useState(initialRecordId ?? '');
  const [professionalId, setProfessionalId] = useState('');
  const [treatmentIds, setTreatmentIds] = useState<string[]>([]);
  const [start, setStart] = useState<string>();
  const isProfessional = me?.user.role === 'PROFESSIONAL';

  const records = useQuery({ queryKey: ['records', q], queryFn: () => api<{ records: RecordRow[] }>(`/staff/client-records?q=${encodeURIComponent(q)}`) });
  const mine = useQuery({ queryKey: ['staff-me'], queryFn: () => api<{ professional: { id: string } }>('/staff/me'), enabled: isProfessional });
  const pros = useQuery({ queryKey: ['professionals'], queryFn: () => api<{ professionals: { id: string; displayName: string }[] }>('/professionals'), enabled: !isProfessional });
  const proId = isProfessional ? mine.data?.professional.id ?? '' : professionalId;
  const catalog = useQuery({
    queryKey: ['treatments', proId],
    queryFn: () => api<{ treatments: { id: string; name: string; durationMin: number }[]; combos: [string, string][] }>(`/professionals/${proId}/treatments`),
    enabled: Boolean(proId),
  });
  const combos = new Set((catalog.data?.combos ?? []).map(([a, b]) => [a, b].sort().join(':')));

  const create = useMutation({
    mutationFn: () => send('/staff/appointments', 'POST', { clientRecordId: recordId, professionalId: proId, treatmentIds, startAt: start }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['agenda'] });
      onDone();
    },
  });

  return (
    <div className="space-y-5">
      {!initialRecordId && (
        <div className="space-y-2">
          <Field label="Buscar clienta" placeholder="Nombre, email o teléfono" value={q} onChange={(e) => setQ(e.target.value)} />
          <ul className="max-h-40 divide-y divide-line overflow-y-auto rounded-lg border border-line">
            {records.data?.records.map((r) => (
              <li key={r.id}>
                <button type="button" onClick={() => setRecordId(r.id)} aria-pressed={recordId === r.id}
                  className="w-full px-3 py-2 text-left text-sm aria-pressed:bg-sunken">
                  {r.firstName} {r.lastName} <span className="text-muted">· {r.email}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {!isProfessional && (
        <Select label="Profesional" value={professionalId} onChange={(e) => { setProfessionalId(e.target.value); setTreatmentIds([]); setStart(undefined); }}>
          <option value="" disabled>Elegí</option>
          {pros.data?.professionals.map((p) => <option key={p.id} value={p.id}>{p.displayName}</option>)}
        </Select>
      )}
      {proId && (
        <fieldset className="space-y-1">
          <legend className="text-sm">Tratamientos</legend>
          {catalog.data?.treatments.map((t) => {
            const checked = treatmentIds.includes(t.id);
            const disabled = !checked && treatmentIds.length > 0 && !treatmentIds.every((x) => combos.has([x, t.id].sort().join(':')));
            return (
              <label key={t.id} className={`flex items-center gap-2 text-sm ${disabled ? 'opacity-40' : ''}`}>
                <input type="checkbox" className="accent-ink-strong" checked={checked} disabled={disabled}
                  onChange={() => { setTreatmentIds(checked ? treatmentIds.filter((x) => x !== t.id) : [...treatmentIds, t.id]); setStart(undefined); }} />
                {t.name} <span className="font-mono text-xs text-muted">{t.durationMin} min</span>
              </label>
            );
          })}
        </fieldset>
      )}
      {proId && treatmentIds.length > 0 && <SlotPicker professionalId={proId} treatmentIds={treatmentIds} value={start} onChange={setStart} minDate={isoDay()} initialDate={isoDay()} />}
      <p className="text-xs text-muted">Los turnos cargados por el equipo no piden seña. La clienta recibe la confirmación por WhatsApp.</p>
      <FormError>{create.isError ? errorMessage(create.error) : undefined}</FormError>
      <Button disabled={!recordId || !start || create.isPending} onClick={() => create.mutate()}>Agendar</Button>
    </div>
  );
}

function FirstVisitForm({ onCreated }: { onCreated: (recordId: string) => void }) {
  const pros = useQuery({ queryKey: ['professionals'], queryFn: () => api<{ professionals: { id: string; displayName: string }[] }>('/professionals') });
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', phoneE164: '', ownerProfessionalId: '' });
  const create = useMutation({
    mutationFn: () => send<{ id: string }>('/staff/client-records/first-visit', 'POST', { ...form, phoneE164: form.phoneE164.replace(/[\s-]/g, '') }),
    onSuccess: ({ id }) => onCreated(id),
  });
  function onSubmit(e: FormEvent) {
    e.preventDefault();
    create.mutate();
  }
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm({ ...form, [k]: e.target.value });
  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <p className="text-sm text-muted">Perfil mínimo para el primer turno. La profesional completa la ficha después de la sesión.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nombre" required value={form.firstName} onChange={set('firstName')} />
        <Field label="Apellido" required value={form.lastName} onChange={set('lastName')} />
      </div>
      <Field label="Email" type="email" required value={form.email} onChange={set('email')} hint="Con este email va a poder entrar a la app." />
      <Field label="Celular (WhatsApp)" type="tel" required placeholder="351 732 6453" value={form.phoneE164} onChange={set('phoneE164')} hint="Con código de área, sin el 0 ni el 15." />
      <Select label="Profesional" required value={form.ownerProfessionalId} onChange={set('ownerProfessionalId')}>
        <option value="" disabled>Elegí</option>
        {pros.data?.professionals.map((p) => <option key={p.id} value={p.id}>{p.displayName}</option>)}
      </Select>
      <FormError>{create.isError ? errorMessage(create.error) : undefined}</FormError>
      <Button type="submit" disabled={create.isPending}>Crear y elegir horario</Button>
    </form>
  );
}
