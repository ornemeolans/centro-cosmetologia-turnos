import { firstVisitRecordSchema, phoneSchema } from '@turnos/shared';
import express, { Router } from 'express';
import { z } from 'zod';
import { requireRole } from '../auth/session';
import { prisma } from '../db';
import { forbidden, HttpError, notFound, wrap } from '../http';
import { randomToken } from '../lib/crypto';
import { normalizeEmail } from '../lib/email';
import { creditBalances } from '../services/credits';
import { audit, linkUserByEmail, recordAccess, requireFullAccess, requireTitularOrOwner, visibleRecordsWhere } from '../services/records';
import { storage } from '../services/storage';

export const recordsRouter = Router();
recordsRouter.use(requireRole('PROFESSIONAL', 'RECEPTION', 'OWNER'));

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const contactSelect = {
  id: true, firstName: true, lastName: true, email: true, phoneE164: true, status: true, userId: true, isReliable: true,
  ownerProfessional: { select: { id: true, displayName: true } },
} as const;

const toContact = (r: { userId: string | null } & Record<string, unknown>) => {
  const { userId, ...rest } = r;
  return { ...rest, linked: Boolean(userId) };
};

recordsRouter.get('/', wrap(async (req, res) => {
  const q = z.object({ q: z.string().max(100).optional() }).parse(req.query).q?.trim();
  const search = q
    ? { OR: ['firstName', 'lastName', 'email', 'phoneE164'].map((f) => ({ [f]: { contains: q, mode: 'insensitive' as const } })) }
    : {};
  const records = await prisma.clientRecord.findMany({
    where: { AND: [await visibleRecordsWhere(req.user!), search] },
    select: contactSelect,
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    take: 100,
  });
  res.json({ records: records.map(toContact) });
}));

const baseRecordFields = {
  firstName: z.string().min(1).max(60),
  lastName: z.string().min(1).max(60),
  email: z.string().email(),
  phoneE164: phoneSchema.shape.phoneE164.optional(),
  birthDate: isoDate.optional(),
  skinType: z.string().max(60).optional(),
  antecedentes: z.string().max(5000).optional(),
  alergias: z.string().max(2000).optional(),
  medicacion: z.string().max(2000).optional(),
};

/** Ficha creada por una profesional (clienta existente): queda ACTIVA y ella como titular. */
recordsRouter.post('/', requireRole('PROFESSIONAL', 'OWNER'), wrap(async (req, res) => {
  const body = z.object({ ...baseRecordFields, ownerProfessionalId: z.string().uuid().optional() }).parse(req.body);
  const me = await prisma.professional.findUnique({ where: { userId: req.user!.id } });
  const ownerProfessionalId = req.user!.role === 'OWNER' && body.ownerProfessionalId ? body.ownerProfessionalId : me?.id;
  if (!ownerProfessionalId) throw forbidden('NOT_A_PROFESSIONAL');
  const record = await createRecord({ ...body, ownerProfessionalId, status: 'ACTIVA' }, req.user!.id);
  res.status(201).json({ id: record.id, linked: Boolean(record.userId) });
}));

/** Recepción: perfil mínimo de primera vez (estado PRIMERA_VEZ). */
recordsRouter.post('/first-visit', requireRole('RECEPTION', 'OWNER'), wrap(async (req, res) => {
  const body = firstVisitRecordSchema.parse(req.body);
  const professional = await prisma.professional.findFirst({ where: { id: body.ownerProfessionalId, isActive: true } });
  if (!professional) throw notFound('PROFESSIONAL_NOT_FOUND');
  const record = await createRecord({ ...body, status: 'PRIMERA_VEZ' }, req.user!.id);
  await prisma.consent.create({ data: { clientRecordId: record.id, type: 'WHATSAPP', documentVersion: 'verbal-recepcion', signedAt: new Date() } });
  res.status(201).json({ id: record.id });
}));

async function createRecord(
  data: { email: string; firstName: string; lastName: string; ownerProfessionalId: string; status: 'ACTIVA' | 'PRIMERA_VEZ'; phoneE164?: string; birthDate?: string; skinType?: string; antecedentes?: string; alergias?: string; medicacion?: string },
  actorId: string,
) {
  const email = normalizeEmail(data.email);
  const existing = await prisma.clientRecord.findUnique({ where: { email } });
  if (existing) throw new HttpError(409, 'RECORD_EXISTS', { recordId: existing.id });
  const record = await prisma.clientRecord.create({
    data: { ...data, email, birthDate: data.birthDate ? new Date(`${data.birthDate}T00:00:00Z`) : undefined },
  });
  const userId = await linkUserByEmail(record.id, email);
  await audit(actorId, 'client_record', record.id, 'CREATE');
  return { ...record, userId };
}

recordsRouter.get('/:id', wrap(async (req, res) => {
  const { record, access } = await recordAccess(req.user!, req.params.id);
  const appointments = await prisma.appointment.findMany({
    where: { clientRecordId: record.id },
    orderBy: { startAt: 'desc' },
    take: 30,
    include: { items: { include: { treatment: { select: { name: true } } } }, professional: { select: { displayName: true } } },
  });
  const contact = await prisma.clientRecord.findUniqueOrThrow({ where: { id: record.id }, select: contactSelect });
  const appts = appointments.map((a) => ({
    id: a.id, startAt: a.startAt, endAt: a.endAt, status: a.status, isFirstVisit: a.isFirstVisit,
    professional: a.professional.displayName, treatments: a.items.map((i) => i.treatment.name),
  }));
  if (access === 'CONTACT') return res.json({ access, record: toContact(contact), appointments: appts });

  await audit(req.user!.id, 'client_record', record.id, 'VIEW');
  const [consents, entries, recommendations, grants, photos, credits] = await Promise.all([
    prisma.consent.findMany({ where: { clientRecordId: record.id }, orderBy: { signedAt: 'desc' } }),
    prisma.recordEntry.findMany({ where: { clientRecordId: record.id }, orderBy: { createdAt: 'desc' } }),
    prisma.recommendation.findMany({ where: { clientRecordId: record.id }, orderBy: { createdAt: 'desc' } }),
    prisma.recordAccessGrant.findMany({ where: { clientRecordId: record.id, revokedAt: null }, include: { professional: { select: { displayName: true } } } }),
    prisma.recordPhoto.findMany({ where: { clientRecordId: record.id }, orderBy: { takenAt: 'desc' } }),
    creditBalances(record.id),
  ]);
  res.json({
    access,
    record: {
      ...toContact(contact),
      birthDate: record.birthDate?.toISOString().slice(0, 10) ?? null,
      skinType: record.skinType, antecedentes: record.antecedentes, alergias: record.alergias, medicacion: record.medicacion,
      completedAt: record.completedAt, retentionUntil: record.retentionUntil,
    },
    appointments: appts,
    consents: consents.map((c) => ({ id: c.id, type: c.type, documentVersion: c.documentVersion, signedAt: c.signedAt, revokedAt: c.revokedAt })),
    entries: entries.map((e) => ({ id: e.id, notes: e.notesPrivate, appointmentId: e.appointmentId, createdAt: e.createdAt })),
    recommendations: recommendations.map((r) => ({ id: r.id, body: r.body, visibleToClient: r.visibleToClient, createdAt: r.createdAt })),
    grants: grants.map((g) => ({ professionalId: g.professionalId, displayName: g.professional.displayName, grantedAt: g.grantedAt })),
    photos: photos.map((p) => ({ id: p.id, kind: p.kind, takenAt: p.takenAt, appointmentId: p.appointmentId })),
    credits,
  });
}));

recordsRouter.patch('/:id', wrap(async (req, res) => {
  const { record, access } = await recordAccess(req.user!, req.params.id);
  // Recepción solo corrige datos de contacto.
  const schema = access === 'FULL'
    ? z.object(baseRecordFields).partial()
    : z.object({ firstName: baseRecordFields.firstName, lastName: baseRecordFields.lastName, email: baseRecordFields.email, phoneE164: baseRecordFields.phoneE164 }).partial();
  const body = schema.parse(req.body) as z.infer<z.ZodObject<typeof baseRecordFields>>;

  const data: Record<string, unknown> = { ...body };
  if (body.birthDate) data.birthDate = new Date(`${body.birthDate}T00:00:00Z`);
  let emailChanged = false;
  if (body.email) {
    const email = normalizeEmail(body.email);
    if (email !== record.email) {
      const clash = await prisma.clientRecord.findUnique({ where: { email } });
      if (clash) throw new HttpError(409, 'RECORD_EXISTS', { recordId: clash.id });
      data.email = email;
      emailChanged = true;
    } else delete data.email;
  }
  await prisma.clientRecord.update({ where: { id: record.id }, data });
  if (emailChanged) {
    // Se desvincula de la cuenta anterior y se vincula con la del email nuevo si ya existe.
    await linkUserByEmail(record.id, data.email as string);
    await prisma.clientInquiry.updateMany({ where: { type: 'CAMBIO_EMAIL', requestedEmail: data.email as string, status: 'OPEN' }, data: { status: 'RESOLVED' } });
  }
  await audit(req.user!.id, 'client_record', record.id, 'UPDATE', { fields: Object.keys(data) });
  res.json({ ok: true });
}));

/** La profesional completa la ficha después de la primera sesión: la clienta pasa a tener acceso completo. */
recordsRouter.post('/:id/complete', wrap(async (req, res) => {
  const record = await requireFullAccess(req.user!, req.params.id);
  await prisma.clientRecord.update({ where: { id: record.id }, data: { status: 'ACTIVA', completedAt: new Date() } });
  await audit(req.user!.id, 'client_record', record.id, 'COMPLETE');
  res.json({ ok: true });
}));

// ───────────────────── Accesos y titular ─────────────────────

recordsRouter.post('/:id/grants', wrap(async (req, res) => {
  const record = await requireFullAccess(req.user!, req.params.id);
  await requireTitularOrOwner(req.user!, record);
  const { professionalId } = z.object({ professionalId: z.string().uuid() }).parse(req.body);
  if (professionalId === record.ownerProfessionalId) throw new HttpError(422, 'ALREADY_TITULAR');
  const active = await prisma.recordAccessGrant.findFirst({ where: { clientRecordId: record.id, professionalId, revokedAt: null } });
  if (!active) {
    await prisma.recordAccessGrant.create({ data: { clientRecordId: record.id, professionalId, grantedByUserId: req.user!.id } });
    await audit(req.user!.id, 'client_record', record.id, 'GRANT', { professionalId });
  }
  res.status(201).json({ ok: true });
}));

recordsRouter.delete('/:id/grants/:professionalId', wrap(async (req, res) => {
  const record = await requireFullAccess(req.user!, req.params.id);
  await requireTitularOrOwner(req.user!, record);
  await prisma.recordAccessGrant.updateMany({
    where: { clientRecordId: record.id, professionalId: req.params.professionalId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  await audit(req.user!.id, 'client_record', record.id, 'REVOKE', { professionalId: req.params.professionalId });
  res.json({ ok: true });
}));

/** Cambio de profesional titular (por ejemplo, la clienta se pasa a otra cosmetóloga). */
recordsRouter.patch('/:id/owner', wrap(async (req, res) => {
  const record = await requireFullAccess(req.user!, req.params.id);
  await requireTitularOrOwner(req.user!, record);
  const { professionalId } = z.object({ professionalId: z.string().uuid() }).parse(req.body);
  await prisma.$transaction([
    prisma.clientRecord.update({ where: { id: record.id }, data: { ownerProfessionalId: professionalId } }),
    // La titular anterior conserva acceso para no perder el seguimiento.
    prisma.recordAccessGrant.create({ data: { clientRecordId: record.id, professionalId: record.ownerProfessionalId, grantedByUserId: req.user!.id } }),
    prisma.recordAccessGrant.updateMany({ where: { clientRecordId: record.id, professionalId, revokedAt: null }, data: { revokedAt: new Date() } }),
  ]);
  await audit(req.user!.id, 'client_record', record.id, 'CHANGE_TITULAR', { from: record.ownerProfessionalId, to: professionalId });
  res.json({ ok: true });
}));

// ───────────────────── Consentimientos ─────────────────────

recordsRouter.post('/:id/consents', wrap(async (req, res) => {
  const record = await requireFullAccess(req.user!, req.params.id);
  const body = z.object({
    type: z.enum(['TRATAMIENTO', 'DATOS_SALUD', 'FOTOS', 'WHATSAPP']),
    documentVersion: z.string().min(1).max(40),
  }).parse(req.body);
  const c = await prisma.consent.create({ data: { clientRecordId: record.id, ...body, signedAt: new Date() } });
  await audit(req.user!.id, 'client_record', record.id, 'CONSENT', body);
  res.status(201).json({ id: c.id });
}));

/** Revocar el consentimiento de fotos borra las fotos (decisión del centro). */
recordsRouter.delete('/:id/consents/:consentId', wrap(async (req, res) => {
  const record = await requireFullAccess(req.user!, req.params.id);
  const consent = await prisma.consent.findFirst({ where: { id: req.params.consentId, clientRecordId: record.id, revokedAt: null } });
  if (!consent) throw notFound();
  await prisma.consent.update({ where: { id: consent.id }, data: { revokedAt: new Date() } });
  if (consent.type === 'FOTOS') {
    const photos = await prisma.recordPhoto.findMany({ where: { clientRecordId: record.id } });
    await storage.remove(photos.map((p) => p.storagePath));
    await prisma.recordPhoto.deleteMany({ where: { clientRecordId: record.id } });
  }
  await audit(req.user!.id, 'client_record', record.id, 'CONSENT_REVOKED', { type: consent.type });
  res.json({ ok: true });
}));

// ───────────────────── Fotos antes/después ─────────────────────

const imageBody = express.raw({ type: ['image/jpeg', 'image/png', 'image/webp'], limit: '8mb' });

recordsRouter.post('/:id/photos', imageBody, wrap(async (req, res) => {
  const record = await requireFullAccess(req.user!, req.params.id);
  const q = z.object({ kind: z.enum(['ANTES', 'DESPUES']), appointmentId: z.string().uuid().optional() }).parse(req.query);
  if (!Buffer.isBuffer(req.body) || req.body.length === 0) throw new HttpError(415, 'IMAGE_REQUIRED');
  const consent = await prisma.consent.findFirst({ where: { clientRecordId: record.id, type: 'FOTOS', revokedAt: null } });
  if (!consent) throw new HttpError(422, 'PHOTO_CONSENT_REQUIRED');

  const contentType = req.header('content-type')!;
  const ext = contentType.split('/')[1];
  const path = `${record.id}/${Date.now()}-${randomToken(8)}.${ext}`;
  await storage.put(path, req.body, contentType);
  const photo = await prisma.recordPhoto.create({
    data: { clientRecordId: record.id, appointmentId: q.appointmentId, kind: q.kind, storagePath: path, takenAt: new Date() },
  });
  res.status(201).json({ id: photo.id });
}));

recordsRouter.get('/:id/photos/:photoId', wrap(async (req, res) => {
  const record = await requireFullAccess(req.user!, req.params.id);
  const photo = await prisma.recordPhoto.findFirst({ where: { id: req.params.photoId, clientRecordId: record.id } });
  if (!photo) throw notFound();
  const file = await storage.get(photo.storagePath);
  res.setHeader('Cache-Control', 'private, no-store');
  res.type(file.contentType).send(file.data);
}));

recordsRouter.delete('/:id/photos/:photoId', wrap(async (req, res) => {
  const record = await requireFullAccess(req.user!, req.params.id);
  const photo = await prisma.recordPhoto.findFirst({ where: { id: req.params.photoId, clientRecordId: record.id } });
  if (!photo) throw notFound();
  await storage.remove([photo.storagePath]);
  await prisma.recordPhoto.delete({ where: { id: photo.id } });
  res.json({ ok: true });
}));

// ───────────────────── Historia y recomendaciones ─────────────────────

async function professionalIdFor(userId: string) {
  const p = await prisma.professional.findUnique({ where: { userId } });
  if (!p) throw forbidden('NOT_A_PROFESSIONAL');
  return p.id;
}

recordsRouter.post('/:id/entries', wrap(async (req, res) => {
  const record = await requireFullAccess(req.user!, req.params.id);
  const body = z.object({ notes: z.string().min(1).max(10_000), appointmentId: z.string().uuid().optional() }).parse(req.body);
  const e = await prisma.recordEntry.create({
    data: { clientRecordId: record.id, professionalId: await professionalIdFor(req.user!.id), notesPrivate: body.notes, appointmentId: body.appointmentId },
  });
  res.status(201).json({ id: e.id });
}));

recordsRouter.post('/:id/recommendations', wrap(async (req, res) => {
  const record = await requireFullAccess(req.user!, req.params.id);
  const body = z.object({ body: z.string().min(1).max(5_000), visibleToClient: z.boolean().default(true), appointmentId: z.string().uuid().optional() }).parse(req.body);
  const r = await prisma.recommendation.create({
    data: { clientRecordId: record.id, professionalId: await professionalIdFor(req.user!.id), ...body },
  });
  res.status(201).json({ id: r.id });
}));
