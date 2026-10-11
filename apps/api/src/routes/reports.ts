import { CENTER_ZONE } from '@turnos/shared';
import { Router } from 'express';
import { DateTime } from 'luxon';
import { z } from 'zod';
import { requireRole } from '../auth/session';
import { prisma } from '../db';
import { HttpError, wrap } from '../http';
import { clientReliability, professionalSummary } from '../services/reports';
import { myProfessional } from '../services/staff';

/** Cada profesional ve sus números; la OWNER, los de todas (tablero general). */
export const reportsRouter = Router();
reportsRouter.use(requireRole('PROFESSIONAL', 'OWNER'));

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

reportsRouter.get('/summary', wrap(async (req, res) => {
  const today = DateTime.now().setZone(CENTER_ZONE);
  const q = z.object({
    from: isoDate.default(today.startOf('month').toISODate()!),
    to: isoDate.default(today.endOf('month').toISODate()!),
    professionalId: z.string().uuid().optional(),
  }).parse(req.query);
  if (q.from > q.to) throw new HttpError(400, 'BAD_RANGE');
  if (DateTime.fromISO(q.to).diff(DateTime.fromISO(q.from), 'days').days > 366) throw new HttpError(400, 'RANGE_TOO_LONG');

  let ids: string[];
  if (req.user!.role === 'OWNER') {
    ids = q.professionalId
      ? [q.professionalId]
      : (await prisma.professional.findMany({ where: { userId: { not: null } }, select: { id: true } })).map((p) => p.id);
  } else {
    ids = [(await myProfessional(req.user!)).id];
  }
  const [professionals, clients] = await Promise.all([
    professionalSummary(ids, q.from, q.to),
    clientReliability(req.user!.role === 'OWNER' && !q.professionalId ? null : ids),
  ]);
  res.json({ from: q.from, to: q.to, scope: req.user!.role === 'OWNER' ? 'ALL' : 'OWN', professionals, clients: clients.slice(0, 100) });
}));
