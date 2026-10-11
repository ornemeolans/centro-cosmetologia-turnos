import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Field, FormError } from '../../components/Field';
import { Badge, Button, Card, PageHeader, Section, Select } from '../../components/ui';
import { api, send } from '../../lib/api';
import { errorMessage } from '../../lib/auth';
import { isoDay, weekdays } from '../../lib/format';

interface StaffMe {
  professional: { id: string; displayName: string; minAdvanceHours: number; maxAdvanceDays: number; mpConnected: boolean };
  schedule: { weekday: number; start: string; end: string }[];
  exceptions: { id: string; date: string; start: string | null; end: string | null; type: 'BLOCK' | 'EXTRA'; reason: string | null }[];
  treatments: { treatmentId: string; name: string; offered: boolean; durationMin: number; priceCents: number; depositPercent: number }[];
  combos: [string, string][];
}

export function SettingsPage() {
  const { data } = useQuery({ queryKey: ['staff-me'], queryFn: () => api<StaffMe>('/staff/me') });
  const [params] = useSearchParams();
  if (!data) return <p className="text-muted">Cargando…</p>;
  return (
    <div className="space-y-12">
      <PageHeader title="Mi configuración" subtitle="Lo que ven las clientas al reservar con vos." />
      {params.get('mercadopago') === 'ok' && <p className="rounded-md bg-green-bg px-3 py-2 text-green-fg">Mercado Pago conectado. Ya podés recibir reservas online.</p>}
      {params.get('mercadopago') === 'error' && <p className="rounded-md bg-red-bg px-3 py-2 text-red-fg">No se pudo conectar Mercado Pago. Probá de nuevo.</p>}
      <MercadoPago connected={data.professional.mpConnected} />
      <Schedule initial={data.schedule} />
      <Exceptions items={data.exceptions} />
      <Treatments initial={data.treatments} />
      <Combos treatments={data.treatments.filter((t) => t.offered)} initial={data.combos} />
      <BookingRules p={data.professional} />
    </div>
  );
}

function useSave<T>(path: string, method: 'PUT' | 'PATCH' | 'POST' = 'PUT') {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (body: T) => send(path, method, body), onSuccess: () => qc.invalidateQueries({ queryKey: ['staff-me'] }) });
}

function MercadoPago({ connected }: { connected: boolean }) {
  const qc = useQueryClient();
  const disconnect = useMutation({ mutationFn: () => send('/staff/me/mercadopago', 'DELETE'), onSuccess: () => qc.invalidateQueries({ queryKey: ['staff-me'] }) });
  return (
    <Section title="Mercado Pago">
      <Card className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Badge tone={connected ? 'green' : 'yellow'}>{connected ? 'Conectado' : 'Sin conectar'}</Badge>
          <p className="mt-2 max-w-prose text-sm text-muted">Las señas se cobran en tu propia cuenta. Sin conectarla, las clientas no pueden reservar online con vos (sí podés cargarles turnos sin seña).</p>
        </div>
        {connected
          ? <Button variant="secondary" onClick={() => { if (confirm('¿Desconectar Mercado Pago? Dejás de recibir reservas online.')) disconnect.mutate(); }}>Desconectar</Button>
          : <a href="/api/v1/staff/me/mercadopago/connect" className="rounded-md bg-ink-strong px-4 py-2 text-sm font-medium text-white">Conectar Mercado Pago</a>}
      </Card>
    </Section>
  );
}

function Schedule({ initial }: { initial: StaffMe['schedule'] }) {
  const [blocks, setBlocks] = useState(initial);
  useEffect(() => setBlocks(initial), [initial]);
  const save = useSave<StaffMe['schedule']>('/staff/me/schedule');
  const update = (i: number, patch: Partial<StaffMe['schedule'][number]>) => setBlocks(blocks.map((b, j) => (j === i ? { ...b, ...patch } : b)));
  return (
    <Section title="Horarios de atención" action={<Button variant="secondary" onClick={() => setBlocks([...blocks, { weekday: 1, start: '09:00', end: '13:00' }])}>Agregar franja</Button>}>
      <Card className="space-y-3">
        {blocks.length === 0 && <p className="text-sm text-muted">Sin franjas: nadie puede reservar con vos.</p>}
        {[...blocks.entries()].sort(([, a], [, b]) => a.weekday - b.weekday || a.start.localeCompare(b.start)).map(([i, b]) => (
          <div key={i} className="flex flex-wrap items-end gap-2">
            <Select label="Día" value={b.weekday} onChange={(e) => update(i, { weekday: Number(e.target.value) })}>
              {weekdays.slice(1).map((d, idx) => <option key={d} value={idx + 1}>{d}</option>)}
            </Select>
            <Field label="Desde" type="time" value={b.start} onChange={(e) => update(i, { start: e.target.value })} />
            <Field label="Hasta" type="time" value={b.end} onChange={(e) => update(i, { end: e.target.value })} />
            <Button variant="ghost" onClick={() => setBlocks(blocks.filter((_, j) => j !== i))}>Quitar</Button>
          </div>
        ))}
        <FormError>{save.isError ? errorMessage(save.error) : undefined}</FormError>
        {save.isSuccess && <p className="text-sm text-green-fg">Guardado.</p>}
        <Button onClick={() => save.mutate(blocks)} disabled={save.isPending}>Guardar horarios</Button>
      </Card>
    </Section>
  );
}

function Exceptions({ items }: { items: StaffMe['exceptions'] }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ date: isoDay(), type: 'BLOCK' as 'BLOCK' | 'EXTRA', start: '', end: '', reason: '' });
  const add = useSave<object>('/staff/me/exceptions', 'POST');
  const remove = useMutation({ mutationFn: (id: string) => send(`/staff/me/exceptions/${id}`, 'DELETE'), onSuccess: () => qc.invalidateQueries({ queryKey: ['staff-me'] }) });
  return (
    <Section title="Días libres y horas extra">
      <Card className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-5 sm:items-end">
          <Field label="Fecha" type="date" value={form.date} min={isoDay()} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          <Select label="Tipo" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as 'BLOCK' | 'EXTRA' })}>
            <option value="BLOCK">No atiendo</option>
            <option value="EXTRA">Horas extra</option>
          </Select>
          <Field label="Desde" type="time" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} hint={form.type === 'BLOCK' ? 'Vacío = todo el día' : undefined} />
          <Field label="Hasta" type="time" value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} />
          <Field label="Motivo" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
        </div>
        <FormError>{add.isError ? errorMessage(add.error) : undefined}</FormError>
        <Button variant="secondary" onClick={() => add.mutate({ ...form, start: form.start || undefined, end: form.end || undefined, reason: form.reason || undefined })}>Agregar</Button>
        <ul className="divide-y divide-line text-sm">
          {items.map((e) => (
            <li key={e.id} className="flex items-center justify-between py-2">
              <span>
                {e.date.split('-').reverse().join('/')} · {e.type === 'BLOCK' ? 'No atiendo' : 'Horas extra'}
                {e.start ? ` ${e.start}–${e.end}` : ' (todo el día)'}{e.reason ? ` · ${e.reason}` : ''}
              </span>
              <Button variant="ghost" className="py-1" onClick={() => remove.mutate(e.id)}>Quitar</Button>
            </li>
          ))}
        </ul>
      </Card>
    </Section>
  );
}

function Treatments({ initial }: { initial: StaffMe['treatments'] }) {
  const [rows, setRows] = useState(initial);
  const [name, setName] = useState('');
  useEffect(() => setRows(initial), [initial]);
  const save = useSave<object[]>('/staff/me/treatments');
  const addCatalog = useSave<object>('/staff/me/catalog', 'POST');
  const update = (id: string, patch: Partial<StaffMe['treatments'][number]>) => setRows(rows.map((r) => (r.treatmentId === id ? { ...r, ...patch } : r)));
  return (
    <Section title="Tratamientos">
      <Card className="space-y-4 overflow-x-auto">
        <table className="w-full min-w-[36rem] text-sm">
          <thead className="text-left text-xs uppercase tracking-wider text-muted">
            <tr><th className="py-2 font-medium">Ofrezco</th><th className="font-medium">Tratamiento</th><th className="font-medium">Duración (min)</th><th className="font-medium">Precio ($)</th><th className="font-medium">Seña (%)</th></tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => (
              <tr key={r.treatmentId}>
                <td className="py-2"><input type="checkbox" aria-label={`Ofrezco ${r.name}`} className="accent-ink-strong" checked={r.offered} onChange={(e) => update(r.treatmentId, { offered: e.target.checked })} /></td>
                <td className="pr-3">{r.name}</td>
                <td><input type="number" min={5} step={5} aria-label={`Duración de ${r.name}`} value={r.durationMin} onChange={(e) => update(r.treatmentId, { durationMin: Number(e.target.value) })} className="w-20 rounded border border-line px-2 py-1 font-mono" /></td>
                <td><input type="number" min={0} step={100} aria-label={`Precio de ${r.name}`} value={r.priceCents / 100} onChange={(e) => update(r.treatmentId, { priceCents: Math.round(Number(e.target.value) * 100) })} className="w-28 rounded border border-line px-2 py-1 font-mono" /></td>
                <td><input type="number" min={0} max={100} aria-label={`Seña de ${r.name}`} value={r.depositPercent} onChange={(e) => update(r.treatmentId, { depositPercent: Number(e.target.value) })} className="w-20 rounded border border-line px-2 py-1 font-mono" /></td>
              </tr>
            ))}
          </tbody>
        </table>
        <FormError>{save.isError ? errorMessage(save.error) : undefined}</FormError>
        {save.isSuccess && <p className="text-sm text-green-fg">Guardado.</p>}
        <Button onClick={() => save.mutate(rows)} disabled={save.isPending}>Guardar tratamientos</Button>
        <div className="flex flex-wrap items-end gap-2 border-t border-line pt-4">
          <Field label="¿Falta un tratamiento? Sumalo al catálogo" value={name} onChange={(e) => setName(e.target.value)} />
          <Button variant="secondary" disabled={name.trim().length < 2} onClick={() => addCatalog.mutate({ name: name.trim() }, { onSuccess: () => setName('') })}>Agregar</Button>
        </div>
        <FormError>{addCatalog.isError ? errorMessage(addCatalog.error) : undefined}</FormError>
      </Card>
    </Section>
  );
}

function Combos({ treatments, initial }: { treatments: StaffMe['treatments']; initial: [string, string][] }) {
  const [pairs, setPairs] = useState(new Set(initial.map(([a, b]) => [a, b].sort().join(':'))));
  useEffect(() => setPairs(new Set(initial.map(([a, b]) => [a, b].sort().join(':')))), [initial]);
  const save = useSave<[string, string][]>('/staff/me/combos');
  const toggle = (key: string) => {
    const next = new Set(pairs);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setPairs(next);
  };
  const combos: [string, string, string][] = [];
  treatments.forEach((a, i) => treatments.slice(i + 1).forEach((b) => combos.push([[a.treatmentId, b.treatmentId].sort().join(':'), a.name, b.name])));
  return (
    <Section title="Combos">
      <Card className="space-y-3">
        <p className="text-sm text-muted">Marcá qué tratamientos se pueden hacer juntos en una misma reserva.</p>
        {combos.length === 0 && <p className="text-sm text-muted">Necesitás ofrecer al menos dos tratamientos.</p>}
        <div className="grid gap-2 sm:grid-cols-2">
          {combos.map(([key, a, b]) => (
            <label key={key} className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="accent-ink-strong" checked={pairs.has(key)} onChange={() => toggle(key)} />
              {a} + {b}
            </label>
          ))}
        </div>
        <FormError>{save.isError ? errorMessage(save.error) : undefined}</FormError>
        {save.isSuccess && <p className="text-sm text-green-fg">Guardado.</p>}
        <Button onClick={() => save.mutate([...pairs].map((k) => k.split(':') as [string, string]))}>Guardar combos</Button>
      </Card>
    </Section>
  );
}

function BookingRules({ p }: { p: StaffMe['professional'] }) {
  const [min, setMin] = useState(p.minAdvanceHours);
  const [max, setMax] = useState(p.maxAdvanceDays);
  const save = useSave<object>('/staff/me/booking-rules', 'PATCH');
  return (
    <Section title="Anticipación de reservas online">
      <Card className="flex flex-wrap items-end gap-3">
        <Field label="Mínimo (horas)" type="number" min={0} value={min} onChange={(e) => setMin(Number(e.target.value))} hint="24 = un día" />
        <Field label="Máximo (días)" type="number" min={1} value={max} onChange={(e) => setMax(Number(e.target.value))} />
        <Button onClick={() => save.mutate({ minAdvanceHours: min, maxAdvanceDays: max })} disabled={save.isPending}>Guardar</Button>
        <FormError>{save.isError ? errorMessage(save.error) : undefined}</FormError>
        {save.isSuccess && <p className="text-sm text-green-fg">Guardado.</p>}
      </Card>
    </Section>
  );
}
