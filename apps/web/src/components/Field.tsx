import type { InputHTMLAttributes } from 'react';

export function Field({ label, hint, ...props }: { label: string; hint?: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block text-sm">
      {label}
      <input {...props} className="mt-1 w-full rounded-md border border-line bg-surface px-3 py-2" />
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

export function FormError({ children }: { children?: string }) {
  if (!children) return null;
  return <p role="alert" className="rounded-md bg-red-bg px-3 py-2 text-sm text-red-fg">{children}</p>;
}

export function SubmitButton({ children, pending }: { children: string; pending?: boolean }) {
  return (
    <button type="submit" disabled={pending}
      className="w-full rounded-md bg-ink-strong px-4 py-2 font-medium text-white transition hover:bg-[#333333] active:scale-[0.98] disabled:opacity-60">
      {pending ? 'Un momento…' : children}
    </button>
  );
}
