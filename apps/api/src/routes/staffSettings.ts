import { Router } from 'express';
import { z } from 'zod';
import { requireRole } from '../auth/session';
import { prisma } from '../db';
import { HttpError, wrap } from '../http';
import { dateOnly } from '../services/center';
import { myProfessional } from '../services/staff';

/** /staff/me/*: cada profesional configura su propia agenda, tratamientos y reglas. */
export const staffSettingsRouter = Router();
staffSettingsRouter.use(requireRole('PROFESSIONAL', 'OWNER'));

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

staffSettingsRouter.get('/', wrap(async (req, res) => {
  const p = await myProfessional(req.user!);
  const [schedules, exceptions, treatments, configured, combos] = await Promise.all([
    prisma.schedule.findMany({ where: { professionalId: p.id }, orderBy: [{ weekday: 'asc' }, { startTime: 'asc' }] }),
    prisma.scheduleException.findMany({
      where: { professionalId: p.id, date: { gte: dateOnly(new Date().toISOString().slice(0, 10)) } },
      orderBy: { date: 'asc' },
    }),
    prisma.treatment.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } }),
    prisma.professionalTreatment.findMany({ where: { professionalId: p.id } }),
    prisma.treatmentCombo.findMany({ where: { professionalId: p.id } }),
  ]);
  const byTreatment = new Map(configured.map((c) => [c.treatmentId, c]));
  res.json({
    professional: {
      id: p.id,
      displayName: p.displayName,
      minAdvanceHours: p.minAdvanceHours,
      maxAdvanceDays: p.maxAdvanceDays,
      mpConnected: Boolean(p.mpAccessTokenEnc),
    },
    schedule: schedules.map((s) => ({ weekday: s.weekday, start: s.startTime, end: s.endTime })),
    exceptions: exceptions.map((e) => ({
      id: e.id, date: e.date.toISOString().slice(0, 10), start: e.startTime, end: e.endTime, type: e.type, reason: e.reason,
    })),
    treatments: treatments.map((t) => {
      const c = byTreatment.get(t.id);
      return {
        treatmentId: t.id,
        name: t.name,
        offered: Boolean(c?.isActive),
        durationMin: c?.durationMin ?? 60,
        priceCents: c?.priceCents ?? 0,
        depositPercent: c?.depositPercent ?? 30,
      };
    }),
    combos: combos.map((c) => [c.treatmentAId, c.treatmentBId]),
  });
}));

staffSettingsRouter.put('/schedule', wrap(async (req, res) => {
  const p = await myProfessional(req.user!);
  const blocks = z.array(z.object({ weekday: z.number().int().min(1).max(7), start: hhmm, end: hhmm }))
    .refine((b) => b.every((x) => x.start < x.end), 'Cada franja tiene que empezar antes de terminar')
    .parse(req.body);
  // Franjas del mismo día no se pueden pisar.
  for (const day of [1, 2, 3, 4, 5, 6, 7]) {
    const sorted = blocks.filter((b) => b.weekday === day).sort((a, b) => a.start.localeCompare(b.start));
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].start < sorted[i - 1].end) throw new HttpError(422, 'OVERLAPPING_BLOCKS', { weekday: day });
    }
  }
  await prisma.$transaction([
    prisma.schedule.deleteMany({ where: { professionalId: p.id } }),
    prisma.schedule.createMany({ data: blocks.map((b) => ({ professionalId: p.id, weekday: b.weekday, startTime: b.start, endTime: b.end })) }),
  ]);
  res.json({ ok: true });
}));

staffSettingsRouter.post('/exceptions', wrap(async (req, res) => {
  const p = await myProfessional(req.user!);
  const body = z.object({
    date: isoDate,
    type: z.enum(['BLOCK', 'EXTRA']),
    start: hhmm.optional(),
    end: hhmm.optional(),
    reason: z.string().max(120).optional(),
  }).refine((b) => (b.start && b.end ? b.start < b.end : b.type === 'BLOCK' && !b.start && !b.end), 'Rango inválido (un bloqueo sin horario es el día completo; una franja extra necesita horario)')
    .parse(req.body);
  const created = await prisma.scheduleException.create({
    data: { professionalId: p.id, date: dateOnly(body.date), type: body.type, startTime: body.start, endTime: body.end, reason: body.reason },
  });
  res.status(201).json({ id: created.id });
}));

staffSettingsRouter.delete('/exceptions/:id', wrap(async (req, res) => {
  const p = await myProfessional(req.user!);
  await prisma.scheduleException.deleteMany({ where: { id: req.params.id, professionalId: p.id } });
  res.json({ ok: true });
}));

staffSettingsRouter.put('/treatments', wrap(async (req, res) => {
  const p = await myProfessional(req.user!);
  const rows = z.array(z.object({
    treatmentId: z.string().uuid(),
    offered: z.boolean(),
    durationMin: z.number().int().min(5).max(480),
    priceCents: z.number().int().min(0),
    depositPercent: z.number().int().min(0).max(100),
  })).parse(req.body);
  await prisma.$transaction(rows.map((r) => prisma.professionalTreatment.upsert({
    where: { professionalId_treatmentId: { professionalId: p.id, treatmentId: r.treatmentId } },
    update: { durationMin: r.durationMin, priceCents: r.priceCents, depositPercent: r.depositPercent, isActive: r.offered },
    create: { professionalId: p.id, treatmentId: r.treatmentId, durationMin: r.durationMin, priceCents: r.priceCents, depositPercent: r.depositPercent, isActive: r.offered },
  })));
  res.json({ ok: true });
}));

/** Pares de tratamientos que se pueden reservar juntos. Se guardan ordenados para no duplicar (a,b)/(b,a). */
staffSettingsRouter.put('/combos', wrap(async (req, res) => {
  const p = await myProfessional(req.user!);
  const pairs = z.array(z.tuple([z.string().uuid(), z.string().uuid()])).parse(req.body);
  const unique = new Map<string, [string, string]>();
  for (const [a, b] of pairs) {
    if (a === b) continue;
    const sorted = [a, b].sort() as [string, string];
    unique.set(sorted.join(':'), sorted);
  }
  await prisma.$transaction([
    prisma.treatmentCombo.deleteMany({ where: { professionalId: p.id } }),
    prisma.treatmentCombo.createMany({ data: [...unique.values()].map(([a, b]) => ({ professionalId: p.id, treatmentAId: a, treatmentBId: b })) }),
  ]);
  res.json({ ok: true });
}));

staffSettingsRouter.patch('/booking-rules', wrap(async (req, res) => {
  const p = await myProfessional(req.user!);
  const body = z.object({
    minAdvanceHours: z.number().int().min(0).max(24 * 30),
    maxAdvanceDays: z.number().int().min(1).max(365),
  }).parse(req.body);
  await prisma.professional.update({ where: { id: p.id }, data: body });
  res.json({ ok: true });
}));

/** Catálogo común de tratamientos: cualquier profesional puede sumar uno que falte. */
staffSettingsRouter.post('/catalog', wrap(async (req, res) => {
  const body = z.object({ name: z.string().min(2).max(80), description: z.string().max(500).optional() }).parse(req.body);
  const existing = await prisma.treatment.findFirst({ where: { name: { equals: body.name, mode: 'insensitive' } } });
  if (existing) throw new HttpError(409, 'TREATMENT_EXISTS', { treatmentId: existing.id });
  const t = await prisma.treatment.create({ data: body });
  res.status(201).json({ id: t.id });
}));
