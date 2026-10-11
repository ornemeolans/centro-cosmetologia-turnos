import type { TokenPurpose, User } from '@prisma/client';
import { prisma } from '../db';
import { env } from '../env';
import { HttpError } from '../http';
import { hashPassword, randomToken, sha256, verifyPassword } from '../lib/crypto';
import { normalizeEmail, sendEmail } from '../lib/email';
import { applyLoginEffects } from './linking';
import { endAllSessions } from './session';

export class AuthError extends HttpError {
  constructor(code: string, status = 400) {
    super(status, code);
  }
}

export const MIN_PASSWORD_LENGTH = 10;
const VERIFY_HOURS = 24;
const RESET_HOURS = 1;

// Hash fijo para gastar el mismo tiempo cuando la cuenta no existe (evita adivinar emails por tiempo de respuesta).
const DUMMY_HASH = hashPassword('contraseña-inexistente-para-igualar-tiempos');

function assertPassword(password: string) {
  if (password.length < MIN_PASSWORD_LENGTH) throw new AuthError('PASSWORD_TOO_SHORT', 422);
}

async function issueEmailToken(userId: string, purpose: TokenPurpose, hours: number): Promise<string> {
  const token = randomToken();
  await prisma.emailToken.create({
    data: { userId, purpose, tokenHash: sha256(token), expiresAt: new Date(Date.now() + hours * 3_600_000) },
  });
  return token;
}

async function consumeEmailToken(token: string, purpose: TokenPurpose) {
  const record = await prisma.emailToken.findUnique({ where: { tokenHash: sha256(token) }, include: { user: true } });
  if (!record || record.purpose !== purpose || record.usedAt || record.expiresAt < new Date()) {
    throw new AuthError('INVALID_OR_EXPIRED_TOKEN', 400);
  }
  // updateMany con usedAt: null evita que dos pedidos simultáneos usen el mismo token.
  const { count } = await prisma.emailToken.updateMany({ where: { id: record.id, usedAt: null }, data: { usedAt: new Date() } });
  if (count === 0) throw new AuthError('INVALID_OR_EXPIRED_TOKEN', 400);
  return record.user;
}

const link = (path: string, token: string) => `${env.WEB_ORIGIN}${path}?token=${encodeURIComponent(token)}`;

// ───────────────────────────── Google ─────────────────────────────

export interface GoogleProfile {
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string;
}

export async function completeGoogleLogin(profile: GoogleProfile): Promise<User> {
  if (!profile.emailVerified) throw new AuthError('EMAIL_NOT_VERIFIED', 401);
  const email = normalizeEmail(profile.email);

  const identity = await prisma.authIdentity.findUnique({
    where: { provider_providerSubject: { provider: 'GOOGLE', providerSubject: profile.sub } },
  });

  let userId: string;
  if (identity) {
    userId = identity.userId;
  } else {
    const existing = await prisma.user.findUnique({ where: { email } });
    const user = existing ?? (await prisma.user.create({ data: { email, name: profile.name || email, emailVerifiedAt: new Date() } }));
    await prisma.authIdentity.create({
      data: { userId: user.id, provider: 'GOOGLE', providerSubject: profile.sub, verifiedAt: new Date() },
    });
    userId = user.id;
  }
  const user = await applyLoginEffects(userId, email);
  if (!user.isActive) throw new AuthError('ACCOUNT_DISABLED', 403);
  return user;
}

// ──────────────────────── Email y contraseña ────────────────────────

/** Siempre responde igual (sin revelar si el email existe); el resultado llega por email. */
export async function register(input: { email: string; password: string; name: string }): Promise<void> {
  assertPassword(input.password);
  const email = normalizeEmail(input.email);

  let user = await prisma.user.findUnique({ where: { email } });
  const identity = user
    ? await prisma.authIdentity.findUnique({ where: { provider_providerSubject: { provider: 'PASSWORD', providerSubject: email } } })
    : null;

  if (identity?.verifiedAt) {
    await sendEmail({
      to: email,
      subject: 'Ya tenés una cuenta',
      text: `Alguien intentó crear una cuenta con este email, pero ya existe. Si olvidaste tu contraseña, recuperala desde ${env.WEB_ORIGIN}/recuperar`,
    });
    return;
  }

  const passwordHash = await hashPassword(input.password);
  if (!user) user = await prisma.user.create({ data: { email, name: input.name.trim() || email } });
  if (identity) {
    // Registro pendiente: se reemplaza la contraseña; solo quien controla el email puede activarla.
    await prisma.authIdentity.update({ where: { id: identity.id }, data: { passwordHash } });
  } else {
    await prisma.authIdentity.create({ data: { userId: user.id, provider: 'PASSWORD', providerSubject: email, passwordHash } });
  }

  const token = await issueEmailToken(user.id, 'VERIFY_EMAIL', VERIFY_HOURS);
  await sendEmail({
    to: email,
    subject: 'Confirmá tu email',
    text: `Para activar tu cuenta entrá a este enlace (vence en ${VERIFY_HOURS} h):\n${link('/verificar', token)}`,
  });
}

export async function verifyEmail(token: string): Promise<User> {
  const user = await consumeEmailToken(token, 'VERIFY_EMAIL');
  await prisma.authIdentity.updateMany({
    where: { userId: user.id, provider: 'PASSWORD', verifiedAt: null },
    data: { verifiedAt: new Date() },
  });
  return applyLoginEffects(user.id, user.email!);
}

/** identifier = email o nombre de usuario de recepción. */
export async function loginWithPassword(identifier: string, password: string): Promise<User> {
  const subject = identifier.includes('@') ? normalizeEmail(identifier) : identifier.trim().toLowerCase();
  const identity = await prisma.authIdentity.findUnique({
    where: { provider_providerSubject: { provider: 'PASSWORD', providerSubject: subject } },
    include: { user: true },
  });

  const ok = await verifyPassword(password, identity?.passwordHash ?? (await DUMMY_HASH));
  if (!identity || !ok) throw new AuthError('INVALID_CREDENTIALS', 401);
  if (!identity.verifiedAt) throw new AuthError('EMAIL_NOT_VERIFIED', 403);
  if (!identity.user.isActive) throw new AuthError('ACCOUNT_DISABLED', 403);

  return identity.user.email ? applyLoginEffects(identity.userId, identity.user.email) : identity.user;
}

export async function requestPasswordReset(rawEmail: string): Promise<void> {
  const email = normalizeEmail(rawEmail);
  const identity = await prisma.authIdentity.findUnique({
    where: { provider_providerSubject: { provider: 'PASSWORD', providerSubject: email } },
  });
  if (!identity) return; // misma respuesta exista o no la cuenta
  const token = await issueEmailToken(identity.userId, 'RESET_PASSWORD', RESET_HOURS);
  await sendEmail({
    to: email,
    subject: 'Restablecé tu contraseña',
    text: `Para elegir una contraseña nueva entrá a este enlace (vence en ${RESET_HOURS} h):\n${link('/restablecer', token)}\n\nSi no lo pediste, ignorá este email.`,
  });
}

export async function resetPassword(token: string, password: string): Promise<User> {
  assertPassword(password);
  const user = await consumeEmailToken(token, 'RESET_PASSWORD');
  // Quien recibe el email demuestra que controla la casilla: la identidad queda verificada.
  await prisma.authIdentity.updateMany({
    where: { userId: user.id, provider: 'PASSWORD' },
    data: { passwordHash: await hashPassword(password), verifiedAt: new Date() },
  });
  await endAllSessions(user.id);
  return applyLoginEffects(user.id, user.email!);
}
