/**
 * Regresiones de la auditoría de seguridad (octubre 2026): cada caso reproduce un ataque concreto
 * y comprueba que ahora se rechaza.
 */
import { createHmac } from 'node:crypto';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '../src/db';
import { assertProductionSecrets } from '../src/env';
import { mp } from '../src/lib/mercadopago';
import { processWebhookEvent } from '../src/services/payments';
import { handleWhatsAppWebhook } from '../src/services/whatsappInbound';
import { app, businessDay, clientAgent, get, patch, post, recordFor, seedCenter, staffAgent } from './fixtures';
import { lastTokenFor, resetDb } from './helpers';

vi.mock('../src/lib/whatsapp', async (orig) => ({
  ...(await orig<typeof import('../src/lib/whatsapp')>()),
  whatsappConfigured: () => true,
  sendText: vi.fn(async () => ({})),
  sendButtons: vi.fn(async () => ({})),
  sendTemplate: vi.fn(async () => ({ messages: [{ id: 'wamid.test' }] })),
}));

let center: Awaited<ReturnType<typeof seedCenter>>;

beforeEach(async () => {
  await resetDb();
  center = await seedCenter();
  vi.spyOn(mp, 'createPreference').mockResolvedValue({ id: 'pref-1', init_point: 'https://mp.test/checkout/pref-1' });
  vi.spyOn(mp, 'searchPayments').mockResolvedValue({ results: [] });
  vi.spyOn(mp, 'refund').mockResolvedValue({});
  vi.spyOn(mp, 'refresh').mockRejectedValue(new Error('sin red en tests'));
  vi.spyOn(mp, 'getPayment').mockRejectedValue(new Error('sin red en tests'));
});
afterEach(() => vi.restoreAllMocks());

async function lucia() {
  const record = await recordFor('lucia@example.com', center.professional.id);
  const agent = await clientAgent('lucia@example.com');
  await patch(agent, '/me', { phoneE164: '+5491100000001' });
  return { record, agent };
}

async function payWebhook(appointmentId: string, paymentId: string, amount: number, action = 'payment.created') {
  vi.spyOn(mp, 'getPayment').mockResolvedValue({ id: Number(paymentId), status: 'approved', transaction_amount: amount, currency_id: 'ARS', external_reference: appointmentId });
  const ts = '1700000000';
  const v1 = createHmac('sha256', 'mp-webhook-secret-test').update(`id:${paymentId};request-id:req-${paymentId};ts:${ts};`).digest('hex');
  await request(app)
    .post(`/api/v1/webhooks/mercadopago?data.id=${paymentId}&type=payment&prof=${center.professional.id}`)
    .set('x-signature', `ts=${ts},v1=${v1}`).set('x-request-id', `req-${paymentId}`)
    .send({ action, data: { id: paymentId }, type: 'payment' });
  const event = await prisma.webhookEvent.findFirst({ where: { externalId: { endsWith: `:${paymentId}:${action}` } } });
  if (event) await processWebhookEvent(event.id);
}

async function book(agent: ReturnType<typeof request.agent>, startAt: Date) {
  const res = await post(agent, '/appointments', { professionalId: center.professional.id, treatmentIds: [center.facial.id], startAt: startAt.toISOString() });
  expect(res.status).toBe(201);
  return res.body.appointment as { id: string; creditAppliedCents?: number };
}

describe('registro: nadie puede activar una contraseña ajena', () => {
  it('un segundo registro del mismo email no reemplaza la contraseña de quien se registró primero', async () => {
    const victim = request.agent(app);
    await post(victim, '/auth/register', { email: 'lucia@empresa.com', password: 'clave-de-lucia-1', name: 'Lucía' });
    const tokenVictim = lastTokenFor('lucia@empresa.com');

    const attacker = request.agent(app);
    await post(attacker, '/auth/register', { email: 'lucia@empresa.com', password: 'clave-atacante-1', name: 'X' });

    expect((await post(victim, '/auth/verify-email', { token: tokenVictim, password: 'clave-de-lucia-1' })).status).toBe(200);
    const asAttacker = await post(request.agent(app), '/auth/login', { identifier: 'lucia@empresa.com', password: 'clave-atacante-1' });
    expect(asAttacker.status).toBe(401);
    const asVictim = await post(request.agent(app), '/auth/login', { identifier: 'lucia@empresa.com', password: 'clave-de-lucia-1' });
    expect(asVictim.status).toBe(200);
  });

  it('el enlace no activa la cuenta sin la contraseña elegida en ese registro', async () => {
    const attacker = request.agent(app);
    await post(attacker, '/auth/register', { email: 'lucia@empresa.com', password: 'clave-atacante-1', name: 'X' });
    // La víctima recibe el email sin haberlo pedido; no conoce la contraseña del atacante.
    const res = await post(request.agent(app), '/auth/verify-email', { token: lastTokenFor('lucia@empresa.com'), password: 'cualquier-cosa' });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('WRONG_PASSWORD');
    expect((await prisma.authIdentity.findFirst({ where: { providerSubject: 'lucia@empresa.com' } }))?.verifiedAt).toBeNull();
  });
});

describe('login y registro: límites', () => {
  it('las variantes del email cuentan como la misma cuenta', async () => {
    await staffAgent('victima@gmail.com', 'PROFESSIONAL');
    for (let i = 0; i < 5; i++) await post(request.agent(app), '/auth/login', { identifier: `vic.tima+${i}@gmail.com`, password: 'mala-clave' });
    const variant = await post(request.agent(app), '/auth/login', { identifier: 'v.ictima@gmail.com', password: 'una-clave-segura' });
    expect(variant.status).toBe(429);
  });

  it('una identidad con dos @ no coincide con ninguna cuenta', async () => {
    await staffAgent('victima@empresa.com', 'PROFESSIONAL');
    const res = await post(request.agent(app), '/auth/login', { identifier: 'victima@empresa.com@x', password: 'una-clave-segura' });
    expect(res.status).toBe(401);
  });

  it('una misma IP no puede registrar cuentas sin límite', async () => {
    const statuses: number[] = [];
    for (let i = 1; i <= 11; i++) {
      statuses.push((await post(request.agent(app), '/auth/register', { email: `v+${i}@example.test`, password: 'una-clave-segura', name: 'V' })).status);
    }
    expect(statuses.slice(0, 10).every((s) => s === 202)).toBe(true);
    expect(statuses[10]).toBe(429);
  });
});

describe('configuración de producción', () => {
  it('no arranca con secretos por defecto o cortos', () => {
    const strong = 'x'.repeat(40);
    expect(() => assertProductionSecrets({ NODE_ENV: 'production', SESSION_SECRET: 'dev-only-secret', CRON_SECRET: strong })).toThrow(/SESSION_SECRET/);
    expect(() => assertProductionSecrets({ NODE_ENV: 'production', SESSION_SECRET: strong, CRON_SECRET: 'corto' })).toThrow(/CRON_SECRET/);
    expect(() => assertProductionSecrets({ NODE_ENV: 'production', SESSION_SECRET: strong, CRON_SECRET: strong })).not.toThrow();
    expect(() => assertProductionSecrets({ NODE_ENV: 'development', SESSION_SECRET: 'dev-only-secret', CRON_SECRET: 'dev-cron-secret' })).not.toThrow();
  });

  it('el cron rechaza un secreto vacío', async () => {
    expect((await request(app).post('/api/v1/internal/tick').set('x-cron-secret', '')).status).toBe(401);
  });
});

describe('pagos y saldo a favor', () => {
  it('un aviso repetido de un pago ya aplicado no reintegra la seña después de cancelar', async () => {
    const { agent } = await lucia();
    const appt = await book(agent, businessDay(8, '10:00'));
    await payWebhook(appt.id, '777', 9000);
    expect((await post(agent, `/appointments/${appt.id}/cancel`)).body.outcome).toBe('CREDIT');

    await payWebhook(appt.id, '777', 9000, 'payment.updated');
    expect(mp.refund).not.toHaveBeenCalled();
  });

  it('el mismo saldo a favor no descuenta dos reservas pendientes', async () => {
    const { record, agent } = await lucia();
    await prisma.creditLedger.create({
      data: { clientRecordId: record.id, professionalId: center.professional.id, amountCents: 300_000, remainingCents: 300_000, reason: 'ADJUST', expiresAt: new Date(Date.now() + 10 * 86_400_000) },
    });
    const first = await book(agent, businessDay(8, '10:00'));
    const second = await book(agent, businessDay(8, '12:00'));
    const rows = await prisma.appointment.findMany({ where: { id: { in: [first.id, second.id] } }, select: { id: true, creditAppliedCents: true } });
    expect(rows.find((r) => r.id === first.id)?.creditAppliedCents).toBe(300_000);
    expect(rows.find((r) => r.id === second.id)?.creditAppliedCents).toBe(0);
  });

  it('dos cancelaciones simultáneas del mismo turno generan un solo saldo a favor', async () => {
    const { agent } = await lucia();
    const appt = await book(agent, businessDay(8, '10:00'));
    await payWebhook(appt.id, '778', 9000);
    await Promise.all([post(agent, `/appointments/${appt.id}/cancel`), post(agent, `/appointments/${appt.id}/cancel`)]);
    expect(await prisma.creditLedger.count({ where: { appointmentId: appt.id, reason: 'CANCEL_ON_TIME' } })).toBe(1);
  });

  it('dos reprogramaciones simultáneas no duplican el turno', async () => {
    const { agent } = await lucia();
    const appt = await book(agent, businessDay(8, '10:00'));
    await payWebhook(appt.id, '779', 9000);
    await Promise.all([
      post(agent, `/appointments/${appt.id}/reschedule`, { startAt: businessDay(8, '12:00').toISOString() }),
      post(agent, `/appointments/${appt.id}/reschedule`, { startAt: businessDay(8, '15:00').toISOString() }),
    ]);
    expect(await prisma.appointment.count({ where: { rescheduledFromId: appt.id, status: 'CONFIRMED' } })).toBe(1);
  });
});

describe('equipo: cada rol dentro de su alcance', () => {
  it('una profesional no cambia turnos de la agenda de otra, aunque tenga acceso a la ficha', async () => {
    const { record } = await lucia();
    const bea = await staffAgent('bea@centro.com', 'PROFESSIONAL', 'Bea');
    const beaPro = await prisma.professional.create({ data: { displayName: 'Bea', inviteEmail: 'bea@centro.com', userId: bea.user.id } });
    await prisma.recordAccessGrant.create({ data: { clientRecordId: record.id, professionalId: beaPro.id, grantedByUserId: center.ana.user.id } });
    const booked = await post(center.ana.agent, '/staff/appointments', { clientRecordId: record.id, treatmentIds: [center.facial.id], startAt: businessDay(8, '10:00').toISOString() });
    expect(booked.status).toBe(201);
    const id = booked.body.appointment.id;

    expect((await post(bea.agent, `/appointments/${id}/cancel`)).status).toBe(404);
    expect((await post(bea.agent, `/appointments/${id}/reschedule`, { startAt: businessDay(8, '15:00').toISOString() })).status).toBe(404);
    expect((await prisma.appointment.findUnique({ where: { id } }))?.status).toBe('CONFIRMED');
  });

  it('recepción no puede cambiar el email de una ficha', async () => {
    const { record } = await lucia();
    const reception = await staffAgent('recepcion@centro.com', 'RECEPTION');
    const res = await patch(reception.agent, `/staff/client-records/${record.id}`, { email: 'otra@example.com' });
    expect(res.status).toBe(400);
    expect((await prisma.clientRecord.findUnique({ where: { id: record.id } }))?.email).toBe('lucia@example.com');
    // El celular sí, y queda en la auditoría con el valor anterior.
    expect((await patch(reception.agent, `/staff/client-records/${record.id}`, { phoneE164: '+5491199999999' })).status).toBe(200);
    const log = await prisma.auditLog.findFirst({ where: { entityId: record.id, action: 'UPDATE' }, orderBy: { createdAt: 'desc' } });
    expect(log?.diff).toMatchObject({ contact: { phoneE164: { from: '+5491100000001', to: '+5491199999999' } } });
  });

  it('un celular cargado por el equipo no puede cancelar fuera de plazo por WhatsApp', async () => {
    const { record } = await lucia();
    const booked = await post(center.ana.agent, '/staff/appointments', { clientRecordId: record.id, treatmentIds: [center.facial.id], startAt: businessDay(1, '10:00').toISOString() });
    const id = booked.body.appointment.id;
    const reception = await staffAgent('recepcion@centro.com', 'RECEPTION');
    await patch(reception.agent, `/staff/client-records/${record.id}`, { phoneE164: '+5491199999999' });

    await handleWhatsAppWebhook({ entry: [{ changes: [{ value: { messages: [{ from: '5491199999999', type: 'interactive', interactive: { button_reply: { id: `CANCELAR_SI:${id}` } } }] } }] }] });
    expect((await prisma.appointment.findUnique({ where: { id } }))?.status).toBe('CONFIRMED');
  });

  it('una cuenta del equipo no se vincula con una ficha por email', async () => {
    await recordFor('recepcion@centro.com', center.professional.id);
    const reception = await staffAgent('recepcion@centro.com', 'RECEPTION');
    expect((await get(reception.agent, '/me/credits')).status).toBe(404);
  });
});
