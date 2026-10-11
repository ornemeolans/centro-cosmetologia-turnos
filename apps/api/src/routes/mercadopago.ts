import { Router } from 'express';
import { requireRole } from '../auth/session';
import { prisma } from '../db';
import { env } from '../env';
import { wrap } from '../http';
import { randomToken } from '../lib/crypto';
import { mp } from '../lib/mercadopago';
import { saveTokens } from '../services/payments';
import { myProfessional } from '../services/staff';

/** Conexión de la cuenta de Mercado Pago de cada profesional (OAuth, modelo Marketplace). */
export const mercadopagoRouter = Router();

const STATE_COOKIE = 'mp_oauth';

mercadopagoRouter.get('/staff/me/mercadopago/connect', requireRole('PROFESSIONAL', 'OWNER'), wrap(async (req, res) => {
  if (!env.MP_CLIENT_ID || !env.MP_CLIENT_SECRET) return res.status(501).json({ error: 'MP_NOT_CONFIGURED' });
  const professional = await myProfessional(req.user!);
  const state = randomToken(16);
  res.cookie(STATE_COOKIE, JSON.stringify({ state, professionalId: professional.id }), {
    httpOnly: true, signed: true, sameSite: 'lax', secure: env.NODE_ENV === 'production', maxAge: 10 * 60_000, path: '/api/v1/oauth/mercadopago',
  });
  res.redirect(mp.authorizeUrl(state));
}));

mercadopagoRouter.get('/oauth/mercadopago/callback', requireRole('PROFESSIONAL', 'OWNER'), wrap(async (req, res) => {
  const back = (result: string) => res.redirect(`${env.WEB_ORIGIN}/configuracion?mercadopago=${result}`);
  const saved = req.signedCookies?.[STATE_COOKIE];
  res.clearCookie(STATE_COOKIE, { path: '/api/v1/oauth/mercadopago' });
  if (!saved || typeof req.query.code !== 'string') return back('error');
  const { state, professionalId } = JSON.parse(saved) as { state: string; professionalId: string };
  const professional = await myProfessional(req.user!);
  if (req.query.state !== state || professional.id !== professionalId) return back('error');

  try {
    await saveTokens(professional.id, await mp.exchangeCode(req.query.code));
    return back('ok');
  } catch (err) {
    console.error('OAuth Mercado Pago', err);
    return back('error');
  }
}));

mercadopagoRouter.delete('/staff/me/mercadopago', requireRole('PROFESSIONAL', 'OWNER'), wrap(async (req, res) => {
  const professional = await myProfessional(req.user!);
  await prisma.professional.update({
    where: { id: professional.id },
    data: { mpAccessTokenEnc: null, mpRefreshTokenEnc: null, mpTokenExpiresAt: null, mpUserId: null },
  });
  res.json({ ok: true });
}));
