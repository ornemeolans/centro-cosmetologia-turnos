import { Prisma } from '@prisma/client';
import { Router } from 'express';
import type { RawBodyRequest } from '../app';
import { prisma } from '../db';
import { env } from '../env';
import { wrap } from '../http';
import { verifyMercadoPagoSignature, verifyMetaSignature } from '../lib/signatures';
import { handleWhatsAppWebhook } from '../services/whatsappInbound';
import { processWebhookEvent } from '../services/payments';

export const webhooksRouter = Router();

webhooksRouter.post('/mercadopago', wrap(async (req, res) => {
  const dataId = (req.query['data.id'] as string | undefined) ?? req.body?.data?.id?.toString();
  const ok = verifyMercadoPagoSignature({
    xSignature: req.header('x-signature'),
    xRequestId: req.header('x-request-id'),
    dataId,
    secret: env.MP_WEBHOOK_SECRET,
  });
  if (!ok) return res.sendStatus(401);

  const type = (req.query.type as string | undefined) ?? req.body?.type;
  const professionalId = req.query.prof as string | undefined;
  if (type !== 'payment' || !dataId || !professionalId) return res.sendStatus(200);

  // Idempotencia: el mismo aviso puede llegar varias veces.
  let eventId: string;
  try {
    const event = await prisma.webhookEvent.create({
      data: { provider: 'MP', externalId: `${professionalId}:${dataId}:${req.body?.action ?? ''}`, payload: { professionalId, paymentId: dataId } },
    });
    eventId = event.id;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return res.sendStatus(200);
    throw err;
  }
  // Se responde enseguida; si el procesamiento falla, el tick lo reintenta.
  res.sendStatus(200);
  if (env.NODE_ENV !== 'test') setImmediate(() => processWebhookEvent(eventId).catch(console.error));
}));

// Verificación del webhook al configurarlo en Meta.
webhooksRouter.get('/whatsapp', (req, res) => {
  if (req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === env.WHATSAPP_VERIFY_TOKEN) {
    return res.status(200).send(String(req.query['hub.challenge']));
  }
  return res.sendStatus(403);
});

webhooksRouter.post('/whatsapp', wrap(async (req: RawBodyRequest, res) => {
  if (!req.rawBody || !verifyMetaSignature(req.rawBody, req.header('x-hub-signature-256'), env.WHATSAPP_APP_SECRET)) {
    return res.sendStatus(401);
  }
  res.sendStatus(200);
  await handleWhatsAppWebhook(req.body).catch((err) => console.error('Webhook WhatsApp', err));
}));
