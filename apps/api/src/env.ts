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
  /** Emails desde el Gmail del centro (recomendado). La contraseña es una "contraseña de aplicación" de Google. */
  GMAIL_USER: optional,
  GMAIL_APP_PASSWORD: optional,
  /** Alternativa: Resend con dominio propio. */
  EMAIL_API_KEY: optional,
  EMAIL_FROM: optional,
  CRON_SECRET: z.string().default('dev-cron-secret'),
  /** '1' expone GET /api/v1/dev/outbox con los emails no enviados (solo desarrollo y tests E2E). */
  ENABLE_DEV_OUTBOX: optional,
});

const KNOWN_PLACEHOLDERS = ['dev-only-secret', 'dev-cron-secret', 'cambiar-por-un-valor-largo-y-aleatorio'];

/**
 * En producción los secretos que firman cookies y enlaces y que protegen el cron tienen que ser propios:
 * con un valor por defecto o el del ejemplo, cualquiera podría falsificar enlaces o disparar tareas.
 */
export function assertProductionSecrets(e: { NODE_ENV: string; SESSION_SECRET: string; CRON_SECRET: string }) {
  if (e.NODE_ENV !== 'production') return;
  for (const key of ['SESSION_SECRET', 'CRON_SECRET'] as const) {
    const value = e[key];
    if (value.length < 32 || KNOWN_PLACEHOLDERS.includes(value)) {
      throw new Error(`${key} tiene que ser un valor propio de al menos 32 caracteres en producción.`);
    }
  }
}

export const env = schema.parse(process.env);
assertProductionSecrets(env);
export type Env = typeof env;
