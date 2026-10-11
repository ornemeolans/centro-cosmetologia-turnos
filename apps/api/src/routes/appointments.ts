import { CENTER_ZONE } from '@turnos/shared';
import { Router } from 'express';
import { DateTime } from 'luxon';
import { z } from 'zod';
import { requireAuth, requireRole } from '../auth/session';
import { prisma } from '../db';
import { forbidden, HttpError, notFound, wrap } from '../http';
import {
  appointmentInclude, cancelAppointment, createAppointment, rescheduleAppointment, serializeAppointment, setAttendance,
} from '../services/appointments';
import { workWindows } from '../services/availability';
import { calendarLinks } from '../services/calendar';
import { verifyAppointmentLink } from '../services/offers';
import { createCheckout } from '../services/payments';
import { recordAccess } from '../services/records';

export const appointmentsRouter = Router();

const startAt = z.string().datetime({ offset: true }).transform((s) => new Date(s));
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

async function myRecord(userId: string) {
  const record = await prisma.clientRecord.findUnique({ where: { userId } });
  if (!record) throw new HttpError(404, 'RECORD_NOT_LINKED');
  return record;
}

// ───────────────────────────── Clienta ─────────────────────────────

appointmentsRouter.get('/me/appointments', requireRole('CLIENT'), wrap(async (req, res) => {
  const { scope } = z.object({ scope: z.enum(['upcoming', 'past']).default('upcoming') }).parse(req.query);
  const record = await myRecord(req.user!.id);
  const now = new Date();
  const list = await prisma.appointment.findMany({
    where: scope === 'upcoming'
      ? { clientRecordId: record.id, endAt: { gte: now }, OR: [{ status: 'CONFIRMED' }, { status: 'PENDING_PAYMENT', holdExpiresAt: { gt: now } }] }
      : { clientRecordId: record.id, OR: [{ endAt: { lt: now } }, { status: { in: ['CANCELED', 'COMPLETED', 'NO_SHOW'] } }] },
    orderBy: { startAt: scope === 'upcoming' ? 'asc' : 'desc' },
    take: 50,
    include: appointmentInclude,
  });
  res.json({ appointments: await Promise.all(list.map((a) => serializeAppointment(a, now))) });
}));

/** Reserva de la clienta: queda pendiente de pago (o confirmada si el saldo a favor cubre la seña). */
appointmentsRouter.post('/appointments', requireRole('CLIENT'), wrap(async (req, res) => {
  const body = z.object({
    professionalId: z.string().uuid(),
    treatmentIds: z.array(z.string().uuid()).min(1).max(4),
    startAt,
    offer: z.string().optional(),
  }).parse(req.body);
  const record = await myRecord(req.user!.id);
  const appt = await createAppointment({
    actor: req.user!, clientRecordId: record.id, professionalId: body.professionalId, treatmentIds: body.treatmentIds,
    startAt: body.startAt, source: 'CLIENT', offerToken: body.offer,
  });
  const checkoutUrl = appt.status === 'PENDING_PAYMENT' ? await createCheckout(appt, record.email) : null;
  res.status(201).json({ appointment: await serializeAppointment(appt), checkoutUrl });
}));

/** La clienta reintenta el pago de una reserva pendiente. */
appointmentsRouter.post('/appointments/:id/checkout', requireRole('CLIENT'), wrap(async (req, res) => {
  const record = await myRecord(req.user!.id);
  const appt = await prisma.appointment.findFirst({ where: { id: req.params.id, clientRecordId: record.id }, include: appointmentInclude });
  if (!appt) throw notFound('APPOINTMENT_NOT_FOUND');
  if (appt.status !== 'PENDING_PAYMENT' || !appt.holdExpiresAt || appt.holdExpiresAt < new Date()) throw new HttpError(422, 'HOLD_EXPIRED');
  res.json({ checkoutUrl: await createCheckout(appt, record.email) });
}));

appointmentsRouter.get('/appointments/:id', requireAuth, wrap(async (req, res) => {
  const appt = await prisma.appointment.findUnique({ where: { id: req.params.id }, include: appointmentInclude });
  if (!appt) throw notFound('APPOINTMENT_NOT_FOUND');
  if (req.user!.role === 'CLIENT' ? appt.clientRecord.userId !== req.user!.id : false) throw notFound('APPOINTMENT_NOT_FOUND');
  if (req.user!.role === 'PROFESSIONAL') await recordAccess(req.user!, appt.clientRecordId);
  res.json({ appointment: await serializeAppointment(appt) });
}));

// Clienta y staff: las reglas (plazo, límite, quién puede) están en el servicio.
appointmentsRouter.post('/appointments/:id/reschedule', requireAuth, wrap(async (req, res) => {
  const body = z.object({ startAt }).parse(req.body);
  const appt = await rescheduleAppointment(req.user!, req.params.id, body.startAt);
  res.json({ appointment: await serializeAppointment(appt) });
}));

appointmentsRouter.post('/appointments/:id/cancel', requireAuth, wrap(async (req, res) => {
  const body = z.object({ acceptForfeit: z.boolean().optional() }).parse(req.body ?? {});
  res.json(await cancelAppointment(req.user!, req.params.id, body));
}));

/** OWNER: cambio dentro del plazo (por ejemplo, enfermedad de una profesional). Motivo obligatorio. */
appointmentsRouter.post('/admin/appointments/:id/force', requireRole('OWNER'), wrap(async (req, res) => {
  const body = z.discriminatedUnion('action', [
    z.object({ action: z.literal('RESCHEDULE'), startAt, reason: z.string().min(5).max(500) }),
    z.object({ action: z.literal('CANCEL'), reason: z.string().min(5).max(500) }),
  ]).parse(req.body);
  if (body.action === 'RESCHEDULE') {
    const appt = await rescheduleAppointment(req.user!, req.params.id, body.startAt, body.reason);
    return res.json({ appointment: await serializeAppointment(appt) });
  }
  res.json(await cancelAppointment(req.user!, req.params.id, { forcedReason: body.reason }));
}));

// ───────────────────────────── Calendario ─────────────────────────────

appointmentsRouter.get('/appointments/:id/calendar.ics', requireRole('CLIENT'), wrap(async (req, res) => {
  const appt = await prisma.appointment.findUnique({ where: { id: req.params.id }, include: appointmentInclude });
  if (!appt || appt.clientRecord.userId !== req.user!.id) throw notFound('APPOINTMENT_NOT_FOUND');
  sendIcs(res, appt);
}));

/** Enlace del WhatsApp: funciona sin iniciar sesión, con un token firmado que solo identifica el turno. */
appointmentsRouter.get('/c/:token', wrap(async (req, res) => {
  const appt = await calendarAppointment(req.params.token);
  const { googleUrl } = calendarLinks(appt);
  res.json({
    title: `${appt.items.map((i) => i.treatment.name).join(' + ')} con ${appt.professional.displayName}`,
    startAt: appt.startAt, endAt: appt.endAt, status: appt.status,
    googleUrl, icsUrl: `/api/v1/c/${req.params.token}/calendar.ics`,
  });
}));

appointmentsRouter.get('/c/:token/calendar.ics', wrap(async (req, res) => {
  sendIcs(res, await calendarAppointment(req.params.token));
}));

async function calendarAppointment(token: string) {
  const id = verifyAppointmentLink(token);
  if (!id) throw notFound('LINK_INVALID');
  // Si el turno se reprogramó, el enlace viejo apunta al turno vigente.
  let appt = await prisma.appointment.findUnique({ where: { id }, include: appointmentInclude });
  for (let i = 0; appt?.status === 'RESCHEDULED' && i < 10; i++) {
    appt = await prisma.appointment.findFirst({ where: { rescheduledFromId: appt.id }, include: appointmentInclude });
  }
  if (!appt) throw notFound('LINK_INVALID');
  return appt;
}

function sendIcs(res: import('express').Response, appt: Parameters<typeof calendarLinks>[0]) {
  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="turno.ics"');
  res.send(calendarLinks(appt).ics);
}

// ───────────────────────────── Staff ─────────────────────────────

const staffBooking = z.object({
  clientRecordId: z.string().uuid(),
  professionalId: z.string().uuid().optional(),
  treatmentIds: z.array(z.string().uuid()).min(1).max(4),
  startAt,
});

/** Profesional u OWNER: turno sin seña (igual se avisa por WhatsApp). */
appointmentsRouter.post('/staff/appointments', requireRole('PROFESSIONAL', 'OWNER', 'RECEPTION'), wrap(async (req, res) => {
  const body = staffBooking.parse(req.body);
  const user = req.user!;
  let professionalId = body.professionalId;
  if (user.role === 'PROFESSIONAL') {
    const me = await prisma.professional.findUnique({ where: { userId: user.id } });
    if (!me || (professionalId && professionalId !== me.id)) throw forbidden('ONLY_OWN_AGENDA');
    professionalId = me.id;
    await recordAccess(user, body.clientRecordId);
  }
  if (!professionalId) throw new HttpError(400, 'PROFESSIONAL_REQUIRED');
  const appt = await createAppointment({
    actor: user, clientRecordId: body.clientRecordId, professionalId, treatmentIds: body.treatmentIds, startAt: body.startAt,
    source: user.role === 'RECEPTION' ? 'RECEPTION' : 'STAFF',
  });
  res.status(201).json({ appointment: await serializeAppointment(appt) });
}));

appointmentsRouter.get('/staff/agenda', requireRole('PROFESSIONAL', 'OWNER', 'RECEPTION'), wrap(async (req, res) => {
  const q = z.object({ date: isoDate, professionalId: z.string().uuid().optional() }).parse(req.query);
  const user = req.user!;
  let professionalIds: string[];
  if (user.role === 'PROFESSIONAL') {
    const me = await prisma.professional.findUnique({ where: { userId: user.id } });
    if (!me) throw forbidden();
    professionalIds = [me.id];
  } else {
    professionalIds = q.professionalId
      ? [q.professionalId]
      : (await prisma.professional.findMany({ where: { isActive: true, userId: { not: null } }, select: { id: true } })).map((p) => p.id);
  }
  const day = DateTime.fromISO(q.date, { zone: CENTER_ZONE });
  const professionals = await prisma.professional.findMany({ where: { id: { in: professionalIds } }, orderBy: { displayName: 'asc' } });
  const now = new Date();
  const columns = await Promise.all(professionals.map(async (p) => {
    const appts = await prisma.appointment.findMany({
      where: {
        professionalId: p.id, startAt: { gte: day.startOf('day').toJSDate(), lte: day.endOf('day').toJSDate() },
        OR: [{ status: { in: ['CONFIRMED', 'COMPLETED', 'NO_SHOW'] } }, { status: 'PENDING_PAYMENT', holdExpiresAt: { gt: now } }],
      },
      orderBy: { startAt: 'asc' },
      include: appointmentInclude,
    });
    return {
      professional: { id: p.id, displayName: p.displayName },
      windows: await workWindows(p.id, q.date),
      appointments: await Promise.all(appts.map(async (a) => ({
        ...(await serializeAppointment(a, now)),
        blockedUntil: a.blockedUntil,
        client: {
          id: a.clientRecord.id, name: `${a.clientRecord.firstName} ${a.clientRecord.lastName}`,
          phone: a.clientRecord.phoneE164, isReliable: a.clientRecord.isReliable,
        },
      }))),
    };
  }));
  res.json({ date: q.date, columns });
}));

appointmentsRouter.patch('/staff/appointments/:id/status', requireRole('PROFESSIONAL', 'OWNER'), wrap(async (req, res) => {
  const { status } = z.object({ status: z.enum(['COMPLETED', 'NO_SHOW']) }).parse(req.body);
  await setAttendance(req.user!, req.params.id, status);
  res.json({ ok: true });
}));
