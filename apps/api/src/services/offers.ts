import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '../env';

/**
 * Tokens firmados (HMAC con SESSION_SECRET) para enlaces que se mandan por WhatsApp/email:
 * no llevan datos personales y no se pueden falsificar.
 */
function sign(payload: string): string {
  return createHmac('sha256', `${env.SESSION_SECRET}:links`).update(payload).digest('base64url');
}

function encode(obj: object): string {
  const payload = Buffer.from(JSON.stringify(obj)).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

function decode<T>(token: string): T | null {
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString()) as T;
  } catch {
    return null;
  }
}

export interface Offer {
  professionalId: string;
  date: string;
  start: string;
  exp: number;
}

/** Enlace de lista de espera / alerta de último momento para un horario liberado. */
export function signOffer(offer: Omit<Offer, 'exp'>, hours = 24): string {
  return encode({ ...offer, exp: Date.now() + hours * 3_600_000 });
}

export function verifyOffer(token: string): Offer | null {
  const offer = decode<Offer>(token);
  return offer && offer.exp > Date.now() ? offer : null;
}

/** Enlace de calendario del WhatsApp (/c/:token): solo identifica el turno. */
export function signAppointmentLink(appointmentId: string): string {
  return encode({ a: appointmentId });
}

export function verifyAppointmentLink(token: string): string | null {
  return decode<{ a: string }>(token)?.a ?? null;
}
