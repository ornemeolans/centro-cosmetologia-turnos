import { Router } from 'express';
import { requireAuth } from '../auth/session';
import { prisma } from '../db';
import { notFound, wrap } from '../http';

export const professionalsRouter = Router();
professionalsRouter.use(requireAuth);

/** Lista para elegir profesional (reservas y pedido de cambio de email). Solo datos públicos. */
professionalsRouter.get('/', wrap(async (_req, res) => {
  const professionals = await prisma.professional.findMany({
    where: { isActive: true, userId: { not: null } },
    select: { id: true, displayName: true, mpAccessTokenEnc: true },
    orderBy: { displayName: 'asc' },
  });
  res.json({
    professionals: professionals.map((p) => ({
      id: p.id,
      displayName: p.displayName,
      // Sin Mercado Pago conectado no puede recibir reservas online (solo turnos creados por el staff).
      acceptsOnlineBooking: Boolean(p.mpAccessTokenEnc),
    })),
  });
}));

professionalsRouter.get('/:id/treatments', wrap(async (req, res) => {
  const professional = await prisma.professional.findFirst({ where: { id: req.params.id, isActive: true } });
  if (!professional) throw notFound('PROFESSIONAL_NOT_FOUND');
  const [treatments, combos] = await Promise.all([
    prisma.professionalTreatment.findMany({
      where: { professionalId: professional.id, isActive: true, treatment: { isActive: true } },
      include: { treatment: true },
      orderBy: { treatment: { name: 'asc' } },
    }),
    prisma.treatmentCombo.findMany({ where: { professionalId: professional.id } }),
  ]);
  res.json({
    treatments: treatments.map((t) => ({
      id: t.treatmentId,
      name: t.treatment.name,
      description: t.treatment.description,
      durationMin: t.durationMin,
      priceCents: t.priceCents,
      depositPercent: t.depositPercent,
      depositCents: Math.round((t.priceCents * t.depositPercent) / 100),
    })),
    combos: combos.map((c) => [c.treatmentAId, c.treatmentBId]),
  });
}));
