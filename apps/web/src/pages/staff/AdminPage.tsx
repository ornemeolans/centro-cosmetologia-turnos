import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type FormEvent } from 'react';
import { Field, FormError } from '../../components/Field';
import { Badge, Button, Card, PageHeader, Section } from '../../components/ui';
import { api, send } from '../../lib/api';
import { errorMessage } from '../../lib/auth';
import { isoDay, weekdays } from '../../lib/format';

export function AdminPage() {
  return (
    <div className="space-y-12">
      <PageHeader title="Administración" subtitle="Equipo, accesos y reglas del centro." />
      <Professionals />
      <Reception />
      <CenterHours />
      <Holidays />
      <Rules />
    </div>
  );
}

const useRefresh = () => {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ['admin'] });
};

const proStatus: Record<string, { text: string; tone: 'green' | 'yellow' | 'gray' | 'red' }> = {
  ACTIVA: { text: 'Activa', tone: 'green' }, INVITADA: { text: 'Invitada', tone: 'yellow' },
  INVITACION_VENCIDA: { text: 'Invitación vencida', tone: 'red' }, INACTIVA: { text: 'Inactiva', tone: 'gray' },
};

function Professionals() {
  const refresh = useRefresh();
  const { data } = useQuery({
    queryKey: ['admin', 'professionals'],
    queryFn: () => api<{ professionals: { id: string; displayName: string; email: string; status: string; isOwner: boolean; mpConnected: boolean }[] }>('/admin/professionals'),
  });
  const [form, setForm] = useState({ displayName: '', email: '' });
  const invite = useMutation({ mutationFn: () => send('/admin/professionals', 'POST', form), onSuccess: () => { setForm({ displayName: '', email: '' }); refresh(); } });
  const toggle = useMutation({ mutationFn: (p: { id: string; isActive: boolean }) => send(`/admin/professionals/${p.id}`, 'PATCH', { isActive: p.isActive }), onSuccess: refresh });
  function onSubmit(e: FormEvent) {
    e.preventDefault();
    invite.mutate();
  }
  return (
    <Section title="Profesionales">
      <Card className="space-y-4">
        <ul className="divide-y divide-line">
          {data?.professionals.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
              <span>
                <span className="font-medium text-ink-strong">{p.displayName}</span> {p.isOwner && <Badge tone="blue">Dueña</Badge>}
                <span className="block text-sm text-muted">{p.email}{p.mpConnected ? ' · Mercado Pago conectado' : ''}</span>
              </span>
              <span className="flex items-center gap-2">
                <Badge tone={proStatus[p.status]?.tone}>{proStatus[p.status]?.text}</Badge>
                {!p.isOwner && p.status !== 'INVITADA' && (
                  <Button variant="ghost" className="py-1" onClick={() => toggle.mutate({ id: p.id, isActive: p.status === 'INACTIVA' })}>
                    {p.status === 'INACTIVA' ? 'Reactivar' : 'Desactivar'}
                  </Button>
                )}
              </span>
            </li>
          ))}
        </ul>
        <form onSubmit={onSubmit} className="grid gap-3 border-t border-line pt-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <Field label="Nombre" required value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} />
          <Field label="Email" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <Button type="submit" disabled={invite.isPending}>Invitar</Button>
        </form>
        <p className="text-xs text-muted">Le llega un email: entra con ese mismo email (Google o cuenta) y queda como profesional. La invitación dura 7 días.</p>
        <FormError>{invite.isError ? errorMessage(invite.error) : toggle.isError ? errorMessage(toggle.error) : undefined}</FormError>
      </Card>
    </Section>
  );
}

function Reception() {
  const refresh = useRefresh();
  const { data } = useQuery({
    queryKey: ['admin', 'reception'],
    queryFn: () => api<{ google: { id: string; email: string }[]; users: { id: string; name: string; username: string; isActive: boolean }[] }>('/admin/reception-access'),
  });
  const [email, setEmail] = useState('');
  const [user, setUser] = useState({ name: '', username: '', password: '' });
  const addGoogle = useMutation({ mutationFn: () => send('/admin/reception-access', 'POST', { type: 'google', email }), onSuccess: () => { setEmail(''); refresh(); } });
  const addUser = useMutation({ mutationFn: () => send('/admin/reception-access', 'POST', { type: 'password', ...user }), onSuccess: () => { setUser({ name: '', username: '', password: '' }); refresh(); } });
  const removeGoogle = useMutation({ mutationFn: (id: string) => send(`/admin/reception-access/google/${id}`, 'DELETE'), onSuccess: refresh });
  const toggleUser = useMutation({ mutationFn: (u: { id: string; isActive: boolean }) => send(`/admin/reception-access/users/${u.id}`, 'PATCH', { isActive: u.isActive }), onSuccess: refresh });
  const error = addGoogle.error ?? addUser.error;
  return (
    <Section title="Recepción">
      <Card className="space-y-5">
        <p className="text-sm text-muted">Recepción ve todas las agendas y los datos de contacto, crea perfiles de primera vez y agenda turnos. No ve historia clínica ni fotos.</p>
        <ul className="divide-y divide-line text-sm">
          {data?.google.map((g) => (
            <li key={g.id} className="flex items-center justify-between py-2">
              <span>{g.email} <Badge>Google</Badge></span>
              <Button variant="ghost" className="py-1" onClick={() => removeGoogle.mutate(g.id)}>Quitar</Button>
            </li>
          ))}
          {data?.users.map((u) => (
            <li key={u.id} className="flex items-center justify-between py-2">
              <span>{u.name} · <span className="font-mono">{u.username}</span> {!u.isActive && <Badge>Inactivo</Badge>}</span>
              <Button variant="ghost" className="py-1" onClick={() => toggleUser.mutate({ id: u.id, isActive: !u.isActive })}>{u.isActive ? 'Desactivar' : 'Reactivar'}</Button>
            </li>
          ))}
        </ul>
        <div className="grid gap-3 border-t border-line pt-4 sm:grid-cols-[1fr_auto] sm:items-end">
          <Field label="Autorizar un email de Google" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <Button variant="secondary" disabled={!email} onClick={() => addGoogle.mutate()}>Autorizar</Button>
        </div>
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
          <Field label="Nombre" value={user.name} onChange={(e) => setUser({ ...user, name: e.target.value })} />
          <Field label="Usuario" value={user.username} onChange={(e) => setUser({ ...user, username: e.target.value.toLowerCase() })} hint="minúsculas, números, . _ -" />
          <Field label="Contraseña" type="password" autoComplete="new-password" minLength={10} value={user.password} onChange={(e) => setUser({ ...user, password: e.target.value })} hint="mínimo 10 caracteres" />
          <Button variant="secondary" disabled={!user.name || !user.username || user.password.length < 10} onClick={() => addUser.mutate()}>Crear usuario</Button>
        </div>
        <FormError>{error ? errorMessage(error) : undefined}</FormError>
      </Card>
    </Section>
  );
}

interface AdminSettings {
  settings: Record<string, number>;
  centerHours: { weekday: number; open: string; close: string }[];
  holidays: { date: string; name: string }[];
}

function useAdminSettings() {
  return useQuery({ queryKey: ['admin', 'settings'], queryFn: () => api<AdminSettings>('/admin/settings') });
}

function CenterHours() {
  const refresh = useRefresh();
  const { data } = useAdminSettings();
  const [days, setDays] = useState<Record<number, { open: string; close: string } | null>>({});
  useEffect(() => {
    if (data) setDays(Object.fromEntries([1, 2, 3, 4, 5, 6, 7].map((d) => [d, data.centerHours.find((h) => h.weekday === d) ?? null])));
  }, [data]);
  const save = useMutation({
    mutationFn: () => send('/admin/center-hours', 'PUT', Object.entries(days).filter(([, v]) => v).map(([k, v]) => ({ weekday: Number(k), ...v! }))),
    onSuccess: refresh,
  });
  return (
    <Section title="Horario del centro">
      <Card className="space-y-3">
        <p className="text-sm text-muted">Define los días hábiles: el plazo para cambios (2 días hábiles completos) se cuenta sobre los días que el centro abre.</p>
        {[1, 2, 3, 4, 5, 6, 7].map((d) => (
          <div key={d} className="flex flex-wrap items-center gap-3">
            <label className="flex w-32 items-center gap-2 text-sm">
              <input type="checkbox" className="accent-ink-strong" checked={Boolean(days[d])}
                onChange={(e) => setDays({ ...days, [d]: e.target.checked ? { open: '09:00', close: '18:00' } : null })} />
              {weekdays[d]}
            </label>
            {days[d] && (
              <>
                <input type="time" aria-label={`Apertura ${weekdays[d]}`} value={days[d]!.open} onChange={(e) => setDays({ ...days, [d]: { ...days[d]!, open: e.target.value } })} className="rounded border border-line px-2 py-1 font-mono text-sm" />
                <span className="text-muted">a</span>
                <input type="time" aria-label={`Cierre ${weekdays[d]}`} value={days[d]!.close} onChange={(e) => setDays({ ...days, [d]: { ...days[d]!, close: e.target.value } })} className="rounded border border-line px-2 py-1 font-mono text-sm" />
              </>
            )}
          </div>
        ))}
        <FormError>{save.isError ? errorMessage(save.error) : undefined}</FormError>
        {save.isSuccess && <p className="text-sm text-green-fg">Guardado.</p>}
        <Button onClick={() => save.mutate()} disabled={save.isPending}>Guardar horario</Button>
      </Card>
    </Section>
  );
}

function Holidays() {
  const refresh = useRefresh();
  const { data } = useAdminSettings();
  const [form, setForm] = useState({ date: isoDay(), name: '' });
  const add = useMutation({ mutationFn: () => send('/admin/holidays', 'POST', form), onSuccess: () => { setForm({ ...form, name: '' }); refresh(); } });
  const remove = useMutation({ mutationFn: (date: string) => send(`/admin/holidays/${date}`, 'DELETE'), onSuccess: refresh });
  return (
    <Section title="Feriados">
      <Card className="space-y-4">
        <p className="text-sm text-muted">No se atiende y no cuentan como días hábiles. Cargá los feriados nacionales del año (y los puentes que tome el centro).</p>
        <ul className="divide-y divide-line text-sm">
          {data?.holidays.map((h) => (
            <li key={h.date} className="flex items-center justify-between py-2">
              <span><span className="font-mono">{h.date.split('-').reverse().join('/')}</span> · {h.name}</span>
              <Button variant="ghost" className="py-1" onClick={() => remove.mutate(h.date)}>Quitar</Button>
            </li>
          ))}
        </ul>
        <div className="grid gap-3 sm:grid-cols-[auto_1fr_auto] sm:items-end">
          <Field label="Fecha" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          <Field label="Nombre" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Button variant="secondary" disabled={form.name.length < 2} onClick={() => add.mutate()}>Agregar</Button>
        </div>
      </Card>
    </Section>
  );
}

const ruleFields: { key: string; label: string; hint?: string; step?: number }[] = [
  { key: 'bufferMin', label: 'Tiempo entre turnos (min)' },
  { key: 'holdMin', label: 'Reserva mientras se paga (min)' },
  { key: 'noticeBusinessDays', label: 'Días hábiles completos de aviso', hint: '2 = turno del lunes, cambios hasta el miércoles anterior' },
  { key: 'maxReschedules', label: 'Reprogramaciones por turno' },
  { key: 'creditValidDays', label: 'Validez del saldo a favor (días)' },
  { key: 'waitlistPriorityMin', label: 'Ventaja de cumplidoras en alertas (min)' },
  { key: 'maxAlertsPerWeek', label: 'Alertas por clienta por semana' },
  { key: 'reliableMinVisits', label: 'Cumplidora: turnos mínimos' },
  { key: 'reliableMinRate', label: 'Cumplidora: asistencia mínima (0 a 1)', step: 0.05 },
];

function Rules() {
  const refresh = useRefresh();
  const { data } = useAdminSettings();
  const [values, setValues] = useState<Record<string, number>>({});
  useEffect(() => {
    if (data) setValues(data.settings);
  }, [data]);
  const save = useMutation({ mutationFn: () => send('/admin/settings', 'PUT', values), onSuccess: refresh });
  return (
    <Section title="Reglas">
      <Card className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-3">
          {ruleFields.map((f) => (
            <Field key={f.key} label={f.label} hint={f.hint} type="number" step={f.step ?? 1} min={0}
              value={values[f.key] ?? ''} onChange={(e) => setValues({ ...values, [f.key]: Number(e.target.value) })} />
          ))}
        </div>
        <FormError>{save.isError ? errorMessage(save.error) : undefined}</FormError>
        {save.isSuccess && <p className="text-sm text-green-fg">Guardado.</p>}
        <Button onClick={() => save.mutate()} disabled={save.isPending}>Guardar reglas</Button>
      </Card>
    </Section>
  );
}
