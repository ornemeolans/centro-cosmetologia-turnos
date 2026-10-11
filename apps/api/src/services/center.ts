import type { CenterSettings } from '@prisma/client';
import type { CenterHours, NoticeConfig, Weekday } from '@turnos/shared';
import { DateTime } from 'luxon';
import { CENTER_ZONE } from '@turnos/shared';
import { prisma } from '../db';

export async function getSettings(): Promise<CenterSettings> {
  return prisma.centerSettings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });
}

export async function getCenterHours(): Promise<CenterHours> {
  const rows = await prisma.centerHours.findMany();
  const hours: CenterHours = {};
  for (const r of rows) hours[r.weekday as Weekday] = { open: r.openTime, close: r.closeTime };
  return hours;
}

/** Feriados como 'yyyy-MM-dd' (la columna es DATE: se lee en UTC para no correr el día). */
export async function getHolidaySet(): Promise<Set<string>> {
  const rows = await prisma.holiday.findMany({ select: { date: true } });
  return new Set(rows.map((h) => h.date.toISOString().slice(0, 10)));
}

export async function getNoticeConfig(settings?: CenterSettings): Promise<NoticeConfig & { maxReschedules: number }> {
  const s = settings ?? (await getSettings());
  const [centerHours, holidays] = await Promise.all([getCenterHours(), getHolidaySet()]);
  return { centerHours, holidays, noticeBusinessDays: s.noticeBusinessDays, zone: CENTER_ZONE, maxReschedules: s.maxReschedules };
}

/** 'yyyy-MM-dd' → Date a medianoche UTC, para columnas DATE. */
export const dateOnly = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

export const localDay = (d: Date) => DateTime.fromJSDate(d, { zone: CENTER_ZONE }).toISODate()!;
