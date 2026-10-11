import { Link, Navigate } from 'react-router-dom';
import { CENTER_WHATSAPP } from '../lib/api';
import { homeFor, useMe } from '../lib/auth';

const firstVisitMessage = encodeURIComponent('Hola, quiero pedir mi primer turno');

export function LandingPage() {
  const { data: me } = useMe();
  if (me) return <Navigate to={homeFor(me.user.role)} replace />;

  return (
    <section className="grid gap-12 py-8 lg:grid-cols-[1.2fr_1fr] lg:items-end lg:py-16">
      <div className="space-y-6">
        <h1 className="text-5xl sm:text-6xl">Reservá tu turno</h1>
        <p className="max-w-prose text-lg text-muted">
          Si ya sos clienta, ingresá con el email que le diste a tu cosmetóloga para ver tus turnos, sus recomendaciones y reservar.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link to="/ingresar" className="rounded-md bg-ink-strong px-5 py-2.5 font-medium text-white hover:bg-[#333333]">Ingresar</Link>
          <a href={`https://wa.me/${CENTER_WHATSAPP}?text=${firstVisitMessage}`} target="_blank" rel="noreferrer"
            className="rounded-md border border-line bg-surface px-5 py-2.5 font-medium text-ink-strong hover:bg-sunken">
            Primera vez: pedir turno por WhatsApp
          </a>
        </div>
      </div>
      <dl className="grid gap-px overflow-hidden rounded-xl border border-line bg-line text-sm sm:grid-cols-2 lg:grid-cols-1">
        {[
          ['Seña online', 'Asegurás tu horario con Mercado Pago. El resto se abona en el local.'],
          ['Confirmación por WhatsApp', 'Con un enlace para sumarlo a tu calendario.'],
          ['Cambios sin perder la seña', 'Hasta 2 días hábiles completos antes del turno.'],
        ].map(([t, d]) => (
          <div key={t} className="bg-surface p-5">
            <dt className="font-medium text-ink-strong">{t}</dt>
            <dd className="mt-1 text-muted">{d}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
