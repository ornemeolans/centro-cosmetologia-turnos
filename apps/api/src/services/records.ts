import type { ClientRecord, Prisma, User } from '@prisma/client';
import { prisma } from '../db';
import { forbidden, notFound } from '../http';

export type RecordAccess = 'FULL' | 'CONTACT';

/**
 * Quién ve qué de una ficha:
 * - OWNER: todo.
 * - PROFESSIONAL: todo si es la titular o tiene un acceso vigente.
 * - RECEPTION: solo datos de contacto y turnos (nunca historia clínica ni fotos).
 */
export async function recordAccess(user: User, recordId: string): Promise<{ record: ClientRecord; access: RecordAccess }> {
  const record = await prisma.clientRecord.findUnique({ where: { id: recordId } });
  if (!record) throw notFound('RECORD_NOT_FOUND');
  if (user.role === 'OWNER') return { record, access: 'FULL' };
  if (user.role === 'RECEPTION') return { record, access: 'CONTACT' };
  if (user.role === 'PROFESSIONAL') {
    const professional = await prisma.professional.findUnique({ where: { userId: user.id } });
    if (professional && (await canProfessionalSee(professional.id, record))) return { record, access: 'FULL' };
  }
  throw forbidden('NO_RECORD_ACCESS');
}

async function canProfessionalSee(professionalId: string, record: ClientRecord): Promise<boolean> {
  if (record.ownerProfessionalId === professionalId) return true;
  const grant = await prisma.recordAccessGrant.findFirst({
    where: { clientRecordId: record.id, professionalId, revokedAt: null },
  });
  return Boolean(grant);
}

export async function requireFullAccess(user: User, recordId: string) {
  const result = await recordAccess(user, recordId);
  if (result.access !== 'FULL') throw forbidden('NO_RECORD_ACCESS');
  return result.record;
}

/** Solo la titular o la OWNER pueden dar o quitar accesos y cambiar la titular. */
export async function requireTitularOrOwner(user: User, record: ClientRecord) {
  if (user.role === 'OWNER') return;
  const professional = await prisma.professional.findUnique({ where: { userId: user.id } });
  if (professional?.id !== record.ownerProfessionalId) throw forbidden('NOT_TITULAR');
}

/** Filtro de fichas visibles para listar y buscar. */
export async function visibleRecordsWhere(user: User): Promise<Prisma.ClientRecordWhereInput> {
  if (user.role === 'OWNER' || user.role === 'RECEPTION') return {};
  const professional = await prisma.professional.findUnique({ where: { userId: user.id } });
  if (!professional) throw forbidden();
  return {
    OR: [
      { ownerProfessionalId: professional.id },
      { accessGrants: { some: { professionalId: professional.id, revokedAt: null } } },
    ],
  };
}

export async function audit(actorUserId: string | undefined, entity: string, entityId: string, action: string, diff?: Prisma.InputJsonValue) {
  await prisma.auditLog.create({ data: { actorUserId, entity, entityId, action, diff } });
}

/** Si ya existe una cuenta verificada con ese email y sin ficha, la vincula ahora (sin esperar al próximo login). */
export async function linkUserByEmail(recordId: string, email: string) {
  const user = await prisma.user.findUnique({ where: { email }, include: { clientRecord: true } });
  const userId = user?.emailVerifiedAt && !user.clientRecord && user.role === 'CLIENT' ? user.id : null;
  await prisma.clientRecord.update({ where: { id: recordId }, data: { userId } });
  return userId;
}
