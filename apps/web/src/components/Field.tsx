import type { InputHTMLAttributes } from 'react';
import { fieldClass } from './ui';

export function Field({ label, hint, ...props }: { label: string; hint?: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block text-sm font-medium text-ink">
      {label}
      <input {...props} className={fieldClass} />
      {hint && <span className="mt-1.5 block text-xs font-normal text-muted">{hint}</span>}
    </label>
  );
}

export function FormError({ children }: { children?: string }) {
  if (!children) return null;
  return <p role="alert" className="rounded-lg bg-red-bg px-3.5 py-2.5 text-sm text-red-fg">{children}</p>;
}

export function SubmitButton({ children, pending }: { children: string; pending?: boolean }) {
  return (
    <button type="submit" disabled={pending}
      className="inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-peach px-4 py-2.5 text-[15px] font-medium text-n8 transition hover:bg-[#b07a7d] active:scale-[0.98] disabled:opacity-50">
      {pending ? 'Un momento…' : children}
    </button>
  );
}
