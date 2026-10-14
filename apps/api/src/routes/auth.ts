import type { Role } from '@prisma/client';
import { Router, type NextFunction, type Request, type Response } from 'express';
import { CodeChallengeMethod, OAuth2Client } from 'google-auth-library';
import { z } from 'zod';
import { accountEmailLimiter, emailLimiter, loginIpLimiter, loginLimiter, signupIpLimiter } from '../auth/rateLimit';
import {
  AuthError,
  completeGoogleLogin,
  loginWithPassword,
  MIN_PASSWORD_LENGTH,
  register,
  requestPasswordReset,
  resetPassword,
  verifyEmail,
} from '../auth/service';
import { endSession, startSession } from '../auth/session';
import { env } from '../env';
import { randomToken } from '../lib/crypto';
import { normalizeEmail } from '../lib/email';

export { normalizeEmail };
export const authRouter = Router();

const GOOGLE_COOKIE = 'g_oauth';
const googleRedirectUri = () => env.GOOGLE_REDIRECT_URI || `${env.WEB_ORIGIN}/api/v1/auth/google/callback`;
const googleClient = () => new OAuth2Client(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET, googleRedirectUri());

/** Adónde va cada rol después de entrar. */
export function homeFor(role: Role): string {
  return role === 'CLIENT' ? '/mis-turnos' : '/agenda';
}

const wrap = (fn: (req: Request, res: Response) => Promise<unknown>) => (req: Request, res: Response, next: NextFunction) =>
  fn(req, res).catch(next);

// ───────────────────────────── Google ─────────────────────────────

authRouter.get('/google/start', wrap(async (_req, res) => {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) return res.status(501).json({ error: 'GOOGLE_NOT_CONFIGURED' });
  const client = googleClient();
  const { codeVerifier, codeChallenge } = await client.generateCodeVerifierAsync();
  const state = randomToken(16);
  res.cookie(GOOGLE_COOKIE, JSON.stringify({ state, codeVerifier }), {
    httpOnly: true, signed: true, sameSite: 'lax', secure: env.NODE_ENV === 'production',
    path: '/api/v1/auth/google', maxAge: 10 * 60_000,
  });
  const url = client.generateAuthUrl({
    scope: ['openid', 'email', 'profile'],
    state,
    code_challenge: codeChallenge,
    code_challenge_method: CodeChallengeMethod.S256,
    prompt: 'select_account',
  });
  return res.redirect(url);
}));

authRouter.get('/google/callback', wrap(async (req, res) => {
  const fail = (code: string) => res.redirect(`${env.WEB_ORIGIN}/ingresar?error=${code}`);
  const saved = req.signedCookies?.[GOOGLE_COOKIE];
  res.clearCookie(GOOGLE_COOKIE, { path: '/api/v1/auth/google' });
  if (req.query.error) return fail('GOOGLE_CANCELLED');
  if (!saved || typeof req.query.code !== 'string') return fail('GOOGLE_STATE');
  const { state, codeVerifier } = JSON.parse(saved) as { state: string; codeVerifier: string };
  if (req.query.state !== state) return fail('GOOGLE_STATE');

  try {
    const client = googleClient();
    const { tokens } = await client.getToken({ code: req.query.code, codeVerifier });
    const ticket = await client.verifyIdToken({ idToken: tokens.id_token!, audience: env.GOOGLE_CLIENT_ID });
    const p = ticket.getPayload();
    if (!p?.sub || !p.email) return fail('GOOGLE_PROFILE');
    const user = await completeGoogleLogin({ sub: p.sub, email: p.email, emailVerified: Boolean(p.email_verified), name: p.name ?? '' });
    await startSession(req, res, user.id);
    return res.redirect(`${env.WEB_ORIGIN}${homeFor(user.role)}`);
  } catch (err) {
    if (err instanceof AuthError) return fail(err.code);
    throw err;
  }
}));

// ──────────────────────── Email y contraseña ────────────────────────

const password = z.string().min(MIN_PASSWORD_LENGTH).max(200);

authRouter.post('/register', wrap(async (req, res) => {
  const body = z.object({ email: z.string().email(), password, name: z.string().min(1).max(100) }).parse(req.body);
  const allowed = signupIpLimiter.attempt(`ip:${req.ip}`) && emailLimiter.attempt(normalizeEmail(body.email))
    && accountEmailLimiter.attempt('global');
  if (!allowed) return res.status(429).json({ error: 'TOO_MANY_REQUESTS' });
  await register(body);
  return res.status(202).json({ ok: true });
}));

authRouter.post('/verify-email', wrap(async (req, res) => {
  const body = z.object({ token: z.string().min(10).max(200), password: z.string().min(1).max(200) }).parse(req.body);
  const user = await verifyEmail(body.token, body.password);
  await startSession(req, res, user.id);
  return res.json({ redirectTo: homeFor(user.role) });
}));

authRouter.post('/login', wrap(async (req, res) => {
  const body = z.object({ identifier: z.string().min(3).max(200), password: z.string().min(1).max(200) }).parse(req.body);
  // Misma forma canónica que usa el login para buscar la cuenta: cada variante del email cuenta como la misma cuenta.
  const id = body.identifier.trim().toLowerCase();
  const accountKey = `acct:${id.includes('@') ? normalizeEmail(id) : id}`;
  const ipKey = `ip:${req.ip}`;
  const allowed = loginIpLimiter.attempt(ipKey) && loginLimiter.attempt(accountKey);
  if (!allowed) return res.status(429).json({ error: 'TOO_MANY_ATTEMPTS' });

  const user = await loginWithPassword(body.identifier, body.password);
  loginLimiter.reset(accountKey);
  await startSession(req, res, user.id);
  return res.json({ redirectTo: homeFor(user.role) });
}));

authRouter.post('/logout', wrap(async (req, res) => {
  await endSession(req, res);
  return res.json({ ok: true });
}));

authRouter.post('/password/forgot', wrap(async (req, res) => {
  const { email } = z.object({ email: z.string().email() }).parse(req.body);
  const allowed = signupIpLimiter.attempt(`ip:${req.ip}`) && emailLimiter.attempt(normalizeEmail(email))
    && accountEmailLimiter.attempt('global');
  if (allowed) await requestPasswordReset(email);
  return res.status(202).json({ ok: true });
}));

authRouter.post('/password/reset', wrap(async (req, res) => {
  const body = z.object({ token: z.string().min(10), password }).parse(req.body);
  const user = await resetPassword(body.token, body.password);
  await startSession(req, res, user.id);
  return res.json({ redirectTo: homeFor(user.role) });
}));
