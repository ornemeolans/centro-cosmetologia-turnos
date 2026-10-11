import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Field, FormError } from '../../components/Field';
import { ArrowRight, Plus } from '../../components/icons';
import { Badge, Button, Dialog, Empty, PageHeader } from '../../components/ui';
import { api, ApiError, send } from '../../lib/api';
import { errorMessage, useMe } from '../../lib/auth';

interface RecordRow {
  id: string; firstName: string; lastName: string; email: string; phoneE164: string | null; status: string;
  linked: boolean; isReliable: boolean; ownerProfessional: { displayName: string };
}

export function RecordsPage() {
  const { data: me } = useMe();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const { data, isLoading } = useQuery({ queryKey: ['records', q], queryFn: () => api<{ records: RecordRow[] }>(`/staff/client-records?q=${encodeURIComponent(q)}`) });
  const canCreate = me?.user.role === 'PROFESSIONAL' || me?.user.role === 'OWNER';

  return (
    <div className="space-y-6">
      <PageHeader title={me?.user.role === 'RECEPTION' ? 'Clientas' : 'Fichas'} subtitle={me?.user.role === 'PROFESSIONAL' ? 'Tus clientas y las fichas que te compartieron.' : 'Todas las clientas del centro.'}
        action={canCreate && <Button onClick={() => setOpen(true)}><Plus /> Nueva ficha</Button>} />
      <Field label="Buscar" placeholder="Nombre, email o teléfono" value={q} onChange={(e) => setQ(e.target.value)} />
      {isLoading && <p className="text-muted">Cargando…</p>}
      {data?.records.length === 0 && <Empty>No hay fichas que coincidan.</Empty>}
      {Boolean(data?.records.length) && <ul className="divide-y divide-line overflow-hidden rounded-[20px] border border-line/70 bg-surface">
          {data?.records.map((r) => (
            <li key={r.id}>
              <Link to={`/fichas/${r.id}`} className="group flex flex-wrap items-center justify-between gap-3 px-5 py-4 transition-colors hover:bg-sunken">
                <span className="flex min-w-0 items-center gap-4">
                  <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-full bg-daisy font-mono text-[13px] text-ink-strong">
                    {r.firstName[0]}{r.lastName[0]}
                  </span>
                  <span className="min-w-0">
                    <span className="font-medium text-ink-strong">{r.lastName}, {r.firstName}</span>
                    <span className="block truncate font-mono text-[12px] text-muted">{r.email} · titular: {r.ownerProfessional.displayName}</span>
                  </span>
                </span>
                <span className="flex items-center gap-1.5">
                  {r.status === 'PRIMERA_VEZ' && <Badge tone="blue">Primera vez</Badge>}
                  {r.isReliable && <Badge tone="green">Cumplidora</Badge>}
                  {!r.linked && <Badge>Sin cuenta</Badge>}
                  <ArrowRight className="ml-2 text-muted transition-transform group-hover:translate-x-0.5" />
                </span>
              </Link>
            </li>
          ))}
      </ul>}
      <Dialog open={open} onClose={() => setOpen(false)} title="Nueva ficha">
        <NewRecordForm />
      </Dialog>
    </div>
  );
}

function NewRecordForm() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', phoneE164: '', birthDate: '' });
  const create = useMutation({
    mutationFn: () => send<{ id: string }>('/staff/client-records', 'POST', {
      ...form, phoneE164: form.phoneE164 ? form.phoneE164.replace(/[\s-]/g, '') : undefined, birthDate: form.birthDate || undefined,
    }),
    onSuccess: async ({ id }) => {
      await qc.invalidateQueries({ queryKey: ['records'] });
      navigate(`/fichas/${id}`);
    },
  });
  const existing = create.error instanceof ApiError && create.error.code === 'RECORD_EXISTS' ? (create.error.body.recordId as string) : null;
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });
  function onSubmit(e: FormEvent) {
    e.preventDefault();
    create.mutate();
  }
  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nombre" required value={form.firstName} onChange={set('firstName')} />
        <Field label="Apellido" required value={form.lastName} onChange={set('lastName')} />
      </div>
      <Field label="Email" type="email" required value={form.email} onChange={set('email')} hint="Cuando la clienta entre con este email, la ficha se vincula sola." />
      <Field label="Celular" type="tel" placeholder="351 732 6453" hint="Con código de área, sin el 0 ni el 15." value={form.phoneE164} onChange={set('phoneE164')} />
      <Field label="Fecha de nacimiento" type="date" value={form.birthDate} onChange={set('birthDate')} />
      <FormError>{create.isError ? errorMessage(create.error) : undefined}</FormError>
      {existing && <Link className="text-sm underline" to={`/fichas/${existing}`}>Abrir la ficha existente</Link>}
      <Button type="submit" disabled={create.isPending}>Crear ficha</Button>
    </form>
  );
}
