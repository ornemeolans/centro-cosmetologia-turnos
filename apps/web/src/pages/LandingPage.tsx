import { Link, Navigate } from 'react-router-dom';
import { ArrowRight, WhatsApp } from '../components/icons';
import { Eyebrow } from '../components/ui';
import { CENTER_WHATSAPP } from '../lib/api';
import { homeFor, useMe } from '../lib/auth';

const firstVisitMessage = encodeURIComponent('Hola, quiero pedir mi primer turno');

const steps = [
  { n: '01', dot: 'bg-olive', title: 'Elegí tu tratamiento', text: 'Ves solo los que tu cosmetóloga te indicó, con su duración y precio.' },
  { n: '02', dot: 'bg-golden', title: 'Reservá con seña', text: 'Asegurás el horario con Mercado Pago. El resto se abona en el local.' },
  { n: '03', dot: 'bg-rose', title: 'Recibí la confirmación', text: 'Por WhatsApp, con un enlace para sumarlo a tu calendario.' },
];

export function LandingPage() {
  const { data: me } = useMe();
  if (me) return <Navigate to={homeFor(me.user.role)} replace />;

  return (
    <div className="space-y-16 sm:space-y-24">
      <section className="flex flex-col items-center pt-6 text-center sm:pt-14">
        <Eyebrow>Turnos. Señas. Recordatorios.</Eyebrow>
        <h1 className="mt-6 max-w-4xl text-[2.9rem] leading-[1.02] sm:text-[4.6rem]">
          Tu próximo turno, en tres pasos<span className="text-peach">.</span>
        </h1>
        <p className="mt-6 max-w-[52ch] text-lg text-muted">
          Si ya sos clienta, ingresá con el email que le diste a tu cosmetóloga para ver tus turnos, sus recomendaciones y reservar.
        </p>
        <div className="mt-9 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
          <Link to="/ingresar"
            className="inline-flex min-h-12 items-center justify-center gap-3 rounded-lg bg-peach px-6 font-medium text-n8 transition hover:bg-[#b07a7d] active:scale-[0.98]">
            Ingresar <ArrowRight />
          </Link>
          <a href={`https://wa.me/${CENTER_WHATSAPP}?text=${firstVisitMessage}`} target="_blank" rel="noreferrer"
            className="inline-flex min-h-12 items-center justify-center gap-2.5 rounded-lg border border-line bg-surface px-6 font-medium text-ink-strong transition hover:border-n4">
            <WhatsApp /> Primera vez: pedí tu turno
          </a>
        </div>
      </section>

      <section className="rounded-[24px] bg-panel p-6 text-daisy sm:p-10">
        <Eyebrow className="text-daisy/70">Cómo funciona</Eyebrow>
        <ol className="mt-8 grid gap-px overflow-hidden rounded-2xl bg-panel-2 sm:grid-cols-3">
          {steps.map((s) => (
            <li key={s.n} className="bg-panel p-1 sm:p-0 sm:pr-6 [&:not(:first-child)]:sm:pl-6">
              <div className="flex items-center gap-3 font-mono text-[13px] text-daisy/60">
                <span className={`size-2 rounded-full ${s.dot}`} />
                {s.n}
              </div>
              <h2 className="mt-4 text-2xl text-daisy">{s.title}</h2>
              <p className="mt-2 pb-6 text-daisy/70 sm:pb-0">{s.text}</p>
            </li>
          ))}
        </ol>
        <p className="mt-8 border-t border-panel-2 pt-6 font-mono text-[13px] text-daisy/60">
          Podés cambiar o cancelar sin perder la seña hasta 2 días hábiles antes del turno.
        </p>
      </section>
    </div>
  );
}
