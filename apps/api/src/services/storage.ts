import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, normalize } from 'node:path';
import { env } from '../env';

/** Archivos privados de las fichas (fotos y consentimientos firmados). Nunca se exponen con URL pública. */
export interface Storage {
  put(path: string, data: Buffer, contentType: string): Promise<void>;
  get(path: string): Promise<{ data: Buffer; contentType: string }>;
  remove(paths: string[]): Promise<void>;
}

const LOCAL_ROOT = join(process.cwd(), 'uploads');

function localPath(path: string) {
  const full = normalize(join(LOCAL_ROOT, path));
  if (!full.startsWith(LOCAL_ROOT)) throw new Error('Ruta inválida');
  return full;
}

const localStorage: Storage = {
  async put(path, data, contentType) {
    const full = localPath(path);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, data);
    await writeFile(`${full}.type`, contentType);
  },
  async get(path) {
    const full = localPath(path);
    return { data: await readFile(full), contentType: (await readFile(`${full}.type`, 'utf8').catch(() => 'application/octet-stream')) };
  },
  async remove(paths) {
    for (const p of paths) {
      await rm(localPath(p), { force: true });
      await rm(`${localPath(p)}.type`, { force: true });
    }
  },
};

/** Supabase Storage por REST con la service role key (solo del lado del servidor). */
function supabaseStorage(url: string, key: string, bucket: string): Storage {
  const headers = { Authorization: `Bearer ${key}`, apikey: key };
  const objectUrl = (path: string) => `${url}/storage/v1/object/${bucket}/${path}`;
  return {
    async put(path, data, contentType) {
      const res = await fetch(objectUrl(path), { method: 'POST', headers: { ...headers, 'Content-Type': contentType, 'x-upsert': 'true' }, body: new Uint8Array(data) });
      if (!res.ok) throw new Error(`Storage put ${res.status}: ${await res.text()}`);
    },
    async get(path) {
      const res = await fetch(objectUrl(path), { headers });
      if (!res.ok) throw new Error(`Storage get ${res.status}`);
      return { data: Buffer.from(await res.arrayBuffer()), contentType: res.headers.get('content-type') ?? 'application/octet-stream' };
    },
    async remove(paths) {
      if (paths.length === 0) return;
      const res = await fetch(`${url}/storage/v1/object/${bucket}`, {
        method: 'DELETE', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ prefixes: paths }),
      });
      if (!res.ok) throw new Error(`Storage remove ${res.status}`);
    },
  };
}

export const storage: Storage =
  env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY
    ? supabaseStorage(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, env.STORAGE_BUCKET)
    : localStorage;
