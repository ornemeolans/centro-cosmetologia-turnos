import type { SVGProps } from 'react';

/** Íconos propios: trazo de 1.6, puntas redondeadas, 20×20. */
const base = (props: SVGProps<SVGSVGElement>) => ({
  width: 20, height: 20, viewBox: '0 0 20 20', fill: 'none', stroke: 'currentColor',
  strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true, ...props,
});

export const ArrowRight = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><path d="M4 10h12M11 5l5 5-5 5" /></svg>;
export const ArrowLeft = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><path d="M16 10H4M9 5l-5 5 5 5" /></svg>;
export const ArrowDown = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><path d="M10 4v12M5 11l5 5 5-5" /></svg>;
export const Close = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><path d="M5 5l10 10M15 5L5 15" /></svg>;
export const Check = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><path d="M4 10.5l4 4 8-9" /></svg>;
export const Calendar = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><rect x="3" y="4.5" width="14" height="12" rx="2" /><path d="M3 8.5h14M7 3v3M13 3v3" /></svg>
);
export const Download = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><path d="M10 3v10M6 9l4 4 4-4M4 16h12" /></svg>;
export const Plus = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><path d="M10 4v12M4 10h12" /></svg>;
export const Menu = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><path d="M3.5 6h13M3.5 10h13M3.5 14h13" /></svg>;
export const WhatsApp = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M4.2 15.8l.9-3.1A6.4 6.4 0 1 1 7.6 15l-3.4.8z" /><path d="M8 7.6c.2 1.9 1.7 3.6 3.9 4.2l.9-1-1.4-.8-.6.6c-.8-.3-1.5-1-1.8-1.8l.6-.6-.8-1.4-.8.8z" strokeWidth={1.2} /></svg>
);

/** Marca provisoria: cuatro barras con los colores de la paleta, como las líneas de tratamiento. */
export function BrandMark({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 28 28" className={className} aria-hidden="true">
      <rect x="2" y="3" width="24" height="4" rx="2" fill="#a3a380" />
      <rect x="2" y="9.3" width="24" height="4" rx="2" fill="#d7ce93" />
      <rect x="2" y="15.6" width="24" height="4" rx="2" fill="#d8a48f" />
      <rect x="2" y="21.9" width="24" height="4" rx="2" fill="#bb8588" />
    </svg>
  );
}

/** Logo de Google para el botón de ingreso (colores oficiales). */
export function GoogleMark({ className = 'size-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.3 0-9.7-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}
