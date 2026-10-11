import EmbeddedPostgres from 'embedded-postgres';
import { execSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = 54330;

/** Levanta un Postgres descartable para los tests y aplica las migraciones reales. */
export default async function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'turnos-test-'));
  const pg = new EmbeddedPostgres({ databaseDir: dir, user: 'postgres', password: 'postgres', port: PORT, persistent: false, onLog: () => {} });
  await pg.initialise();
  await pg.start();
  await pg.createDatabase('turnos_test');

  execSync('npx prisma migrate deploy', {
    stdio: 'ignore',
    env: { ...process.env, DATABASE_URL: `postgresql://postgres:postgres@localhost:${PORT}/turnos_test` },
  });

  return async () => {
    await pg.stop();
    rmSync(dir, { recursive: true, force: true });
  };
}
