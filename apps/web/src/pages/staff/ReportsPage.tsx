import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Field } from '../../components/Field';
import { Badge, Card, Empty, Eyebrow, PageHeader, Panel, Section } from '../../components/ui';
import { api } from '../../lib/api';
import { money } from '../../lib/format';

interface Summary {
  scope: 'ALL' | 'OWN';
  professionals: {
    professional: { id: string; displayName: string };
    occupancy: { bookedMinutes: number; availableMinutes: number; rate: number };
    activity: { completed: number; upcoming: number; noShows: number; canceledOnTime: number; canceledLate: number; forced: number; firstVisits: number };
    money: { depositsCollectedCents: number; depositsForfeitedCents: number; creditsOutstandingCents: number };
    waitlistAlertsSent: number;
    treatments: { name: string; count: number; revenueCents: number }[];
  }[];
  clients: { id: string; name: string; isReliable: boolean; completed: number; noShows: number; lateCancellations: number; rate: number }[];
}

const monthStart = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toLocaleDateString('en-CA');
};
const monthEnd = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).toLocaleDateString('en-CA');
};
const pct = (n: number) => `${Math.round(n * 100)}%`;

export function ReportsPage() {
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(monthEnd());
  const { data } = useQuery({ queryKey: ['reports', from, to], queryFn: () => api<Summary>(`/reports/summary?from=${from}&to=${to}`) });

  return (
    <div className="space-y-12">
      <PageHeader title="Reportes" subtitle={data?.scope === 'ALL' ? 'Tablero general del centro.' : 'Tus números.'} />
      <div className="flex flex-wrap gap-3 [&>label]:w-44">
        <Field label="Desde" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <Field label="Hasta" type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
      </div>

      {data && data.professionals.length > 1 && (
        <Section title="Comparación entre profesionales">
          <Card className="overflow-x-auto p-0 sm:p-0">
            <table className="w-full min-w-[44rem] text-sm">
              <thead className="text-left font-mono text-[11px] uppercase tracking-wider text-muted">
                <tr className="border-b border-line">
                  {['Profesional', 'Ocupación', 'Realizados', 'Ausencias', 'Canc. tardías', 'Forzados', 'Señas cobradas', 'Saldos vigentes'].map((h) => <th key={h} className="px-4 py-3 font-normal">{h}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-line font-mono">
                {data.professionals.map((p) => (
                  <tr key={p.professional.id}>
                    <td className="px-4 py-3 font-sans text-ink-strong">{p.professional.displayName}</td>
                    <td className="px-4">{pct(p.occupancy.rate)}</td>
                    <td className="px-4">{p.activity.completed}</td>
                    <td className="px-4">{p.activity.noShows}</td>
                    <td className="px-4">{p.activity.canceledLate}</td>
                    <td className="px-4">{p.activity.forced}</td>
                    <td className="px-4">{money(p.money.depositsCollectedCents)}</td>
                    <td className="px-4">{money(p.money.creditsOutstandingCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </Section>
      )}

      {data?.professionals.map((p) => (
        <Section key={p.professional.id} title={p.professional.displayName}>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat dark label="Ocupación" value={pct(p.occupancy.rate)} note={`${Math.round(p.occupancy.bookedMinutes / 60)} de ${Math.round(p.occupancy.availableMinutes / 60)} h`} />
            <Stat label="Turnos realizados" value={String(p.activity.completed)} note={`${p.activity.upcoming} por venir · ${p.activity.firstVisits} primera vez`} />
            <Stat label="Ausencias y cancelaciones tardías" value={String(p.activity.noShows + p.activity.canceledLate)} note={`Señas no reintegradas: ${money(p.money.depositsForfeitedCents)}`} />
            <Stat label="Señas cobradas" value={money(p.money.depositsCollectedCents)} note={`Saldos a favor vigentes: ${money(p.money.creditsOutstandingCents)}`} />
          </div>
          {p.treatments.length > 0 && (
            <Card>
              <Eyebrow className="mb-5 text-muted">Tratamientos</Eyebrow>
              <ul className="space-y-3 text-sm">
                {p.treatments.map((t, i) => {
                  const max = p.treatments[0].count;
                  const bars = ['bg-olive', 'bg-golden', 'bg-rose', 'bg-peach'];
                  return (
                    <li key={t.name} className="grid grid-cols-[minmax(8rem,14rem)_1fr_auto] items-center gap-3">
                      <span className="truncate">{t.name}</span>
                      <span className="h-2 rounded-full bg-sunken"><span className={`block h-2 rounded-full ${bars[i % bars.length]}`} style={{ width: `${(t.count / max) * 100}%` }} /></span>
                      <span className="font-mono text-[12px] text-muted">{t.count} · {money(t.revenueCents)}</span>
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}
        </Section>
      ))}

      <Section title="Cumplimiento de clientas (últimos 6 meses)">
        {data?.clients.length === 0 && <Empty>Todavía no hay turnos terminados para medir.</Empty>}
        {Boolean(data?.clients.length) && <Card className="overflow-x-auto p-0 sm:p-0">
          <table className="w-full min-w-[32rem] text-sm">
            <thead className="text-left font-mono text-[11px] uppercase tracking-wider text-muted">
              <tr className="border-b border-line">{['Clienta', 'Asistencia', 'Realizados', 'Ausencias', 'Canc. tardías', ''].map((h) => <th key={h} className="px-4 py-3 font-normal">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-line">
              {data?.clients.map((c) => (
                <tr key={c.id}>
                  <td className="px-4 py-3 text-ink-strong">{c.name}</td>
                  <td className="px-4 font-mono">{pct(c.rate)}</td>
                  <td className="px-4 font-mono">{c.completed}</td>
                  <td className="px-4 font-mono">{c.noShows}</td>
                  <td className="px-4 font-mono">{c.lateCancellations}</td>
                  <td className="px-4">{c.isReliable && <Badge tone="green">Cumplidora</Badge>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>}
      </Section>
    </div>
  );
}

/** Cifra destacada: la primera de cada profesional va en panel oscuro, como en el tablero de referencia. */
function Stat({ label, value, note, dark = false }: { label: string; value: string; note: string; dark?: boolean }) {
  const Box = dark ? Panel : Card;
  return (
    <Box className="flex flex-col p-5 sm:p-6">
      <Eyebrow dot={dark ? 'bg-golden' : 'bg-rose'} className={dark ? 'text-daisy/70' : 'text-muted'}>{label}</Eyebrow>
      <p className={`mt-auto pt-6 font-mono text-[2.1rem] leading-none ${dark ? 'text-golden' : 'text-ink-strong'}`}>{value}</p>
      <p className={`mt-3 text-sm ${dark ? 'text-daisy/65' : 'text-muted'}`}>{note}</p>
    </Box>
  );
}
