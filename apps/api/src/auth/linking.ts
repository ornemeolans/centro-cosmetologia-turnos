import type { Prisma, Role, User } from '@prisma/client';
import { prisma } from '../db';
import { env } from '../env';
import { normalizeEmail } from '../lib/email';

type Tx = Prisma.TransactionClient;

/**
 * Se ejecuta en cada login con email verificado:
 * 1. asigna el rol (OWNER por OWNER_EMAIL, RECEPTION por staff_allowlist; nunca baja un rol ya asignado),
 * 2. vincula la ficha cuyo email coincide (solo si todavía no estaba vinculada a nadie).
 */
export async function applyLoginEffects(userId: string, verifiedEmail: string): Promise<User> {
  const email = normalizeEmail(verifiedEmail);
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
    const role = await resolveRole(tx, user, email);

    await tx.clientRecord.updateMany({ where: { email, userId: null }, data: { userId } });

    if (role !== user.role) {
      await tx.auditLog.create({
        data: { actorUserId: userId, entity: 'user', entityId: userId, action: 'ROLE_ASSIGNED', diff: { from: user.role, to: role } },
      });
    }
    return tx.user.update({ where: { id: userId }, data: { role, emailVerifiedAt: user.emailVerifiedAt ?? new Date() } });
  });
}

async function resolveRole(tx: Tx, user: User, email: string): Promise<Role> {
  if (env.OWNER_EMAIL && email === normalizeEmail(env.OWNER_EMAIL)) {
    await tx.professional.upsert({
      where: { userId: user.id },
      update: {},
      create: { userId: user.id, displayName: user.name, inviteEmail: email },
    });
    return 'OWNER';
  }
  if (user.role !== 'CLIENT') return user.role;
  const allowed = await tx.staffAllowlist.findUnique({ where: { email } });
  if (allowed) return allowed.role;

  // Invitación de la OWNER: el email verificado alcanza para aceptarla (no hace falta otro token).
  const invite = await tx.professional.findFirst({
    where: { inviteEmail: email, userId: null, isActive: true, inviteExpiresAt: { gt: new Date() } },
  });
  if (invite) {
    await tx.professional.update({ where: { id: invite.id }, data: { userId: user.id, inviteExpiresAt: null } });
    return 'PROFESSIONAL';
  }
  return 'CLIENT';
}
