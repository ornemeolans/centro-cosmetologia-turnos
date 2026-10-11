import { defineConfig } from 'vitest/config';

export const TEST_DB_PORT = 54330;

export default defineConfig({
  test: {
    globalSetup: './test/globalSetup.ts',
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: `postgresql://postgres:postgres@localhost:${TEST_DB_PORT}/turnos_test`,
      OWNER_EMAIL: 'duena@centro.com',
      WEB_ORIGIN: 'http://localhost:5173',
      EMAIL_API_KEY: '',
      GMAIL_USER: '',
      GMAIL_APP_PASSWORD: '',
      MP_WEBHOOK_SECRET: 'mp-webhook-secret-test',
      ENABLE_DEV_OUTBOX: '',
      WHATSAPP_TOKEN: '',
      WHATSAPP_PHONE_NUMBER_ID: '',
    },
    // Todos los tests comparten una base: se corren de a un archivo por vez.
    fileParallelism: false,
    hookTimeout: 180_000,
    testTimeout: 30_000,
  },
});
