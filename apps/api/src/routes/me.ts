import { phoneSchema } from '@turnos/shared';
import { Router, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import { emailLimiter } from '../auth/rateLimit';
import { requireAuth } from '../auth/session';
import { prisma } from '../db';
import { env } from '../env';
import { HttpError } from '../http';
import { sendEmail } from '../lib/email';
import { creditBalances } from '../services/credits';

export const meRouter = Router();
meRouter.use(requireAuth);

const wrap = (fn: (req: Request, res: Response) => Promise<unknown>) => (req: Request, res: Response, next: NextFunction) =>
  fn(req, res).catch(next);

meRouter.get('/', wrap(async (req, res) => {
  const user = req.user!;
  const record = await prisma.clientRecord.findUnique({
    where: { userId: user.id },
    select: { id: true, status: true, firstName: true, phoneE164: true },
  });
  const phone = record?.phoneE164 ?? user.phoneE164;
  return res.json({
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
    record: record ? { id: record.id, status: record.status, firstName: record.firstName } : null,
    // Solo las clientas necesitan teléfono para WhatsApp antes de reservar.
    needsPhone: user.role === 'CLIENT' && Boolean(record) && !phone,
  });
}));

meRouter.patch('/', wrap(async (req, res) => {
  const { phoneE164 } = phoneSchema.parse(req.body);
  const userId = req.user!.id;
  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { phoneE164 } }),
    prisma.clientRecord.updateMany({ where: { userId }, data: { phoneE164 } }),
  ]);
  // Dejar el celular en el formulario (que lo explica) es el consentimiento para recibir avisos por WhatsApp.
  const record = await prisma.clientRecord.findUnique({ where: { userId } });
  if (record && !(await prisma.consent.findFirst({ where: { clientRecordId: record.id, type: 'WHATSAPP', revokedAt: null } }))) {
    await prisma.consent.create({ data: { clientRecordId: record.id, type: 'WHATSAPP', documentVersion: 'app-v1', signedAt: new Date() } });
  }
  return res.json({ ok: true });
}));

async function linkedRecord(userId: string) {
  const record = await prisma.clientRecord.findUnique({ where: { userId } });
  if (!record) throw new HttpError(404, 'RECORD_NOT_LINKED');
  return record;
}

meRouter.get('/recommendations', wrap(async (req, res) => {
  const record = await linkedRecord(req.user!.id);
  const list = await prisma.recommendation.findMany({
    where: { clientRecordId: record.id, visibleToClient: true },
    orderBy: { createdAt: 'desc' },
  });
  const pros = await prisma.professional.findMany({ where: { id: { in: [...new Set(list.map((r) => r.professionalId))] } } });
  const name = new Map(pros.map((p) => [p.id, p.displayName]));
  res.json({ recommendations: list.map((r) => ({ id: r.id, body: r.body, createdAt: r.createdAt, professional: name.get(r.professionalId) })) });
}));

meRouter.get('/credits', wrap(async (req, res) => {
  const record = await linkedRecord(req.user!.id);
  const balances = await creditBalances(record.id);
  const pros = await prisma.professional.findMany({ where: { id: { in: balances.map((b) => b.professionalId) } } });
  const name = new Map(pros.map((p) => [p.id, p.displayName]));
  res.json({ credits: balances.map((b) => ({ ...b, professional: name.get(b.professionalId) })) });
}));

// ───────────────────── Lista de espera y alertas ─────────────────────

meRouter.get('/waitlist', wrap(async (req, res) => {
  const record = await linkedRecord(req.user!.id);
  const entries = await prisma.waitlistEntry.findMany({
    where: { clientRecordId: record.id, status: 'ACTIVE', dateTo: { gte: new Date(new Date().toISOString().slice(0, 10)) } },
    orderBy: { dateFrom: 'asc' },
  });
  const pros = await prisma.professional.findMany({ where: { id: { in: entries.map((e) => e.professionalId) } } });
  const name = new Map(pros.map((p) => [p.id, p.displayName]));
  res.json({
    lastMinuteAlerts: record.lastMinuteAlerts,
    entries: entries.map((e) => ({
      id: e.id, professionalId: e.professionalId, professional: name.get(e.professionalId),
      dateFrom: e.dateFrom.toISOString().slice(0, 10), dateTo: e.dateTo.toISOString().slice(0, 10),
    })),
  });
}));

meRouter.post('/waitlist', wrap(async (req, res) => {
  const record = await linkedRecord(req.user!.id);
  if (record.status !== 'ACTIVA') throw new HttpError(422, 'FIRST_VISIT_PENDING');
  const iso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
  const body = z.object({ professionalId: z.string().uuid(), dateFrom: iso, dateTo: iso })
    .refine((b) => b.dateFrom <= b.dateTo, 'Rango inválido').parse(req.body);
  const entry = await prisma.waitlistEntry.create({
    data: {
      clientRecordId: record.id, professionalId: body.professionalId, treatmentIds: [],
      dateFrom: new Date(`${body.dateFrom}T00:00:00Z`), dateTo: new Date(`${body.dateTo}T00:00:00Z`),
    },
  });
  res.status(201).json({ id: entry.id });
}));

meRouter.delete('/waitlist/:id', wrap(async (req, res) => {
  const record = await linkedRecord(req.user!.id);
  await prisma.waitlistEntry.updateMany({ where: { id: req.params.id, clientRecordId: record.id }, data: { status: 'CANCELED' } });
  res.json({ ok: true });
}));

meRouter.patch('/alerts', wrap(async (req, res) => {
  const record = await linkedRecord(req.user!.id);
  const { lastMinuteAlerts } = z.object({ lastMinuteAlerts: z.boolean() }).parse(req.body);
  await prisma.clientRecord.update({ where: { id: record.id }, data: { lastMinuteAlerts } });
  res.json({ ok: true });
}));

/** Clienta sin ficha vinculada: le pide a su cosmetóloga que cargue este email en la ficha. */
meRouter.post('/email-change-request', wrap(async (req, res) => {
  const user = req.user!;
  const body = z.object({ professionalId: z.string().uuid(), message: z.string().max(500).optional() }).parse(req.body);
  if (await prisma.clientRecord.findUnique({ where: { userId: user.id } })) {
    return res.status(409).json({ error: 'ALREADY_LINKED' });
  }
  if (!emailLimiter.attempt(`change:${user.id}`)) return res.status(429).json({ error: 'TOO_MANY_REQUESTS' });

  const professional = await prisma.professional.findFirst({
    where: { id: body.professionalId, isActive: true },
    include: { user: true },
  });
  if (!professional) return res.status(404).json({ error: 'PROFESSIONAL_NOT_FOUND' });

  await prisma.clientInquiry.create({
    data: {
      professionalId: professional.id,
      type: 'CAMBIO_EMAIL',
      body: body.message ?? '',
      requestedEmail: user.email,
    },
  });
  const to = professional.user?.email ?? professional.inviteEmail;
  await sendEmail({
    to,
    subject: `Pedido de actualización de email: ${user.name}`,
    text:
      `${user.name} ingresó a la app con ${user.email} y no encontró su ficha.\n` +
      `Si es tu clienta, actualizá el email de su ficha a ${user.email} y la próxima vez que entre se vinculará sola.\n` +
      (body.message ? `\nMensaje: ${body.message}\n` : '') +
      `\nPanel: ${env.WEB_ORIGIN}/agenda`,
  });
  return res.status(202).json({ ok: true });
}));
