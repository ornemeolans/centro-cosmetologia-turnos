import { Router } from 'express';
import { env } from '../env';
import { wrap } from '../http';
import { runTick } from '../services/jobs';

export const internalRouter = Router();

/** Llamado cada 5 min por cron-job.org (header x-cron-secret). También mantiene despierta la API en Render free. */
internalRouter.post('/tick', wrap(async (req, res) => {
  if (req.header('x-cron-secret') !== env.CRON_SECRET) return res.sendStatus(401);
  const report = await runTick();
  return res.json({ ok: true, ranAt: new Date().toISOString(), report });
}));
