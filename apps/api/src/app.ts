import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';
import { ZodError } from 'zod';
import { HttpError } from './http';
import { loadUser } from './auth/session';
import { env } from './env';
import { devOutbox, normalizeEmail } from './lib/email';
import { adminRouter } from './routes/admin';
import { appointmentsRouter } from './routes/appointments';
import { authRouter } from './routes/auth';
import { mercadopagoRouter } from './routes/mercadopago';
import { recordsRouter } from './routes/records';
import { reportsRouter } from './routes/reports';
import { staffSettingsRouter } from './routes/staffSettings';
import { availabilityRouter } from './routes/availability';
import { internalRouter } from './routes/internal';
import { meRouter } from './routes/me';
import { professionalsRouter } from './routes/professionals';
import { webhooksRouter } from './routes/webhooks';

export type RawBodyRequest = Request & { rawBody?: Buffer };

/**
 * Defensa CSRF para rutas con cookie: además de SameSite=Lax, un POST/PATCH/DELETE
 * que trae Origin tiene que venir de la web propia.
 */
function sameOriginOnly(req: Request, res: Response, next: NextFunction) {
  const origin = req.header('origin');
  if (req.method !== 'GET' && origin && origin !== env.WEB_ORIGIN) return res.status(403).json({ error: 'BAD_ORIGIN' });
  next();
}

export function createApp() {
  const app = express();
  // En producción hay dos proxies delante (rewrite de Vercel + Render): req.ip sale de X-Forwarded-For.
  app.set('trust proxy', env.TRUST_PROXY_HOPS);
  app.use(helmet());
  app.use(cors({ origin: env.WEB_ORIGIN, credentials: true }));
  app.use(cookieParser(env.SESSION_SECRET));
  // Guardamos el cuerpo crudo: la firma de Meta se calcula sobre los bytes exactos.
  app.use(express.json({ limit: '100kb', verify: (req, _res, buf) => { (req as RawBodyRequest).rawBody = buf; } }));

  const api = express.Router();
  api.get('/health', (_req, res) => res.json({ ok: true }));
  // Sin cookie de sesión: validan su propia firma o secreto.
  api.use('/webhooks', webhooksRouter);
  api.use('/internal', internalRouter);

  api.use(sameOriginOnly, loadUser);
  api.use('/auth', authRouter);
  api.use('/me', meRouter);
  api.use('/professionals', professionalsRouter);
  api.use('/availability', availabilityRouter);
  api.use('/admin', adminRouter);
  api.use('/staff/me', staffSettingsRouter);
  api.use('/staff/client-records', recordsRouter);
  api.use('/reports', reportsRouter);
  api.use(mercadopagoRouter);
  api.use(appointmentsRouter);
  if (env.ENABLE_DEV_OUTBOX === '1' && env.NODE_ENV !== 'production') {
    api.get('/dev/outbox', (req, res) => {
      const to = typeof req.query.to === 'string' ? normalizeEmail(req.query.to) : undefined;
      res.json({ emails: devOutbox.filter((m) => !to || m.to === to) });
    });
  }
  app.use('/api/v1', api);

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof ZodError) return res.status(400).json({ error: 'BAD_REQUEST', issues: err.issues });
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.code, ...err.details });
    console.error(err);
    return res.status(500).json({ error: 'INTERNAL' });
  });

  return app;
}
