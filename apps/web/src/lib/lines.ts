/**
 * Cada tratamiento tiene su color (su "línea"), estable para siempre: sale de su id.
 * Clases escritas completas para que Tailwind las genere.
 */
const LINES = [
  { band: 'bg-t1', soft: 'bg-t1-bg', border: 'border-t1', text: 'text-[#5c5c44]' },
  { band: 'bg-t2', soft: 'bg-t2-bg', border: 'border-t2', text: 'text-[#6a5f20]' },
  { band: 'bg-t3', soft: 'bg-t3-bg', border: 'border-t3', text: 'text-[#8a4f39]' },
  { band: 'bg-t4', soft: 'bg-t4-bg', border: 'border-t4', text: 'text-[#84494f]' },
  { band: 'bg-t5', soft: 'bg-t5-bg', border: 'border-t5', text: 'text-[#46593f]' },
  { band: 'bg-t6', soft: 'bg-t6-bg', border: 'border-t6', text: 'text-[#7a5428]' },
] as const;

export type Line = (typeof LINES)[number];

export function lineFor(treatmentId: string): Line {
  let h = 0;
  for (const ch of treatmentId) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return LINES[h % LINES.length];
}
