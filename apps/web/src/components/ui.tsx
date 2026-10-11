import { useEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';

const variants: Record<Variant, string> = {
  primary: 'bg-ink-strong text-white hover:bg-[#333333]',
  secondary: 'border border-line bg-surface text-ink-strong hover:bg-sunken',
  danger: 'border border-red-bg bg-red-bg text-red-fg hover:border-red-fg/30',
  ghost: 'text-ink hover:bg-sunken',
};

export function Button({ variant = 'primary', className = '', ...props }: { variant?: Variant } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      className={`inline-flex items-center justify-center gap-2 rounded-md px-3.5 py-2 text-sm font-medium transition active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 ${variants[variant]} ${className}`}
    />
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-line bg-surface p-5 sm:p-6 ${className}`}>{children}</div>;
}

type Tone = 'gray' | 'red' | 'blue' | 'green' | 'yellow';
const tones: Record<Tone, string> = {
  gray: 'bg-sunken text-muted',
  red: 'bg-red-bg text-red-fg',
  blue: 'bg-blue-bg text-blue-fg',
  green: 'bg-green-bg text-green-fg',
  yellow: 'bg-yellow-bg text-yellow-fg',
};

export function Badge({ tone = 'gray', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-wider ${tones[tone]}`}>{children}</span>;
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-3xl sm:text-4xl">{title}</h1>
        {subtitle && <p className="mt-1 text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function Section({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-4 border-b border-line pb-2">
        <h2 className="text-xl">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-lg border border-dashed border-line px-4 py-6 text-center text-sm text-muted">{children}</p>;
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
      className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-xl border border-line bg-surface p-0 text-ink"
    >
      <div className="flex items-center justify-between border-b border-line px-5 py-3">
        <h2 className="text-lg">{title}</h2>
        <button type="button" onClick={onClose} aria-label="Cerrar" className="rounded px-2 text-xl leading-none text-muted hover:text-ink-strong">×</button>
      </div>
      <div className="max-h-[70vh] overflow-y-auto px-5 py-4">{open && children}</div>
    </dialog>
  );
}

export function Tabs<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return (
    <div role="tablist" className="flex gap-1 overflow-x-auto border-b border-line">
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          type="button"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className="-mb-px whitespace-nowrap border-b-2 border-transparent px-3 py-2 text-sm text-muted aria-selected:border-ink-strong aria-selected:text-ink-strong"
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Select({ label, children, ...props }: { label: string } & React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <label className="block text-sm">
      {label}
      <select {...props} className="mt-1 w-full rounded-md border border-line bg-surface px-3 py-2">{children}</select>
    </label>
  );
}

export function Textarea({ label, ...props }: { label: string } & React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <label className="block text-sm">
      {label}
      <textarea {...props} className="mt-1 w-full rounded-md border border-line bg-surface px-3 py-2" />
    </label>
  );
}
