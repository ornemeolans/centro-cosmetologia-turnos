import type { Prisma } from '@prisma/client';
import { prisma } from '../db';

type Db = Prisma.TransactionClient | typeof prisma;

/**
 * Saldo a favor por (ficha, profesional): el dinero está en la cuenta de Mercado Pago de esa profesional.
 * Cada crédito vence a los N días (la reserva tiene que confirmarse antes; el turno puede ser después).
 */
export async function availableCredit(clientRecordId: string, professionalId: string, db: Db = prisma, now = new Date()) {
  const agg = await db.creditLedger.aggregate({
    where: { clientRecordId, professionalId, amountCents: { gt: 0 }, remainingCents: { gt: 0 }, expiresAt: { gt: now } },
    _sum: { remainingCents: true },
  });
  return agg._sum.remainingCents ?? 0;
}

export async function addCredit(db: Db, input: {
  clientRecordId: string; professionalId: string; amountCents: number; appointmentId: string;
  reason: 'CANCEL_ON_TIME' | 'TRANSFER' | 'ADJUST'; validDays: number;
}) {
  if (input.amountCents <= 0) return;
  await db.creditLedger.create({
    data: {
      clientRecordId: input.clientRecordId,
      professionalId: input.professionalId,
      amountCents: input.amountCents,
      remainingCents: input.amountCents,
      reason: input.reason,
      appointmentId: input.appointmentId,
      expiresAt: new Date(Date.now() + input.validDays * 86_400_000),
    },
  });
}

/** Consume primero los créditos que vencen antes. Devuelve lo efectivamente usado. */
export async function consumeCredit(db: Db, input: { clientRecordId: string; professionalId: string; amountCents: number; appointmentId: string }, now = new Date()) {
  let pending = input.amountCents;
  const credits = await db.creditLedger.findMany({
    where: { clientRecordId: input.clientRecordId, professionalId: input.professionalId, amountCents: { gt: 0 }, remainingCents: { gt: 0 }, expiresAt: { gt: now } },
    orderBy: { expiresAt: 'asc' },
  });
  for (const c of credits) {
    if (pending <= 0) break;
    const take = Math.min(pending, c.remainingCents);
    // Descuento condicionado al saldo leído: si otro pedido lo usó en el medio, este crédito se saltea.
    const { count } = await db.creditLedger.updateMany({
      where: { id: c.id, remainingCents: c.remainingCents },
      data: { remainingCents: { decrement: take } },
    });
    if (count === 1) pending -= take;
  }
  const used = input.amountCents - pending;
  if (used > 0) {
    await db.creditLedger.create({
      data: { clientRecordId: input.clientRecordId, professionalId: input.professionalId, amountCents: -used, reason: 'USED', appointmentId: input.appointmentId },
    });
  }
  return used;
}

/** Tarea periódica: los créditos vencidos dejan de estar disponibles y queda el movimiento registrado. */
export async function expireCredits(now = new Date()) {
  const expired = await prisma.creditLedger.findMany({ where: { amountCents: { gt: 0 }, remainingCents: { gt: 0 }, expiresAt: { lte: now } } });
  for (const c of expired) {
    await prisma.$transaction([
      prisma.creditLedger.update({ where: { id: c.id }, data: { remainingCents: 0 } }),
      prisma.creditLedger.create({
        data: { clientRecordId: c.clientRecordId, professionalId: c.professionalId, amountCents: -c.remainingCents, reason: 'EXPIRED', appointmentId: c.appointmentId },
      }),
    ]);
  }
  return expired.length;
}

/** Saldos vigentes de una ficha, por profesional. */
export async function creditBalances(clientRecordId: string, now = new Date()) {
  const rows = await prisma.creditLedger.groupBy({
    by: ['professionalId'],
    where: { clientRecordId, amountCents: { gt: 0 }, remainingCents: { gt: 0 }, expiresAt: { gt: now } },
    _sum: { remainingCents: true },
    _min: { expiresAt: true },
  });
  return rows.map((r) => ({ professionalId: r.professionalId, amountCents: r._sum.remainingCents ?? 0, nextExpiry: r._min.expiresAt }));
}
