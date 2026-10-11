import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../auth/session';
import { wrap } from '../http';
import { availableSlots } from '../services/availability';
import { verifyOffer } from '../services/offers';

export const availabilityRouter = Router();
availabilityRouter.use(requireAuth);

const querySchema = z.object({
  professionalId: z.string().uuid(),
  treatmentIds: z.string().transform((s) => s.split(',').filter(Boolean)),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** Enlace de una alerta de lista de espera: permite reservar con menos anticipación que la mínima. */
  offer: z.string().optional(),
});

availabilityRouter.get('/', wrap(async (req, res) => {
  const q = querySchema.parse(req.query);
  const staff = req.user!.role !== 'CLIENT';
  const offer = q.offer ? verifyOffer(q.offer) : null;
  const ignoreAdvanceRules = staff || (offer?.professionalId === q.professionalId && offer.date === q.date);

  const { slots, items, durationMin } = await availableSlots({ ...q, ignoreAdvanceRules });
  res.json({ slots, durationMin, items });
}));
