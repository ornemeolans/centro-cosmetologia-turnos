import type { Professional } from '@prisma/client';
import { prisma } from '../db';
import { env } from '../env';
import { HttpError } from '../http';
import { decrypt, encrypt } from '../lib/crypto';
import { sendEmail } from '../lib/email';
import { dateTimeLabel, money } from '../lib/format';
import { mp, type MpPayment, type MpTokens } from '../lib/mercadopago';
import { confirmPaidAppointment, type AppointmentFull } from './appointments';

export async function saveTokens(professionalId: string, t: MpTokens) {
  await prisma.professional.update({
    where: { id: professionalId },
    data: {
      mpUserId: String(t.user_id),
      mpAccessTokenEnc: encrypt(t.access_token),
      mpRefreshTokenEnc: encrypt(t.refresh_token),
      mpTokenExpiresAt: new Date(Date.now() + t.expires_in * 1000),
    },
  });
}

export function accessToken(p: Pick<Professional, 'mpAccessTokenEnc'>): string {
  if (!p.mpAccessTokenEnc) throw new HttpError(422, 'PROFESSIONAL_MP_NOT_CONNECTED');
  return decrypt(p.mpAccessTokenEnc);
}

/** Preferencia de Checkout Pro en la cuenta de la profesional, por la seña menos el saldo a favor usado. */
export async function createCheckout(appt: AppointmentFull, payerEmail: string | null): Promise<string> {
  const professional = await prisma.professional.findUniqueOrThrow({ where: { id: appt.professionalId } });
  const toPayCents = appt.depositTotalCents - appt.creditAppliedCents;
  const treatments = appt.items.map((i) => i.treatment.name).join(' + ');
  const pref = await mp.createPreference(accessToken(professional), {
    items: [{
      id: appt.id,
      title: `Seña: ${treatments} (${dateTimeLabel(appt.startAt)})`,
      quantity: 1,
      currency_id: 'ARS',
      unit_price: toPayCents / 100,
    }],
    external_reference: appt.id,
    notification_url: `${env.WEB_ORIGIN}/api/v1/webhooks/mercadopago?prof=${professional.id}`,
    back_urls: {
      success: `${env.WEB_ORIGIN}/pago/exito?turno=${appt.id}`,
      pending: `${env.WEB_ORIGIN}/pago/pendiente?turno=${appt.id}`,
      failure: `${env.WEB_ORIGIN}/pago/error?turno=${appt.id}`,
    },
    auto_return: 'approved',
    expires: true,
    expiration_date_to: appt.holdExpiresAt?.toISOString(),
    date_of_expiration: appt.holdExpiresAt?.toISOString(),
    payer: payerEmail ? { email: payerEmail } : undefined,
    statement_descriptor: 'TURNO CENTRO',
  });
  await prisma.payment.create({
    data: { appointmentId: appt.id, professionalId: professional.id, mpPreferenceId: pref.id, status: 'preference_created', amountCents: toPayCents },
  });
  return pref.init_point;
}

/**
 * Procesa un pago informado por Mercado Pago. Nunca confía en el cuerpo del webhook:
 * siempre consulta el pago con el token de la profesional.
 */
export async function processPayment(professionalId: string, paymentId: string): Promise<string> {
  const professional = await prisma.professional.findUnique({ where: { id: professionalId } });
  if (!professional?.mpAccessTokenEnc) return 'UNKNOWN_PROFESSIONAL';
  const payment = await mp.getPayment(accessToken(professional), paymentId);
  return applyPayment(professional, payment);
}

export async function applyPayment(professional: Professional, payment: MpPayment): Promise<string> {
  const appt = payment.external_reference
    ? await prisma.appointment.findUnique({ where: { id: payment.external_reference }, include: { clientRecord: true } })
    : null;
  if (!appt || appt.professionalId !== professional.id) return 'UNKNOWN_APPOINTMENT';

  const amountCents = Math.round(payment.transaction_amount * 100);
  const mpPaymentId = String(payment.id);
  const existing = await prisma.payment.findUnique({ where: { mpPaymentId } });
  // Si este mismo pago ya se había aprobado y aplicado, un aviso repetido no debe volver a procesarlo.
  const wasApproved = existing?.status === 'approved';
  if (existing) {
    await prisma.payment.update({ where: { id: existing.id }, data: { status: payment.status, amountCents, rawPayload: payment as object } });
  } else {
    await prisma.payment.create({
      data: { appointmentId: appt.id, professionalId: professional.id, mpPaymentId, status: payment.status, amountCents, rawPayload: payment as object },
    });
  }

  if (payment.status === 'refunded' || payment.status === 'charged_back') {
    await alertStaff(professional, `Pago ${payment.status === 'refunded' ? 'reintegrado' : 'desconocido por la clienta (contracargo)'}`,
      `${appt.clientRecord.firstName} ${appt.clientRecord.lastName}, turno del ${dateTimeLabel(appt.startAt)}, ${money(amountCents)}.`);
    return payment.status;
  }
  if (payment.status !== 'approved') return payment.status;

  if (wasApproved && appt.status !== 'PENDING_PAYMENT' && appt.status !== 'EXPIRED') return 'ALREADY_APPLIED';

  const expected = appt.depositTotalCents - appt.creditAppliedCents;
  if (payment.currency_id !== 'ARS' || amountCents < expected) {
    await alertStaff(professional, 'Pago con monto distinto al esperado', `Turno ${appt.id}: se esperaban ${money(expected)} y llegaron ${money(amountCents)}.`);
    return 'AMOUNT_MISMATCH';
  }

  const result = await confirmPaidAppointment(appt.id);
  // El reintegro de MP es idempotente por pago (refund-<id>), así que repetir SLOT_LOST no duplica dinero.
  if (result === 'SLOT_LOST' || (!wasApproved && result === 'NOT_CONFIRMABLE' && appt.status !== 'CONFIRMED')) {
    // Pagó después de que venciera la reserva y el horario ya lo tomó otra persona: se reintegra.
    await mp.refund(accessToken(professional), mpPaymentId);
    await sendEmail({
      to: appt.clientRecord.email,
      subject: 'Reintegramos tu seña',
      text: `Hola ${appt.clientRecord.firstName}: tu pago llegó cuando la reserva del ${dateTimeLabel(appt.startAt)} ya había vencido y el horario fue tomado. ` +
        `Reintegramos ${money(amountCents)} al mismo medio de pago. Podés elegir otro horario en ${env.WEB_ORIGIN}/reservar`,
    });
    return 'REFUNDED_SLOT_LOST';
  }
  return result;
}

async function alertStaff(professional: Professional, subject: string, text: string) {
  const owner = await prisma.user.findFirst({ where: { role: 'OWNER' } });
  const proUser = professional.userId ? await prisma.user.findUnique({ where: { id: professional.userId } }) : null;
  for (const to of new Set([owner?.email, proUser?.email].filter(Boolean) as string[])) {
    await sendEmail({ to, subject, text });
  }
}

/** Webhook guardado → procesado. Si falla, el tick lo reintenta. */
export async function processWebhookEvent(eventId: string) {
  const event = await prisma.webhookEvent.findUnique({ where: { id: eventId } });
  if (!event || event.processedAt) return;
  const { professionalId, paymentId } = event.payload as { professionalId: string; paymentId: string };
  try {
    await processPayment(professionalId, paymentId);
    await prisma.webhookEvent.update({ where: { id: event.id }, data: { processedAt: new Date(), attempts: { increment: 1 } } });
  } catch (err) {
    await prisma.webhookEvent.update({ where: { id: event.id }, data: { attempts: { increment: 1 }, lastError: String(err) } });
  }
}

/** Renueva los tokens que vencen en menos de 15 días (duran ~180). */
export async function refreshExpiringTokens() {
  const soon = new Date(Date.now() + 15 * 86_400_000);
  const pros = await prisma.professional.findMany({ where: { mpRefreshTokenEnc: { not: null }, mpTokenExpiresAt: { lt: soon } }, include: { user: true } });
  for (const p of pros) {
    try {
      await saveTokens(p.id, await mp.refresh(decrypt(p.mpRefreshTokenEnc!)));
    } catch (err) {
      console.error(`No se pudo renovar el token de Mercado Pago de ${p.displayName}`, err);
      if (p.user?.email) {
        await sendEmail({
          to: p.user.email,
          subject: 'Volvé a conectar tu Mercado Pago',
          text: `No pudimos renovar la conexión con tu cuenta de Mercado Pago. Mientras tanto no vas a recibir reservas online.\nConectala de nuevo en ${env.WEB_ORIGIN}/configuracion`,
        });
      }
    }
  }
}

/** Conciliación: busca pagos de reservas pendientes por si se perdió algún webhook (por ejemplo, con la API dormida). */
export async function reconcilePending() {
  const since = new Date(Date.now() - 2 * 86_400_000);
  const pending = await prisma.appointment.findMany({
    where: { status: { in: ['PENDING_PAYMENT', 'EXPIRED'] }, createdAt: { gte: since }, payments: { some: {} } },
    include: { professional: true },
  });
  for (const a of pending) {
    if (!a.professional.mpAccessTokenEnc) continue;
    try {
      const { results } = await mp.searchPayments(accessToken(a.professional), a.id);
      for (const payment of results) await applyPayment(a.professional, payment);
    } catch (err) {
      console.error('Conciliación', a.id, err);
    }
  }
}
