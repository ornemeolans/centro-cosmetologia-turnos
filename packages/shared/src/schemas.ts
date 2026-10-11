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

export const phoneSchema = z.object({
  phoneE164: z.string().regex(/^\+\d{10,15}$/, 'Usá el formato internacional, por ejemplo +5491123456789'),
});

export const firstVisitRecordSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email(),
  phoneE164: phoneSchema.shape.phoneE164,
  ownerProfessionalId: z.string().uuid(),
});
