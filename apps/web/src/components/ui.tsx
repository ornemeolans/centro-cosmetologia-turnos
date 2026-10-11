import { useEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { ArrowRight, Close } from './icons';

type Variant = 'primary' | 'dark' | 'secondary' | 'danger' | 'ghost';

const variants: Record<Variant, string> = {
  primary: 'bg-peach text-n8 hover:bg-[#b07a7d]',
  dark: 'bg-panel text-daisy hover:bg-panel-2',
  secondary: 'border border-line bg-surface text-ink-strong hover:border-n4',
  danger: 'bg-red-bg text-red-fg hover:bg-[#efcfc8]',
  ghost: 'text-ink hover:bg-sunken',
};

export function Button({ variant = 'primary', className = '', ...props }: { variant?: Variant } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-4 py-2 text-[15px] font-medium transition-[background-color,border-color,transform] duration-200 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45 ${variants[variant]} ${className}`}
    />
  );
}

/** Botón cuadrado de acento con flecha: la acción principal de cada bloque. */
export function ArrowButton({ label, className = '', ...props }: { label: string } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" aria-label={label} {...props}
      className={`grid size-11 shrink-0 place-items-center rounded-lg bg-peach text-n8 transition hover:bg-[#b07a7d] active:scale-95 disabled:opacity-45 ${className}`}>
      <ArrowRight />
    </button>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-[20px] border border-line/70 bg-surface p-5 sm:p-7 ${className}`}>{children}</div>;
}

/** Panel oscuro de oliva profundo: para el bloque que más importa de cada pantalla. */
export function Panel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-[24px] bg-panel p-6 text-daisy sm:p-9 [&_h1]:text-daisy [&_h2]:text-daisy [&_h3]:text-daisy ${className}`}>{children}</div>;
}

type Tone = 'gray' | 'red' | 'blue' | 'green' | 'yellow';
const tones: Record<Tone, string> = {
  gray: 'bg-sunken text-muted',
  red: 'bg-red-bg text-red-fg',
  blue: 'bg-blue-bg text-blue-fg',
  green: 'bg-green-bg text-green-fg',
  yellow: 'bg-yellow-bg text-yellow-fg',
};
const dots: Record<Tone, string> = {
  gray: 'bg-n5', red: 'bg-red-fg', blue: 'bg-blue-fg', green: 'bg-green-fg', yellow: 'bg-yellow-fg',
};

export function Badge({ tone = 'gray', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[11px] font-medium uppercase tracking-wide ${tones[tone]}`}>
      <span className={`size-1.5 rounded-full ${dots[tone]}`} />
      {children}
    </span>
  );
}

/** Dato técnico: monoespaciada con un punto de color (duración, precio, seña, hora). */
export function Datum({ children, dot = 'bg-peach', className = '' }: { children: ReactNode; dot?: string; className?: string }) {
  return (
    <span className={`data inline-flex items-center gap-2 font-mono text-[13px] text-muted ${className}`}>
      <span className={`size-1.5 shrink-0 rounded-full ${dot}`} />
      {children}
    </span>
  );
}

/** Etiqueta de sección: punto de color y texto en monoespaciada, como "• Precisión. Tiempo real." */
export function Eyebrow({ children, dot = 'bg-rose', className = 'text-muted' }: { children: ReactNode; dot?: string; className?: string }) {
  return (
    <p className={`inline-flex items-center gap-2.5 font-mono text-[13px] ${className}`}>
      <span className={`size-2 shrink-0 rounded-full ${dot}`} />
      {children}
    </p>
  );
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-10 flex flex-wrap items-end justify-between gap-6">
      <div className="max-w-3xl">
        <h1 className="text-[2.6rem] leading-[1.02] sm:text-[3.6rem]">
          {title}{!/[.!?…]$/.test(title) && <span className="text-peach">.</span>}
        </h1>
        {subtitle && <p className="mt-3 max-w-[60ch] text-lg text-muted first-letter:uppercase">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function Section({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="space-y-5">
      <div className="flex items-end justify-between gap-4">
        <h2 className="text-[1.75rem]">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-[20px] border border-dashed border-n4 bg-surface/60 px-5 py-8 text-center text-muted">{children}</p>;
}

/** Diálogo modal nativo (<dialog>): foco atrapado y Escape para cerrar, sin librerías. */
export function Dialog({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-label={title}
      className="m-auto w-[min(34rem,calc(100vw-1.5rem))] rounded-[24px] border border-line bg-surface p-0 text-ink shadow-[0_24px_60px_-20px_rgb(40_40_30/0.35)]"
    >
      <div className="flex items-center justify-between gap-4 px-6 pb-2 pt-5">
        <h2 className="text-2xl">{title}</h2>
        <button type="button" onClick={onClose} aria-label="Cerrar"
          className="grid size-9 place-items-center rounded-lg text-muted hover:bg-sunken hover:text-ink-strong">
          <Close />
        </button>
      </div>
      <div className="max-h-[72vh] overflow-y-auto px-6 pb-6 pt-2">{open && children}</div>
    </dialog>
  );
}

export function Tabs<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return (
    <div role="tablist" className="flex gap-1 overflow-x-auto rounded-xl bg-sunken p-1">
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          type="button"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className="whitespace-nowrap rounded-lg px-3.5 py-2 text-sm text-muted transition hover:text-ink-strong aria-selected:bg-surface aria-selected:text-ink-strong aria-selected:shadow-[0_1px_2px_rgb(40_40_30/0.12)]"
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

const fieldClass = 'mt-1.5 w-full rounded-lg border border-line bg-surface px-3.5 py-2.5 text-[15px] text-ink-strong transition-colors hover:border-n4 focus:border-n6 focus:outline-none';

export function Select({ label, children, ...props }: { label: string } & React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <label className="block text-sm font-medium text-ink">
      {label}
      <select {...props} className={fieldClass}>{children}</select>
    </label>
  );
}

export function Textarea({ label, ...props }: { label: string } & React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <label className="block text-sm font-medium text-ink">
      {label}
      <textarea {...props} className={fieldClass} />
    </label>
  );
}

export { fieldClass };
