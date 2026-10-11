/**
 * Datos iniciales. Se puede correr varias veces sin duplicar nada.
 *   npm run db:seed --workspace apps/api
 * Con SEED_DEMO_CLIENT_EMAIL=alguien@gmail.com además crea una profesional y una ficha de prueba con ese email,
 * para probar la vinculación al iniciar sesión.
 */
import { PrismaClient } from '@prisma/client';
import 'dotenv/config';
import { normalizeEmail } from '../src/lib/email';

const prisma = new PrismaClient();

async function main() {
  await prisma.centerSettings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });

  // Lunes a viernes de 9 a 18 (decisión del centro). Los feriados los carga la OWNER desde su panel.
  for (const weekday of [1, 2, 3, 4, 5]) {
    await prisma.centerHours.upsert({
      where: { weekday },
      update: {},
      create: { weekday, openTime: '09:00', closeTime: '18:00' },
    });
  }

  const demoEmail = process.env.SEED_DEMO_CLIENT_EMAIL;
  if (demoEmail) {
    const email = normalizeEmail(demoEmail);
    let professional = await prisma.professional.findFirst({ where: { displayName: 'Profesional demo' } });
    professional ??= await prisma.professional.create({
      data: { displayName: 'Profesional demo', inviteEmail: 'demo@example.com' },
    });
    await prisma.clientRecord.upsert({
      where: { email },
      update: {},
      create: { email, firstName: 'Clienta', lastName: 'Demo', ownerProfessionalId: professional.id, status: 'ACTIVA' },
    });
    console.log(`Ficha de prueba lista para ${email}`);
  }
  console.log('Seed completo.');
}

main().finally(() => prisma.$disconnect());
