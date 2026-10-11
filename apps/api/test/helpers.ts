import { emailLimiter, loginIpLimiter, loginLimiter } from '../src/auth/rateLimit';
import { prisma } from '../src/db';
import { devOutbox, normalizeEmail } from '../src/lib/email';

/** Vacía todas las tablas (menos el historial de migraciones) y los límites en memoria. */
export async function resetDb() {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(', ')} CASCADE`);
  devOutbox.length = 0;
  loginLimiter.clear();
  loginIpLimiter.clear();
  emailLimiter.clear();
}

/** Token del último email enviado a esa dirección (enlaces ...?token=...). */
export function lastTokenFor(email: string): string {
  const mail = [...devOutbox].reverse().find((m) => m.to === normalizeEmail(email));
  const match = mail?.text.match(/token=([^\s]+)/);
  if (!match) throw new Error(`No hay email con token para ${email}`);
  return decodeURIComponent(match[1]);
}

export async function createProfessionalWithRecord(clientEmail: string) {
  const professional = await prisma.professional.create({ data: { displayName: 'Ana', inviteEmail: 'ana@centro.com' } });
  const record = await prisma.clientRecord.create({
    data: { email: clientEmail, firstName: 'Lucía', lastName: 'Gómez', ownerProfessionalId: professional.id, status: 'ACTIVA' },
  });
  return { professional, record };
}
