import {
  createCipheriv, createDecipheriv, createHash, randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions,
} from 'node:crypto';
import { env } from '../env';

const scrypt = (password: string, salt: Buffer, keylen: number, options: ScryptOptions) =>
  new Promise<Buffer>((resolve, reject) =>
    scryptCb(password, salt, keylen, options, (err, key) => (err ? reject(err) : resolve(key))),
  );

/** Token opaco para cookies y enlaces de email; en la base solo se guarda su sha256. */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** Clave AES-256 para tokens guardados (TOKEN_ENCRYPTION_KEY en base64, 32 bytes). En desarrollo se deriva de SESSION_SECRET. */
function encryptionKey(): Buffer {
  if (env.TOKEN_ENCRYPTION_KEY) {
    const key = Buffer.from(env.TOKEN_ENCRYPTION_KEY, 'base64');
    if (key.length !== 32) throw new Error('TOKEN_ENCRYPTION_KEY tiene que ser de 32 bytes en base64');
    return key;
  }
  if (env.NODE_ENV === 'production') throw new Error('Falta TOKEN_ENCRYPTION_KEY');
  return createHash('sha256').update(`${env.SESSION_SECRET}:tokens`).digest();
}

/** AES-256-GCM: "iv.tag.cifrado" en base64url. */
export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString('base64url')).join('.');
}

export function decrypt(encoded: string): string {
  const [iv, tag, data] = encoded.split('.').map((s) => Buffer.from(s, 'base64url'));
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

// scrypt nativo de Node (sin dependencias con binarios). Parámetros recomendados por OWASP para scrypt.
const N = 2 ** 17;
const r = 8;
const p = 1;
const KEYLEN = 64;
const MAXMEM = 256 * 1024 * 1024;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, KEYLEN, { N, r, p, maxmem: MAXMEM });
  return `scrypt$${N}$${r}$${p}$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algo, n, rr, pp, saltB64, keyB64] = stored.split('$');
  if (algo !== 'scrypt') return false;
  const expected = Buffer.from(keyB64, 'base64');
  const key = await scrypt(password, Buffer.from(saltB64, 'base64'), expected.length, {
    N: Number(n), r: Number(rr), p: Number(pp), maxmem: MAXMEM,
  });
  return timingSafeEqual(key, expected);
}
