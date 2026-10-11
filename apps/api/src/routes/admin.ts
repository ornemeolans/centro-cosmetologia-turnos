import { Router } from 'express';
import { z } from 'zod';
import { MIN_PASSWORD_LENGTH } from '../auth/service';
import { endAllSessions, requireRole } from '../auth/session';
import { prisma } from '../db';
import { env } from '../env';
import { HttpError, notFound, wrap } from '../http';
import { hashPassword } from '../lib/crypto';
import { normalizeEmail, sendEmail } from '../lib/email';
import { dateOnly, getSettings } from '../services/center';

export const adminRouter = Router();
adminRouter.use(requireRole('OWNER'));

const INVITE_DAYS = 7;
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

// ───────────────────────── Profesionales ─────────────────────────

adminRouter.get('/professionals', wrap(async (_req, res) => {
  const professionals = await prisma.professional.findMany({
    orderBy: { displayName: 'asc' },
    include: { user: { select: { email: true, role: true } } },
  });
  res.json({
    professionals: professionals.map((p) => ({
      id: p.id,
      displayName: p.displayName,
      email: p.user?.email ?? p.inviteEmail,
      status: !p.isActive ? 'INACTIVA' : p.userId ? 'ACTIVA' : p.inviteExpiresAt && p.inviteExpiresAt > new Date() ? 'INVITADA' : 'INVITACION_VENCIDA',
      isOwner: p.user?.role === 'OWNER',
      mpConnected: Boolean(p.mpAccessTokenEnc),
    })),
  });
}));

/** Invita por email; al entrar con ese email (Google o cuenta verificada) queda como PROFESSIONAL. */
adminRouter.post('/professionals', wrap(async (req, res) => {
  const body = z.object({ displayName: z.string().min(2).max(80), email: z.string().email() }).parse(req.body);
  const email = normalizeEmail(body.email);
  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser && existingUser.role !== 'CLIENT') throw new HttpError(409, 'ALREADY_STAFF');

  const expires = new Date(Date.now() + INVITE_DAYS * 86_400_000);
  const pending = await prisma.professional.findFirst({ where: { inviteEmail: email, userId: null } });
  const professional = pending
    ? await prisma.professional.update({ where: { id: pending.id }, data: { displayName: body.displayName, inviteExpiresAt: expires, isActive: true } })
    : await prisma.professional.create({ data: { displayName: body.displayName, inviteEmail: email, inviteExpiresAt: expires } });

  // Si ya tenía cuenta de clienta, pasa a profesional ahora mismo.
  if (existingUser) {
    await prisma.$transaction([
      prisma.professional.update({ where: { id: professional.id }, data: { userId: existingUser.id, inviteExpiresAt: null } }),
      prisma.user.update({ where: { id: existingUser.id }, data: { role: 'PROFESSIONAL' } }),
    ]);
  }

  await sendEmail({
    to: email,
    subject: 'Te invitaron a la agenda del centro',
    text:
      `Hola ${body.displayName}: te sumaron como profesional en la agenda del centro.\n` +
      `Entrá con este mismo email (con Google o creando una cuenta) en ${env.WEB_ORIGIN}/ingresar\n` +
      `La invitación vence en ${INVITE_DAYS} días.`,
  });
  res.status(201).json({ id: professional.id });
}));

adminRouter.patch('/professionals/:id', wrap(async (req, res) => {
  const body = z.object({ isActive: z.boolean().optional(), displayName: z.string().min(2).max(80).optional() }).parse(req.body);
  const professional = await prisma.professional.findUnique({ where: { id: req.params.id }, include: { user: true } });
  if (!professional) throw notFound();
  if (professional.user?.role === 'OWNER' && body.isActive === false) throw new HttpError(422, 'CANNOT_DISABLE_OWNER');

  await prisma.professional.update({ where: { id: professional.id }, data: body });
  if (body.isActive === false && professional.userId) {
    // Conserva su historial: solo pierde el acceso.
    await prisma.user.update({ where: { id: professional.userId }, data: { isActive: false } });
    await endAllSessions(professional.userId);
  }
  if (body.isActive === true && professional.userId) {
    await prisma.user.update({ where: { id: professional.userId }, data: { isActive: true } });
  }
  res.json({ ok: true });
}));

// ───────────────────────── Recepción ─────────────────────────

adminRouter.get('/reception-access', wrap(async (_req, res) => {
  const [google, users] = await Promise.all([
    prisma.staffAllowlist.findMany({ where: { role: 'RECEPTION' }, orderBy: { createdAt: 'asc' } }),
    prisma.user.findMany({
      where: { role: 'RECEPTION', email: null },
      include: { identities: { where: { provider: 'PASSWORD' }, select: { providerSubject: true } } },
    }),
  ]);
  res.json({
    google: google.map((g) => ({ id: g.id, email: g.email })),
    users: users.map((u) => ({ id: u.id, name: u.name, username: u.identities[0]?.providerSubject, isActive: u.isActive })),
  });
}));

const receptionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('google'), email: z.string().email() }),
  z.object({
    type: z.literal('password'),
    name: z.string().min(2).max(80),
    username: z.string().regex(/^[a-z0-9._-]{3,30}$/, 'Solo minúsculas, números, punto, guion'),
    password: z.string().min(MIN_PASSWORD_LENGTH).max(200),
  }),
]);

adminRouter.post('/reception-access', wrap(async (req, res) => {
  const body = receptionSchema.parse(req.body);
  if (body.type === 'google') {
    const email = normalizeEmail(body.email);
    await prisma.staffAllowlist.upsert({
      where: { email },
      update: { role: 'RECEPTION' },
      create: { email, role: 'RECEPTION', createdById: req.user!.id },
    });
    // Si ya existe como clienta, el cambio aplica desde ahora.
    await prisma.user.updateMany({ where: { email, role: 'CLIENT' }, data: { role: 'RECEPTION' } });
    return res.status(201).json({ ok: true });
  }

  const taken = await prisma.authIdentity.findUnique({
    where: { provider_providerSubject: { provider: 'PASSWORD', providerSubject: body.username } },
  });
  if (taken) throw new HttpError(409, 'USERNAME_TAKEN');
  await prisma.user.create({
    data: {
      name: body.name,
      role: 'RECEPTION',
      identities: {
        create: { provider: 'PASSWORD', providerSubject: body.username, passwordHash: await hashPassword(body.password), verifiedAt: new Date() },
      },
    },
  });
  res.status(201).json({ ok: true });
}));

adminRouter.delete('/reception-access/google/:id', wrap(async (req, res) => {
  const entry = await prisma.staffAllowlist.findUnique({ where: { id: req.params.id } });
  if (!entry) throw notFound();
  await prisma.staffAllowlist.delete({ where: { id: entry.id } });
  const user = await prisma.user.findUnique({ where: { email: entry.email } });
  if (user?.role === 'RECEPTION') {
    await prisma.user.update({ where: { id: user.id }, data: { role: 'CLIENT' } });
    await endAllSessions(user.id);
  }
  res.json({ ok: true });
}));

adminRouter.patch('/reception-access/users/:id', wrap(async (req, res) => {
  const body = z.object({ isActive: z.boolean() }).parse(req.body);
  const user = await prisma.user.findFirst({ where: { id: req.params.id, role: 'RECEPTION' } });
  if (!user) throw notFound();
  await prisma.user.update({ where: { id: user.id }, data: { isActive: body.isActive } });
  if (!body.isActive) await endAllSessions(user.id);
  res.json({ ok: true });
}));

// ───────────────────────── Ajustes del centro ─────────────────────────

adminRouter.get('/settings', wrap(async (_req, res) => {
  const [settings, hours, holidays] = await Promise.all([
    getSettings(),
    prisma.centerHours.findMany({ orderBy: { weekday: 'asc' } }),
    prisma.holiday.findMany({ orderBy: { date: 'asc' }, where: { date: { gte: dateOnly(new Date().toISOString().slice(0, 10)) } } }),
  ]);
  const { id: _id, lastDailyJobAt: _l, ...editable } = settings;
  res.json({
    settings: editable,
    centerHours: hours.map((h) => ({ weekday: h.weekday, open: h.openTime, close: h.closeTime })),
    holidays: holidays.map((h) => ({ date: h.date.toISOString().slice(0, 10), name: h.name })),
  });
}));

adminRouter.put('/settings', wrap(async (req, res) => {
  const body = z.object({
    bufferMin: z.number().int().min(0).max(120),
    holdMin: z.number().int().min(5).max(60),
    maxReschedules: z.number().int().min(0).max(10),
    noticeBusinessDays: z.number().int().min(0).max(10),
    creditValidDays: z.number().int().min(1).max(365),
    waitlistPriorityMin: z.number().int().min(0).max(1440),
    maxAlertsPerWeek: z.number().int().min(0).max(50),
    reliableMinVisits: z.number().int().min(1).max(50),
    reliableMinRate: z.number().min(0).max(1),
  }).parse(req.body);
  await getSettings();
  await prisma.centerSettings.update({ where: { id: 1 }, data: body });
  res.json({ ok: true });
}));

adminRouter.put('/center-hours', wrap(async (req, res) => {
  const days = z.array(z.object({ weekday: z.number().int().min(1).max(7), open: hhmm, close: hhmm }))
    .refine((d) => d.every((x) => x.open < x.close), 'La apertura tiene que ser antes del cierre')
    .refine((d) => new Set(d.map((x) => x.weekday)).size === d.length, 'Día repetido')
    .parse(req.body);
  await prisma.$transaction([
    prisma.centerHours.deleteMany(),
    prisma.centerHours.createMany({ data: days.map((d) => ({ weekday: d.weekday, openTime: d.open, closeTime: d.close })) }),
  ]);
  res.json({ ok: true });
}));

adminRouter.post('/holidays', wrap(async (req, res) => {
  const body = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), name: z.string().min(2).max(80) }).parse(req.body);
  await prisma.holiday.upsert({ where: { date: dateOnly(body.date) }, update: { name: body.name }, create: { date: dateOnly(body.date), name: body.name } });
  res.status(201).json({ ok: true });
}));

adminRouter.delete('/holidays/:date', wrap(async (req, res) => {
  await prisma.holiday.deleteMany({ where: { date: dateOnly(req.params.date) } });
  res.json({ ok: true });
}));
