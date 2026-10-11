import { z } from 'zod';

export const createAppointmentSchema = z.object({
  professionalId: z.string().uuid(),
  treatmentIds: z.array(z.string().uuid()).min(1).max(4),
  startAt: z.string().datetime({ offset: true }),
});
export type CreateAppointmentInput = z.infer<typeof createAppointmentSchema>;

export const cancelAppointmentSchema = z.object({
  /** Obligatorio en una cancelación fuera de plazo: la clienta acepta perder la seña. */
  acceptForfeit: z.boolean().optional(),
});

export const forceChangeSchema = z.object({
  action: z.enum(['RESCHEDULE', 'CANCEL']),
  newStartAt: z.string().datetime({ offset: true }).optional(),
  reason: z.string().min(5),
});

/**
 * Convierte un celular escrito como se usa en Argentina al formato internacional que pide WhatsApp.
 * Acepta: 3517326453 · 0351 15 732-6453 · 351 15 7326453 · 54 351 7326453 · +54 9 351 732 6453.
 * Un número que ya empieza con + y no es argentino se deja como está.
 */
export function normalizePhone(input: string): string {
  const raw = input.trim();
  let d = raw.replace(/\D/g, '');
  if (raw.startsWith('+') && !d.startsWith('54')) return `+${d}`;
  if (d.startsWith('54')) d = d.slice(2);
  if (d.startsWith('9') && d.length === 11) d = d.slice(1);
  if (d.startsWith('0')) d = d.slice(1);
  // Código de área de 2, 3 o 4 dígitos seguido de "15": se quita el 15.
  if (d.length === 12) {
    for (const area of [2, 3, 4]) {
      if (d.slice(area, area + 2) === '15') {
        d = d.slice(0, area) + d.slice(area + 2);
        break;
      }
    }
  }
  return d.length === 10 ? `+549${d}` : raw.startsWith('+') ? `+${d}` : d;
}

export const phoneE164 = z
  .string()
  .transform(normalizePhone)
  .pipe(z.string().regex(/^\+\d{10,15}$/, 'Revisá el celular: con código de área, por ejemplo 351 732 6453'));

export const phoneSchema = z.object({ phoneE164 });

export const firstVisitRecordSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email(),
  phoneE164: phoneSchema.shape.phoneE164,
  ownerProfessionalId: z.string().uuid(),
});
