import { CENTER_ZONE } from '@turnos/shared';
import { DateTime } from 'luxon';
import request from 'supertest';
import { createApp } from '../src/app';
import { prisma } from '../src/db';
import { encrypt, hashPassword } from '../src/lib/crypto';
import { lastTokenFor } from './helpers';

export const app = createApp();
export const ORIGIN = 'http://localhost:5173';
const PASSWORD = 'una-clave-segura';

export type Agent = ReturnType<typeof request.agent>;

export const post = (agent: Agent, path: string, body: object = {}) => agent.post(`/api/v1${path}`).set('Origin', ORIGIN).send(body);
export const patch = (agent: Agent, path: string, body: object = {}) => agent.patch(`/api/v1${path}`).set('Origin', ORIGIN).send(body);
export const get = (agent: Agent, path: string) => agent.get(`/api/v1${path}`);

/** Usuario de staff con contraseña ya verificada y sesión iniciada. */
export async function staffAgent(email: string, role: 'PROFESSIONAL' | 'RECEPTION' | 'OWNER', name = email) {
  const user = await prisma.user.create({
    data: {
      email, name, role: role === 'OWNER' ? 'CLIENT' : role, emailVerifiedAt: new Date(),
      identities: { create: { provider: 'PASSWORD', providerSubject: email, passwordHash: await hashPassword(PASSWORD), verifiedAt: new Date() } },
    },
  });
  const agent = request.agent(app);
  const res = await post(agent, '/auth/login', { identifier: email, password: PASSWORD });
  if (res.status !== 200) throw new Error(`login ${email}: ${res.status} ${JSON.stringify(res.body)}`);
  return { agent, user };
}

export async function clientAgent(email: string) {
  const agent = request.agent(app);
  await post(agent, '/auth/register', { email, password: PASSWORD, name: 'Clienta' });
  await post(agent, '/auth/verify-email', { token: lastTokenFor(email) });
  return agent;
}

/**
 * Centro listo para reservar: horario L-V 9-18, OWNER, profesional "Ana" con agenda 9-13 y 14-18,
 * dos tratamientos combinables y Mercado Pago "conectado" (token falso: el cliente de MP se simula en los tests).
 */
export async function seedCenter() {
  await prisma.centerSettings.create({ data: { id: 1 } });
  await prisma.centerHours.createMany({ data: [1, 2, 3, 4, 5].map((weekday) => ({ weekday, openTime: '09:00', closeTime: '18:00' })) });

  const owner = await staffAgent('duena@centro.com', 'OWNER', 'Dueña');
  const ana = await staffAgent('ana@centro.com', 'PROFESSIONAL', 'Ana');
  const professional = await prisma.professional.create({
    data: { displayName: 'Ana', inviteEmail: 'ana@centro.com', userId: ana.user.id, mpAccessTokenEnc: encrypt('TEST-token'), mpRefreshTokenEnc: encrypt('TEST-refresh'), mpTokenExpiresAt: new Date(Date.now() + 100 * 86_400_000) },
  });
  await prisma.schedule.createMany({
    data: [1, 2, 3, 4, 5].flatMap((weekday) => [
      { professionalId: professional.id, weekday, startTime: '09:00', endTime: '13:00' },
      { professionalId: professional.id, weekday, startTime: '14:00', endTime: '18:00' },
    ]),
  });
  const facial = await prisma.treatment.create({ data: { name: 'Limpieza facial' } });
  const peeling = await prisma.treatment.create({ data: { name: 'Peeling' } });
  const masaje = await prisma.treatment.create({ data: { name: 'Masaje' } });
  await prisma.professionalTreatment.createMany({
    data: [
      { professionalId: professional.id, treatmentId: facial.id, durationMin: 60, priceCents: 3_000_000, depositPercent: 30 },
      { professionalId: professional.id, treatmentId: peeling.id, durationMin: 45, priceCents: 2_000_000, depositPercent: 20 },
      { professionalId: professional.id, treatmentId: masaje.id, durationMin: 30, priceCents: 1_000_000, depositPercent: 50 },
    ],
  });
  const [a, b] = [facial.id, peeling.id].sort();
  await prisma.treatmentCombo.create({ data: { professionalId: professional.id, treatmentAId: a, treatmentBId: b } });

  return { owner, ana, professional, facial, peeling, masaje };
}

export async function recordFor(email: string, ownerProfessionalId: string, phoneE164 = '+5491100000001') {
  return prisma.clientRecord.create({
    data: { email, firstName: 'Lucía', lastName: 'Gómez', ownerProfessionalId, status: 'ACTIVA', phoneE164, antecedentes: 'Piel sensible' },
  });
}

/** N días hábiles (L-V) desde hoy, en la zona del centro, a la hora indicada. */
export function businessDay(n: number, hhmm: string): Date {
  let d = DateTime.now().setZone(CENTER_ZONE).startOf('day');
  let count = 0;
  while (count < n) {
    d = d.plus({ days: 1 });
    if (d.weekday <= 5) count++;
  }
  const [hour, minute] = hhmm.split(':').map(Number);
  return d.set({ hour, minute }).toJSDate();
}

export const isoDay = (d: Date) => DateTime.fromJSDate(d, { zone: CENTER_ZONE }).toISODate()!;
