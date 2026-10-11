/**
 * Postgres local para desarrollo y tests (sin Docker ni Supabase).
 * Uso: npm run db:local --workspace apps/api  → queda escuchando en localhost:54329 hasta Ctrl+C.
 * En producción se usa Supabase: este script no se despliega.
 */
import EmbeddedPostgres from 'embedded-postgres';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

export const LOCAL_DB_PORT = 54329;
export const LOCAL_DB_URL = `postgresql://postgres:postgres@localhost:${LOCAL_DB_PORT}/turnos`;

export async function startLocalDb(dataDir = join(process.cwd(), '.pgdata')) {
  const pg = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: 'postgres',
    password: 'postgres',
    port: LOCAL_DB_PORT,
    persistent: true,
    onLog: () => {},
  });
  const fresh = !existsSync(join(dataDir, 'PG_VERSION'));
  if (fresh) await pg.initialise();
  await pg.start();
  if (fresh) await pg.createDatabase('turnos');
  return pg;
}

if (process.argv[1]?.endsWith('dev-db.ts')) {
  const pg = await startLocalDb().catch((err) => {
    console.error('No se pudo iniciar Postgres local. ¿Quedó otro postgres.exe corriendo en el puerto', LOCAL_DB_PORT, '?', err);
    process.exit(1);
  });
  console.log(`Postgres local listo: ${LOCAL_DB_URL}`);
  const stop = async () => {
    await pg.stop();
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}
