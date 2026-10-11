/**
 * API para los tests E2E de Playwright: base Postgres descartable, migraciones reales, datos de prueba,
 * emails visibles en /api/v1/dev/outbox y un Mercado Pago simulado (redirige como el checkout real).
 * Usa puertos propios para no chocar con `npm run dev`.
 */
import EmbeddedPostgres from 'embedded-postgres';
import { execSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const DB_PORT = 54331;
const API_PORT = 3199;
const WEB = 'http://localhost:5199';
const API = `http://localhost:${API_PORT}`;
export const E2E_PASSWORD = 'una-clave-segura';

Object.assign(process.env, {
  NODE_ENV: 'test',
  PORT: String(API_PORT),
  DATABASE_URL: `postgresql://postgres:postgres@localhost:${DB_PORT}/turnos_e2e`,
  WEB_ORIGIN: WEB,
  OWNER_EMAIL: 'duena@centro.test',
  ENABLE_DEV_OUTBOX: '1',
  EMAIL_API_KEY: '',
  GMAIL_USER: '',
  GMAIL_APP_PASSWORD: '',
  WHATSAPP_TOKEN: '',
});

const dir = mkdtempSync(join(tmpdir(), 'turnos-e2e-'));
const pg = new EmbeddedPostgres({ databaseDir: dir, user: 'postgres', password: 'postgres', port: DB_PORT, persistent: false, onLog: () => {} });
await pg.initialise();
await pg.start();
await pg.createDatabase('turnos_e2e');
execSync('npx prisma migrate deploy', { stdio: 'ignore', env: process.env });

// Imports después de fijar el entorno: env.ts lo lee al cargarse.
const { prisma } = await import('../src/db');
const { createApp } = await import('../src/app');
const { encrypt, hashPassword } = await import('../src/lib/crypto');
const { mp } = await import('../src/lib/mercadopago');
const { confirmPaidAppointment } = await import('../src/services/appointments');
const { dispatchDue } = await import('../src/services/notifications');

// ───────── Datos de prueba ─────────
const passwordHash = await hashPassword(E2E_PASSWORD);
const staffUser = (email: string | null, name: string, role: 'PROFESSIONAL' | 'RECEPTION' | 'CLIENT', subject = email!) =>
  prisma.user.create({
    data: {
      email, name, role, emailVerifiedAt: new Date(),
      identities: { create: { provider: 'PASSWORD', providerSubject: subject, passwordHash, verifiedAt: new Date() } },
    },
  });

await prisma.centerSettings.create({ data: { id: 1 } });
await prisma.centerHours.createMany({ data: [1, 2, 3, 4, 5].map((weekday) => ({ weekday, openTime: '09:00', closeTime: '18:00' })) });
await staffUser('duena@centro.test', 'Marta (dueña)', 'CLIENT'); // OWNER_EMAIL: pasa a OWNER al ingresar
await staffUser(null, 'Recepción', 'RECEPTION', 'recepcion');

const anaUser = await staffUser('ana@centro.test', 'Ana Pérez', 'PROFESSIONAL');
const ana = await prisma.professional.create({
  data: {
    displayName: 'Ana Pérez', inviteEmail: 'ana@centro.test', userId: anaUser.id,
    mpAccessTokenEnc: encrypt('E2E-token'), mpRefreshTokenEnc: encrypt('E2E-refresh'), mpTokenExpiresAt: new Date(Date.now() + 100 * 86_400_000),
  },
});
await prisma.schedule.createMany({
  data: [1, 2, 3, 4, 5].flatMap((weekday) => [
    { professionalId: ana.id, weekday, startTime: '09:00', endTime: '13:00' },
    { professionalId: ana.id, weekday, startTime: '14:00', endTime: '18:00' },
  ]),
});
const facial = await prisma.treatment.create({ data: { name: 'Limpieza facial', description: 'Limpieza profunda con extracción' } });
const peeling = await prisma.treatment.create({ data: { name: 'Peeling químico' } });
await prisma.professionalTreatment.createMany({
  data: [
    { professionalId: ana.id, treatmentId: facial.id, durationMin: 60, priceCents: 3_000_000, depositPercent: 30 },
    { professionalId: ana.id, treatmentId: peeling.id, durationMin: 45, priceCents: 2_000_000, depositPercent: 20 },
  ],
});
const [a, b] = [facial.id, peeling.id].sort();
await prisma.treatmentCombo.create({ data: { professionalId: ana.id, treatmentAId: a, treatmentBId: b } });

// Una ficha por proyecto de Playwright, porque los proyectos corren en paralelo contra esta misma base.
for (const project of ['chromium', 'mobile']) {
  await prisma.clientRecord.create({
    data: { email: `lucia-${project}@example.com`, firstName: 'Lucía', lastName: 'Gómez', ownerProfessionalId: ana.id, status: 'ACTIVA' },
  });
}

// ───────── Mercado Pago simulado ─────────
mp.createPreference = async (_token, body) => {
  const ref = (body as { external_reference: string }).external_reference;
  return { id: `pref-${ref}`, init_point: `${API}/fake-mp/checkout?turno=${ref}` };
};
mp.searchPayments = async () => ({ results: [] });

const app = createApp();
// "Pagar" en el checkout falso confirma el turno como lo haría el webhook y vuelve a la web.
app.get('/fake-mp/checkout', async (req, res) => {
  const id = String(req.query.turno);
  await confirmPaidAppointment(id);
  await dispatchDue();
  res.redirect(`${WEB}/pago/exito?turno=${id}`);
});

const server = app.listen(API_PORT, () => console.log(`API E2E en ${API}`));

const shutdown = async () => {
  server.close();
  await prisma.$disconnect();
  await pg.stop();
  rmSync(dir, { recursive: true, force: true });
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
