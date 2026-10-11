import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { Field, FormError } from '../../components/Field';
import { Badge, Button, Card, Empty, PageHeader, Select, Tabs, Textarea } from '../../components/ui';
import { api, ApiError, send } from '../../lib/api';
import { errorMessage, useMe } from '../../lib/auth';
import { dateTimeLabel, money, statusLabel } from '../../lib/format';

interface RecordDetail {
  access: 'FULL' | 'CONTACT';
  record: {
    id: string; firstName: string; lastName: string; email: string; phoneE164: string | null; status: string; linked: boolean;
    isReliable: boolean; ownerProfessional: { id: string; displayName: string };
    birthDate?: string | null; skinType?: string | null; antecedentes?: string | null; alergias?: string | null; medicacion?: string | null;
  };
  appointments: { id: string; startAt: string; status: string; professional: string; treatments: string[]; isFirstVisit: boolean }[];
  consents?: { id: string; type: string; documentVersion: string; signedAt: string; revokedAt: string | null }[];
  entries?: { id: string; notes: string; createdAt: string }[];
  recommendations?: { id: string; body: string; visibleToClient: boolean; createdAt: string }[];
  grants?: { professionalId: string; displayName: string }[];
  photos?: { id: string; kind: 'ANTES' | 'DESPUES'; takenAt: string }[];
  credits?: { professionalId: string; amountCents: number }[];
}

type Tab = 'datos' | 'turnos' | 'historia' | 'recomendaciones' | 'consentimientos' | 'fotos' | 'accesos';

export function RecordDetailPage() {
  const { id } = useParams();
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({ queryKey: ['record', id], queryFn: () => api<RecordDetail>(`/staff/client-records/${id}`) });
  const [tab, setTab] = useState<Tab>('datos');
  const refresh = () => qc.invalidateQueries({ queryKey: ['record', id] });
  const complete = useMutation({ mutationFn: () => send(`/staff/client-records/${id}/complete`, 'POST'), onSuccess: refresh });

  if (isLoading) return <p className="text-muted">Cargando…</p>;
  if (error) return <FormError>{errorMessage(error)}</FormError>;
  if (!data) return null;
  const r = data.record;
  const full = data.access === 'FULL';
  const tabs: { value: Tab; label: string }[] = full
    ? [
        { value: 'datos', label: 'Datos' }, { value: 'turnos', label: 'Turnos' }, { value: 'historia', label: 'Historia' },
        { value: 'recomendaciones', label: 'Recomendaciones' }, { value: 'consentimientos', label: 'Consentimientos' },
        { value: 'fotos', label: 'Fotos' }, { value: 'accesos', label: 'Accesos' },
      ]
    : [{ value: 'datos', label: 'Contacto' }, { value: 'turnos', label: 'Turnos' }];

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${r.firstName} ${r.lastName}`}
        subtitle={`${r.email}${r.phoneE164 ? ` · ${r.phoneE164}` : ''} · titular: ${r.ownerProfessional.displayName}`}
        action={full && r.status === 'PRIMERA_VEZ' && (
          <Button onClick={() => complete.mutate()} disabled={complete.isPending}>Ficha completa: habilitar a la clienta</Button>
        )}
      />
      <div className="flex flex-wrap gap-1">
        {r.status === 'PRIMERA_VEZ' && <Badge tone="blue">Primera vez</Badge>}
        {r.isReliable && <Badge tone="green">Cumplidora</Badge>}
        <Badge tone={r.linked ? 'green' : 'gray'}>{r.linked ? 'Cuenta vinculada' : 'Pendiente de que entre con su email'}</Badge>
        {data.credits?.map((c) => <Badge key={c.professionalId} tone="yellow">Saldo a favor {money(c.amountCents)}</Badge>)}
      </div>
      <Tabs value={tab} onChange={setTab} options={tabs} />
      {tab === 'datos' && <DataForm data={data} onSaved={refresh} />}
      {tab === 'turnos' && <Appointments data={data} />}
      {tab === 'historia' && <Entries data={data} onSaved={refresh} />}
      {tab === 'recomendaciones' && <Recommendations data={data} onSaved={refresh} />}
      {tab === 'consentimientos' && <Consents data={data} onSaved={refresh} />}
      {tab === 'fotos' && <Photos data={data} onSaved={refresh} />}
      {tab === 'accesos' && <Access data={data} onSaved={refresh} />}
    </div>
  );
}

function DataForm({ data, onSaved }: { data: RecordDetail; onSaved: () => void }) {
  const r = data.record;
  const full = data.access === 'FULL';
  const [form, setForm] = useState({
    firstName: r.firstName, lastName: r.lastName, email: r.email, phoneE164: r.phoneE164 ?? '',
    birthDate: r.birthDate ?? '', skinType: r.skinType ?? '', antecedentes: r.antecedentes ?? '', alergias: r.alergias ?? '', medicacion: r.medicacion ?? '',
  });
  const save = useMutation({
    mutationFn: () => {
      const body: Record<string, string | undefined> = { firstName: form.firstName, lastName: form.lastName, email: form.email, phoneE164: form.phoneE164 || undefined };
      if (full) Object.assign(body, { birthDate: form.birthDate || undefined, skinType: form.skinType, antecedentes: form.antecedentes, alergias: form.alergias, medicacion: form.medicacion });
      return send(`/staff/client-records/${r.id}`, 'PATCH', body);
    },
    onSuccess: onSaved,
  });
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm({ ...form, [k]: e.target.value });
  function onSubmit(e: FormEvent) {
    e.preventDefault();
    save.mutate();
  }
  return (
    <Card>
      <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
        <Field label="Nombre" required value={form.firstName} onChange={set('firstName')} />
        <Field label="Apellido" required value={form.lastName} onChange={set('lastName')} />
        <Field label="Email" type="email" required value={form.email} onChange={set('email')} hint="Si lo cambiás, la ficha se vincula con la cuenta de ese email." />
        <Field label="Celular" type="tel" value={form.phoneE164} onChange={set('phoneE164')} />
        {full && (
          <>
            <Field label="Fecha de nacimiento" type="date" value={form.birthDate} onChange={set('birthDate')} />
            <Field label="Tipo de piel" value={form.skinType} onChange={set('skinType')} />
            <div className="sm:col-span-2"><Textarea label="Antecedentes" rows={3} value={form.antecedentes} onChange={set('antecedentes')} /></div>
            <Textarea label="Alergias" rows={2} value={form.alergias} onChange={set('alergias')} />
            <Textarea label="Medicación" rows={2} value={form.medicacion} onChange={set('medicacion')} />
          </>
        )}
        <div className="sm:col-span-2 space-y-2">
          <FormError>{save.isError ? errorMessage(save.error) : undefined}</FormError>
          {save.isSuccess && <p className="text-sm text-green-fg">Guardado.</p>}
          <Button type="submit" disabled={save.isPending}>Guardar</Button>
        </div>
      </form>
    </Card>
  );
}

function Appointments({ data }: { data: RecordDetail }) {
  if (!data.appointments.length) return <Empty>Sin turnos.</Empty>;
  return (
    <Card className="p-0 sm:p-0">
      <ul className="divide-y divide-line">
        {data.appointments.map((a) => (
          <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm">
            <span className="inline-block first-letter:uppercase">{dateTimeLabel(a.startAt)} · {a.treatments.join(' + ')} · {a.professional}</span>
            <Badge tone={statusLabel[a.status]?.tone}>{statusLabel[a.status]?.text ?? a.status}</Badge>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function Entries({ data, onSaved }: { data: RecordDetail; onSaved: () => void }) {
  const [notes, setNotes] = useState('');
  const add = useMutation({ mutationFn: () => send(`/staff/client-records/${data.record.id}/entries`, 'POST', { notes }), onSuccess: () => { setNotes(''); onSaved(); } });
  return (
    <div className="space-y-6">
      <Card>
        <Textarea label="Nueva entrada (solo la ve el equipo con acceso)" rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} />
        <FormError>{add.isError ? errorMessage(add.error) : undefined}</FormError>
        <Button className="mt-3" disabled={!notes.trim() || add.isPending} onClick={() => add.mutate()}>Agregar a la historia</Button>
      </Card>
      {data.entries?.length === 0 && <Empty>Sin entradas.</Empty>}
      <ol className="space-y-4">
        {data.entries?.map((e) => (
          <li key={e.id} className="border-l-2 border-line pl-4">
            <p className="text-xs text-muted first-letter:uppercase">{dateTimeLabel(e.createdAt)}</p>
            <p className="whitespace-pre-line">{e.notes}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}

function Recommendations({ data, onSaved }: { data: RecordDetail; onSaved: () => void }) {
  const [body, setBody] = useState('');
  const add = useMutation({ mutationFn: () => send(`/staff/client-records/${data.record.id}/recommendations`, 'POST', { body, visibleToClient: true }), onSuccess: () => { setBody(''); onSaved(); } });
  return (
    <div className="space-y-6">
      <Card>
        <Textarea label="Recomendación para la clienta (la ve en su panel)" rows={4} value={body} onChange={(e) => setBody(e.target.value)} />
        <FormError>{add.isError ? errorMessage(add.error) : undefined}</FormError>
        <Button className="mt-3" disabled={!body.trim() || add.isPending} onClick={() => add.mutate()}>Publicar</Button>
      </Card>
      <ol className="space-y-4">
        {data.recommendations?.map((r) => (
          <li key={r.id} className="border-l-2 border-line pl-4">
            <p className="text-xs text-muted first-letter:uppercase">{dateTimeLabel(r.createdAt)}</p>
            <p className="whitespace-pre-line">{r.body}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}

const consentNames: Record<string, string> = {
  TRATAMIENTO: 'Tratamiento', DATOS_SALUD: 'Datos de salud', FOTOS: 'Fotos antes/después', WHATSAPP: 'Avisos por WhatsApp',
};

function Consents({ data, onSaved }: { data: RecordDetail; onSaved: () => void }) {
  const [type, setType] = useState('TRATAMIENTO');
  const [version, setVersion] = useState('v1');
  const add = useMutation({ mutationFn: () => send(`/staff/client-records/${data.record.id}/consents`, 'POST', { type, documentVersion: version }), onSuccess: onSaved });
  const revoke = useMutation({ mutationFn: (cid: string) => send(`/staff/client-records/${data.record.id}/consents/${cid}`, 'DELETE'), onSuccess: onSaved });
  return (
    <div className="space-y-6">
      <Card>
        <p className="mb-4 text-sm text-muted">Registrá cada consentimiento firmado (Ley 25.326). Revocar el de fotos borra todas las fotos de la ficha.</p>
        <div className="grid gap-3 sm:grid-cols-[1fr_8rem_auto] sm:items-end">
          <Select label="Tipo" value={type} onChange={(e) => setType(e.target.value)}>
            {Object.entries(consentNames).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
          <Field label="Versión del documento" value={version} onChange={(e) => setVersion(e.target.value)} />
          <Button onClick={() => add.mutate()} disabled={add.isPending}>Registrar firmado hoy</Button>
        </div>
      </Card>
      <ul className="divide-y divide-line">
        {data.consents?.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
            <span>{consentNames[c.type]} · {c.documentVersion} · <span className="inline-block first-letter:uppercase">{dateTimeLabel(c.signedAt)}</span></span>
            {c.revokedAt ? <Badge tone="red">Revocado</Badge> : (
              <Button variant="ghost" className="py-1" onClick={() => { if (confirm('¿Revocar este consentimiento?')) revoke.mutate(c.id); }}>Revocar</Button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Las fotos se piden con la cookie de sesión y se muestran como blob: nunca hay una URL pública. */
function PhotoThumb({ recordId, photoId, alt }: { recordId: string; photoId: string; alt: string }) {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    let revoked = false;
    let objectUrl: string | undefined;
    fetch(`/api/v1/staff/client-records/${recordId}/photos/${photoId}`, { credentials: 'include' })
      .then((r) => r.blob())
      .then((b) => {
        if (revoked) return;
        objectUrl = URL.createObjectURL(b);
        setUrl(objectUrl);
      });
    return () => {
      revoked = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [recordId, photoId]);
  return url ? <img src={url} alt={alt} className="aspect-square w-full rounded-lg border border-line object-cover" /> : <div className="aspect-square rounded-lg bg-sunken" />;
}

function Photos({ data, onSaved }: { data: RecordDetail; onSaved: () => void }) {
  const [kind, setKind] = useState<'ANTES' | 'DESPUES'>('ANTES');
  const [err, setErr] = useState<unknown>();
  const hasConsent = data.consents?.some((c) => c.type === 'FOTOS' && !c.revokedAt);
  async function upload(file: File) {
    setErr(undefined);
    const res = await fetch(`/api/v1/staff/client-records/${data.record.id}/photos?kind=${kind}`, {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': file.type }, body: file,
    });
    if (!res.ok) setErr(new ApiError(res.status, (await res.json().catch(() => ({}))).error ?? 'UNKNOWN'));
    else onSaved();
  }
  return (
    <div className="space-y-6">
      {!hasConsent ? <Empty>Para subir fotos, primero registrá el consentimiento de fotos.</Empty> : (
        <Card>
          <div className="flex flex-wrap items-end gap-3">
            <Select label="Momento" value={kind} onChange={(e) => setKind(e.target.value as 'ANTES' | 'DESPUES')}>
              <option value="ANTES">Antes</option>
              <option value="DESPUES">Después</option>
            </Select>
            <label className="cursor-pointer inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-peach px-4 py-2 text-[15px] font-medium text-n8 transition hover:bg-[#b07a7d]">
              Subir foto
              <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
            </label>
          </div>
          <FormError>{err ? errorMessage(err) : undefined}</FormError>
        </Card>
      )}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {data.photos?.map((p) => (
          <figure key={p.id} className="space-y-1">
            <PhotoThumb recordId={data.record.id} photoId={p.id} alt={`${p.kind === 'ANTES' ? 'Antes' : 'Después'}, ${dateTimeLabel(p.takenAt)}`} />
            <figcaption className="text-xs text-muted">{p.kind === 'ANTES' ? 'Antes' : 'Después'} · {dateTimeLabel(p.takenAt)}</figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}

function Access({ data, onSaved }: { data: RecordDetail; onSaved: () => void }) {
  const { data: me } = useMe();
  const pros = useQuery({ queryKey: ['professionals'], queryFn: () => api<{ professionals: { id: string; displayName: string }[] }>('/professionals') });
  const [pick, setPick] = useState('');
  const base = `/staff/client-records/${data.record.id}`;
  const grant = useMutation({ mutationFn: () => send(`${base}/grants`, 'POST', { professionalId: pick }), onSuccess: onSaved });
  const revoke = useMutation({ mutationFn: (pid: string) => send(`${base}/grants/${pid}`, 'DELETE'), onSuccess: onSaved });
  const titular = useMutation({ mutationFn: () => send(`${base}/owner`, 'PATCH', { professionalId: pick }), onSuccess: onSaved });
  const others = pros.data?.professionals.filter((p) => p.id !== data.record.ownerProfessional.id) ?? [];
  const error = grant.error ?? revoke.error ?? titular.error;
  return (
    <Card className="space-y-5">
      <p className="text-sm text-muted">
        Titular: <strong className="text-ink-strong">{data.record.ownerProfessional.displayName}</strong>. Solo la titular o la dueña pueden compartir la ficha o cambiar de titular{me?.user.role === 'OWNER' ? '' : ' (si no sos titular, vas a ver un error)'}.
      </p>
      <ul className="divide-y divide-line">
        {data.grants?.length === 0 && <li className="py-2 text-sm text-muted">No está compartida con nadie más.</li>}
        {data.grants?.map((g) => (
          <li key={g.professionalId} className="flex items-center justify-between py-2 text-sm">
            {g.displayName}
            <Button variant="ghost" className="py-1" onClick={() => revoke.mutate(g.professionalId)}>Quitar acceso</Button>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-end gap-2">
        <Select label="Profesional" value={pick} onChange={(e) => setPick(e.target.value)}>
          <option value="" disabled>Elegí</option>
          {others.map((p) => <option key={p.id} value={p.id}>{p.displayName}</option>)}
        </Select>
        <Button variant="secondary" disabled={!pick} onClick={() => grant.mutate()}>Dar acceso</Button>
        <Button variant="secondary" disabled={!pick} onClick={() => titular.mutate()}>Hacerla titular</Button>
      </div>
      <FormError>{error ? errorMessage(error) : undefined}</FormError>
    </Card>
  );
}
