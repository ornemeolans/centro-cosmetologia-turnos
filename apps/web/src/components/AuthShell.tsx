import type { ReactNode } from 'react';
import { BrandMark } from './icons';
import { Card, Eyebrow } from './ui';

const CENTER_NAME = import.meta.env.VITE_CENTER_NAME ?? 'Centro de Cosmetología';

const promises = [
  { dot: 'bg-olive', text: 'Tus turnos y los de tu cosmetóloga, en un solo lugar.' },
  { dot: 'bg-golden', text: 'Seña online con Mercado Pago, el resto en el local.' },
  { dot: 'bg-rose', text: 'Confirmación y recordatorio por WhatsApp.' },
];

/** Pantallas de acceso: panel oscuro con la marca (solo escritorio) y el formulario en una tarjeta. */
export function AuthShell({ eyebrow, title, intro, children, footer }: {
  eyebrow: string; title: string; intro?: ReactNode; children: ReactNode; footer?: ReactNode;
}) {
  return (
    <div className="mx-auto grid max-w-5xl gap-5 lg:grid-cols-[1fr_1.05fr] lg:items-stretch">
      <aside className="hidden flex-col justify-between rounded-[24px] bg-panel p-10 text-daisy lg:flex">
        <span className="flex items-center gap-3 text-lg">
          <BrandMark className="size-8" />
          {CENTER_NAME}
        </span>
        <ul className="space-y-5">
          {promises.map((p) => (
            <li key={p.text} className="flex gap-3.5 text-[17px] leading-snug text-daisy/85">
              <span className={`mt-2 size-2 shrink-0 rounded-full ${p.dot}`} />
              {p.text}
            </li>
          ))}
        </ul>
      </aside>
      <Card className="sm:p-10">
        <Eyebrow>{eyebrow}</Eyebrow>
        <h1 className="mt-4 text-[2.3rem] leading-[1.05] sm:text-[2.7rem]">
          {title}{!/[.!?…]$/.test(title) && <span className="text-peach">.</span>}
        </h1>
        {intro && <div className="mt-3 text-muted">{intro}</div>}
        <div className="mt-8 space-y-5">{children}</div>
        {footer && <div className="mt-8 border-t border-line pt-5 text-sm">{footer}</div>}
      </Card>
    </div>
  );
}

/** Pantalla de estado (pago, calendario): ícono en círculo, título grande y acciones. */
export function StatusCard({ tone = 'neutral', icon, eyebrow, title, text, children }: {
  tone?: 'ok' | 'wait' | 'error' | 'neutral'; icon: ReactNode; eyebrow: string; title: string; text?: ReactNode; children?: ReactNode;
}) {
  const ring = { ok: 'bg-green-bg text-green-fg', wait: 'bg-yellow-bg text-yellow-fg', error: 'bg-red-bg text-red-fg', neutral: 'bg-daisy text-ink-strong' }[tone];
  return (
    <Card className="mx-auto max-w-xl text-center sm:p-12">
      <span className={`mx-auto grid size-16 place-items-center rounded-full ${ring} [&_svg]:size-7`}>{icon}</span>
      <Eyebrow className="mt-6 text-muted">{eyebrow}</Eyebrow>
      <h1 className="mt-3 text-[2.2rem] leading-[1.05] sm:text-[2.6rem]">
        {title}{!/[.!?…]$/.test(title) && <span className="text-peach">.</span>}
      </h1>
      {text && <div className="mx-auto mt-4 max-w-[44ch] text-muted">{text}</div>}
      {children && <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">{children}</div>}
    </Card>
  );
}
