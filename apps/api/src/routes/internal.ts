import { timingSafeEqual } from 'node:crypto';
import { Router } from 'express';
import { env } from '../env';
import { wrap } from '../http';
import { runTick } from '../services/jobs';

export const internalRouter = Router();

/** Comparación en tiempo constante; un secreto vacío nunca es válido. */
function sameSecret(given: string | undefined, expected: string) {
  if (!given || !expected) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Llamado cada 5 min por cron-job.org (header x-cron-secret). También mantiene despierta la API en Render free. */
internalRouter.post('/tick', wrap(async (req, res) => {
  if (!sameSecret(req.header('x-cron-secret'), env.CRON_SECRET)) return res.sendStatus(401);
  const report = await runTick();
  return res.json({ ok: true, ranAt: new Date().toISOString(), report });
}));
