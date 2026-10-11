import type { Professional, User } from '@prisma/client';
import { prisma } from '../db';
import { forbidden } from '../http';

/** Perfil de profesional de quien hace el pedido (la OWNER también atiende). */
export async function myProfessional(user: User): Promise<Professional> {
  const professional = await prisma.professional.findUnique({ where: { userId: user.id } });
  if (!professional || !professional.isActive) throw forbidden('NOT_A_PROFESSIONAL');
  return professional;
}
