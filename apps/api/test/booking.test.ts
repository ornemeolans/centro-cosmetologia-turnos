import { createHmac } from 'node:crypto';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '../src/db';
import { devOutbox } from '../src/lib/email';
import { mp } from '../src/lib/mercadopago';
import { runTick } from '../src/services/jobs';
import { dispatchDue } from '../src/services/notifications';
import { processWebhookEvent } from '../src/services/payments';
import { app, businessDay, clientAgent, get, isoDay, patch, post, recordFor, seedCenter, staffAgent } from './fixtures';
import { resetDb } from './helpers';

let center: Awaited<ReturnType<typeof seedCenter>>;

beforeEach(async () => {
  await resetDb();
  center = await seedCenter();
  // Ningún test sale a la red: todo el cliente de Mercado Pago está simulado.
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

/** Simula el webhook firmado de Mercado Pago y su procesamiento. */
async function payWebhook(appointmentId: string, paymentId: string, amount: number, status = 'approved') {
  vi.spyOn(mp, 'getPayment').mockResolvedValue({ id: Number(paymentId), status, transaction_amount: amount, currency_id: 'ARS', external_reference: appointmentId });
  const ts = '1700000000';
  const v1 = createHmac('sha256', 'mp-webhook-secret-test').update(`id:${paymentId};request-id:req-${paymentId};ts:${ts};`).digest('hex');
  const res = await request(app)
    .post(`/api/v1/webhooks/mercadopago?data.id=${paymentId}&type=payment&prof=${center.professional.id}`)
    .set('x-signature', `ts=${ts},v1=${v1}`)
    .set('x-request-id', `req-${paymentId}`)
    .send({ action: 'payment.created', data: { id: paymentId }, type: 'payment' });
  expect(res.status).toBe(200);
  const event = await prisma.webhookEvent.findFirst({ where: { externalId: { contains: paymentId } } });
  if (event) await processWebhookEvent(event.id);
}

describe('disponibilidad', () => {
  it('encadena horarios y respeta los combos permitidos', async () => {
    const { agent } = await lucia();
    const day = isoDay(businessDay(5, '09:00'));
    const res = await get(agent, `/availability?professionalId=${center.professional.id}&treatmentIds=${center.facial.id}&date=${day}`);
    expect(res.status).toBe(200);
    expect(res.body.durationMin).toBe(60);
    expect(res.body.slots.length).toBeGreaterThan(10);

    const combo = await get(agent, `/availability?professionalId=${center.professional.id}&treatmentIds=${center.facial.id},${center.peeling.id}&date=${day}`);
    expect(combo.body.durationMin).toBe(105);

    const notCombo = await get(agent, `/availability?professionalId=${center.professional.id}&treatmentIds=${center.facial.id},${center.masaje.id}&date=${day}`);
    expect(notCombo.status).toBe(422);
    expect(notCombo.body.error).toBe('COMBO_NOT_ALLOWED');
  });
});

describe('reserva con seña', () => {
  it('queda pendiente, bloquea el horario y se confirma con el webhook de Mercado Pago', async () => {
    const { agent } = await lucia();
    const startAt = businessDay(5, '10:00');
    const res = await post(agent, '/appointments', { professionalId: center.professional.id, treatmentIds: [center.facial.id], startAt: startAt.toISOString() });
    expect(res.status).toBe(201);
    expect(res.body.checkoutUrl).toBe('https://mp.test/checkout/pref-1');
    expect(res.body.appointment).toMatchObject({ status: 'PENDING_PAYMENT', depositTotalCents: 900_000 });
    const id = res.body.appointment.id;

    // La preferencia se crea en la cuenta de la profesional, por la seña.
    const [token, pref] = vi.mocked(mp.createPreference).mock.calls[0] as [string, { items: { unit_price: number }[]; external_reference: string }];
    expect(token).toBe('TEST-token');
    expect(pref.items[0].unit_price).toBe(9000);
    expect(pref.external_reference).toBe(id);

    // Otra clienta no puede tomar el mismo horario mientras dura la reserva temporal.
    await recordFor('otra@example.com', center.professional.id, '+5491100000002');
    const other = await clientAgent('otra@example.com');
    const clash = await post(other, '/appointments', { professionalId: center.professional.id, treatmentIds: [center.facial.id], startAt: startAt.toISOString() });
    expect(clash.status).toBe(409);
    expect(clash.body.error).toBe('SLOT_TAKEN');

    await payWebhook(id, '555', 9000);
    expect((await prisma.appointment.findUniqueOrThrow({ where: { id } })).status).toBe('CONFIRMED');

    // Sin WhatsApp configurado, la confirmación sale por email con el enlace de calendario.
    await dispatchDue();
    const mail = devOutbox.find((m) => m.subject === 'Tu turno quedó confirmado');
    expect(mail?.to).toBe('lucia@example.com');
    expect(mail?.text).toMatch(/\/c\/[\w-]+\.[\w-]+/);

    // El mismo webhook repetido no hace nada.
    await payWebhook(id, '555', 9000);
    expect(await prisma.payment.count({ where: { mpPaymentId: '555' } })).toBe(1);
  });

  it('un pago menor al esperado no confirma el turno', async () => {
    const { agent } = await lucia();
    const res = await post(agent, '/appointments', { professionalId: center.professional.id, treatmentIds: [center.facial.id], startAt: businessDay(5, '10:00').toISOString() });
    await payWebhook(res.body.appointment.id, '556', 100);
    expect((await prisma.appointment.findUniqueOrThrow({ where: { id: res.body.appointment.id } })).status).toBe('PENDING_PAYMENT');
  });

  it('rechaza un webhook sin firma válida', async () => {
    const res = await request(app).post(`/api/v1/webhooks/mercadopago?data.id=1&type=payment&prof=${center.professional.id}`).send({});
    expect(res.status).toBe(401);
  });
});

describe('cancelar, saldo a favor y reprogramar', () => {
  async function confirmedBooking(agent: Parameters<typeof post>[0], startAt: Date) {
    const res = await post(agent, '/appointments', { professionalId: center.professional.id, treatmentIds: [center.facial.id], startAt: startAt.toISOString() });
    await payWebhook(res.body.appointment.id, String(Math.floor(Math.random() * 1e9)), 9000);
    return res.body.appointment.id as string;
  }

  it('cancelar a tiempo deja la seña como saldo a favor, que cubre la próxima reserva', async () => {
    const { agent } = await lucia();
    const id = await confirmedBooking(agent, businessDay(8, '10:00'));

    const cancel = await post(agent, `/appointments/${id}/cancel`);
    expect(cancel.body).toEqual({ outcome: 'CREDIT', creditCents: 900_000 });
    expect((await get(agent, '/me/credits')).body.credits[0]).toMatchObject({ amountCents: 900_000, professional: 'Ana' });

    vi.mocked(mp.createPreference).mockClear();
    const again = await post(agent, '/appointments', { professionalId: center.professional.id, treatmentIds: [center.facial.id], startAt: businessDay(9, '11:00').toISOString() });
    expect(again.body.appointment.status).toBe('CONFIRMED');
    expect(again.body.checkoutUrl).toBeNull();
    expect(mp.createPreference).not.toHaveBeenCalled();
    expect((await get(agent, '/me/credits')).body.credits).toEqual([]);
  });

  it('cancelar fuera del plazo exige aceptar perder la seña', async () => {
    const { agent, record } = await lucia();
    // Turno cargado por la profesional para el próximo día hábil: ya pasó el plazo de 2 días hábiles completos.
    const staff = await post(center.ana.agent, '/staff/appointments', { clientRecordId: record.id, treatmentIds: [center.facial.id], startAt: businessDay(1, '15:00').toISOString() });
    expect(staff.status).toBe(201);
    const id = staff.body.appointment.id;
    expect(staff.body.appointment.rules.onTime).toBe(false);

    const refused = await post(agent, `/appointments/${id}/cancel`);
    expect(refused.status).toBe(422);
    expect(refused.body.error).toBe('LATE_CANCEL_FORFEITS_DEPOSIT');
    expect((await post(agent, `/appointments/${id}/reschedule`, { startAt: businessDay(9, '10:00').toISOString() })).body.error).toBe('OUTSIDE_NOTICE_PERIOD');

    const ok = await post(agent, `/appointments/${id}/cancel`, { acceptForfeit: true });
    expect(ok.body.outcome).toBe('NO_DEPOSIT'); // turno del staff: sin seña
  });

  it('permite 2 reprogramaciones y conserva el UID del calendario', async () => {
    const { agent } = await lucia();
    let id = await confirmedBooking(agent, businessDay(8, '10:00'));
    const uid = (await prisma.appointment.findUniqueOrThrow({ where: { id } })).icsUid;

    for (const hour of ['11:00', '14:00']) {
      const r = await post(agent, `/appointments/${id}/reschedule`, { startAt: businessDay(8, hour).toISOString() });
      expect(r.status).toBe(200);
      id = r.body.appointment.id;
    }
    const third = await post(agent, `/appointments/${id}/reschedule`, { startAt: businessDay(8, '15:00').toISOString() });
    expect(third.body.error).toBe('RESCHEDULE_LIMIT');

    const current = await prisma.appointment.findUniqueOrThrow({ where: { id } });
    expect(current).toMatchObject({ icsUid: uid, version: 2, depositPaidCents: 900_000, rescheduleCount: 2 });
  });

  it('la OWNER puede cancelar dentro del plazo y la seña queda a favor', async () => {
    const { agent } = await lucia();
    const res = await post(agent, '/appointments', { professionalId: center.professional.id, treatmentIds: [center.facial.id], startAt: businessDay(8, '10:00').toISOString() });
    await payWebhook(res.body.appointment.id, '777', 9000);
    // Se mueve el turno al pasado cercano del plazo para simular "fuera de término".
    await prisma.appointment.update({ where: { id: res.body.appointment.id }, data: { startAt: businessDay(1, '10:00'), endAt: businessDay(1, '11:00'), blockedUntil: businessDay(1, '11:15') } });

    expect((await post(center.ana.agent, `/appointments/${res.body.appointment.id}/cancel`)).body.error).toBe('OUTSIDE_NOTICE_PERIOD');
    const forced = await post(center.owner.agent, `/admin/appointments/${res.body.appointment.id}/force`, { action: 'CANCEL', reason: 'Ana está enferma' });
    expect(forced.body).toEqual({ outcome: 'CREDIT', creditCents: 900_000 });
  });
});

describe('fichas y permisos', () => {
  it('otra profesional no ve la ficha hasta que le dan acceso; recepción solo ve contacto', async () => {
    const { record } = await lucia();
    const bea = await staffAgent('bea@centro.com', 'PROFESSIONAL', 'Bea');
    const beaPro = await prisma.professional.create({ data: { displayName: 'Bea', inviteEmail: 'bea@centro.com', userId: bea.user.id } });

    expect((await get(bea.agent, `/staff/client-records/${record.id}`)).status).toBe(403);
    expect((await get(bea.agent, '/staff/client-records')).body.records).toHaveLength(0);

    expect((await post(center.ana.agent, `/staff/client-records/${record.id}/grants`, { professionalId: beaPro.id })).status).toBe(201);
    const full = await get(bea.agent, `/staff/client-records/${record.id}`);
    expect(full.body.access).toBe('FULL');
    expect(full.body.record.antecedentes).toBe('Piel sensible');

    const reception = await staffAgent('recepcion@centro.com', 'RECEPTION');
    const contact = await get(reception.agent, `/staff/client-records/${record.id}`);
    expect(contact.body.access).toBe('CONTACT');
    expect(contact.body.record.antecedentes).toBeUndefined();
    expect((await post(reception.agent, `/staff/client-records/${record.id}/entries`, { notes: 'x' })).status).toBe(403);
  });

  it('recepción crea el perfil de primera vez y agenda; la ficha se activa al completarla', async () => {
    const reception = await staffAgent('recepcion@centro.com', 'RECEPTION');
    const created = await post(reception.agent, '/staff/client-records/first-visit', {
      firstName: 'Sofía', lastName: 'Ruiz', email: 'sofia@example.com', phoneE164: '+5491100000003', ownerProfessionalId: center.professional.id,
    });
    expect(created.status).toBe(201);
    const appt = await post(reception.agent, '/staff/appointments', {
      clientRecordId: created.body.id, professionalId: center.professional.id, treatmentIds: [center.facial.id], startAt: businessDay(3, '09:00').toISOString(),
    });
    expect(appt.body.appointment).toMatchObject({ status: 'CONFIRMED', isFirstVisit: true, source: 'RECEPTION' });

    const sofia = await clientAgent('sofia@example.com');
    expect((await get(sofia, '/me')).body.record.status).toBe('PRIMERA_VEZ');
    expect((await post(center.ana.agent, `/staff/client-records/${created.body.id}/complete`)).status).toBe(200);
    expect((await get(sofia, '/me')).body.record.status).toBe('ACTIVA');
  });

  it('las fotos exigen consentimiento y se borran si se revoca', async () => {
    const { record } = await lucia();
    const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
    const noConsent = await center.ana.agent.post(`/api/v1/staff/client-records/${record.id}/photos?kind=ANTES`).set('Origin', 'http://localhost:5173').set('Content-Type', 'image/jpeg').send(jpg);
    expect(noConsent.body.error).toBe('PHOTO_CONSENT_REQUIRED');

    const consent = await post(center.ana.agent, `/staff/client-records/${record.id}/consents`, { type: 'FOTOS', documentVersion: 'v1' });
    const up = await center.ana.agent.post(`/api/v1/staff/client-records/${record.id}/photos?kind=ANTES`).set('Origin', 'http://localhost:5173').set('Content-Type', 'image/jpeg').send(jpg);
    expect(up.status).toBe(201);
    const photo = await center.ana.agent.get(`/api/v1/staff/client-records/${record.id}/photos/${up.body.id}`);
    expect(Buffer.compare(photo.body, jpg)).toBe(0);

    await center.ana.agent.delete(`/api/v1/staff/client-records/${record.id}/consents/${consent.body.id}`).set('Origin', 'http://localhost:5173');
    expect(await prisma.recordPhoto.count({ where: { clientRecordId: record.id } })).toBe(0);
  });
});

describe('tareas periódicas, lista de espera y calendario', () => {
  it('una reserva sin pagar vence y avisa a la lista de espera', async () => {
    const { agent } = await lucia();
    const startAt = businessDay(5, '10:00');
    const res = await post(agent, '/appointments', { professionalId: center.professional.id, treatmentIds: [center.facial.id], startAt: startAt.toISOString() });

    const waiting = await recordFor('espera@example.com', center.professional.id, '+5491100000004');
    await prisma.waitlistEntry.create({ data: { clientRecordId: waiting.id, professionalId: center.professional.id, treatmentIds: [], dateFrom: new Date(`${isoDay(startAt)}T00:00:00Z`), dateTo: new Date(`${isoDay(startAt)}T00:00:00Z`) } });

    await prisma.appointment.update({ where: { id: res.body.appointment.id }, data: { holdExpiresAt: new Date(Date.now() - 1000) } });
    const report = await runTick();
    expect(report.holdsExpired).toBe(1);
    expect((await prisma.appointment.findUniqueOrThrow({ where: { id: res.body.appointment.id } })).status).toBe('EXPIRED');

    // Clienta no cumplidora: su aviso sale en la segunda ronda (30 min después).
    const alert = await prisma.notification.findFirstOrThrow({ where: { template: 'turno_disponible', clientRecordId: waiting.id } });
    expect(alert.scheduledFor.getTime()).toBeGreaterThan(Date.now() + 25 * 60_000);
  });

  it('el enlace de calendario del WhatsApp sigue al turno reprogramado', async () => {
    const { agent, record } = await lucia();
    const staff = await post(center.ana.agent, '/staff/appointments', { clientRecordId: record.id, treatmentIds: [center.facial.id], startAt: businessDay(8, '10:00').toISOString() });
    await dispatchDue();
    const link = devOutbox.find((m) => m.subject === 'Tu turno quedó agendado')!.text.match(/\/c\/([\w-]+\.[\w-]+)/)![1];

    await post(agent, `/appointments/${staff.body.appointment.id}/reschedule`, { startAt: businessDay(8, '14:00').toISOString() });
    const page = await request(app).get(`/api/v1/c/${link}`);
    expect(new Date(page.body.startAt).getTime()).toBe(businessDay(8, '14:00').getTime());
    const ics = await request(app).get(`/api/v1/c/${link}/calendar.ics`);
    expect(ics.headers['content-type']).toContain('text/calendar');
    expect(ics.text).toContain('SEQUENCE:1');
  });

  it('reportes: la profesional ve los suyos y la OWNER todos', async () => {
    const { record } = await lucia();
    await post(center.ana.agent, '/staff/appointments', { clientRecordId: record.id, treatmentIds: [center.facial.id], startAt: businessDay(2, '10:00').toISOString() });
    const mine = await get(center.ana.agent, '/reports/summary');
    expect(mine.body.scope).toBe('OWN');
    expect(mine.body.professionals).toHaveLength(1);
    const all = await get(center.owner.agent, '/reports/summary');
    expect(all.body.scope).toBe('ALL');
    expect(all.body.professionals.length).toBeGreaterThanOrEqual(2); // Ana + la OWNER
  });
});
