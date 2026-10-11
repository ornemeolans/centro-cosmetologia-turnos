import 'dotenv/config';
import { z } from 'zod';

const optional = z.string().optional().default('');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3000),
  WEB_ORIGIN: z.string().default('http://localhost:5173'),
  SESSION_SECRET: z.string().default('dev-only-secret'),
  /** Proxies delante de la API: 1 en desarrollo (Vite), 2 en producción (Vercel + Render). */
  TRUST_PROXY_HOPS: z.coerce.number().default(1),
  DATABASE_URL: optional,
  /** Fotos de fichas: Supabase Storage (bucket privado). Sin estas variables se guardan en apps/api/uploads. */
  SUPABASE_URL: optional,
  SUPABASE_SERVICE_ROLE_KEY: optional,
  STORAGE_BUCKET: z.string().default('fichas'),
  OWNER_EMAIL: optional,
  GOOGLE_CLIENT_ID: optional,
  GOOGLE_CLIENT_SECRET: optional,
  /** Por defecto: WEB_ORIGIN + /api/v1/auth/google/callback (la API se sirve bajo el mismo dominio que la web). */
  GOOGLE_REDIRECT_URI: optional,
  MP_CLIENT_ID: optional,
  MP_CLIENT_SECRET: optional,
  MP_WEBHOOK_SECRET: optional,
  MP_REDIRECT_URI: optional,
  TOKEN_ENCRYPTION_KEY: optional,
  WHATSAPP_PHONE_NUMBER_ID: optional,
  WHATSAPP_TOKEN: optional,
  WHATSAPP_APP_SECRET: optional,
  WHATSAPP_VERIFY_TOKEN: optional,
  CENTER_WHATSAPP_NUMBER: optional,
  CENTER_NAME: z.string().default('Centro de Cosmetología'),
  CENTER_ADDRESS: optional,
  EMAIL_API_KEY: optional,
  EMAIL_FROM: optional,
  CRON_SECRET: z.string().default('dev-cron-secret'),
  /** '1' expone GET /api/v1/dev/outbox con los emails no enviados (solo desarrollo y tests E2E). */
  ENABLE_DEV_OUTBOX: optional,
});

export const env = schema.parse(process.env);
export type Env = typeof env;
