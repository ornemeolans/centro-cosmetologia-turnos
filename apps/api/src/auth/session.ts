import type { Role, User } from '@prisma/client';
import type { NextFunction, Request, Response } from 'express';
import { prisma } from '../db';
import { env } from '../env';
import { randomToken, sha256 } from '../lib/crypto';

export const SESSION_COOKIE = 'sid';
const SESSION_DAYS = 30;

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: User;
      sessionId?: string;
    }
  }
}

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_DAYS * 86_400_000,
  };
}

export async function startSession(req: Request, res: Response, userId: string): Promise<void> {
  const token = randomToken();
  await prisma.session.create({
    data: {
      id: sha256(token),
      userId,
      expiresAt: new Date(Date.now() + SESSION_DAYS * 86_400_000),
      userAgent: req.header('user-agent')?.slice(0, 255),
    },
  });
  res.cookie(SESSION_COOKIE, token, cookieOptions());
}

export async function endSession(req: Request, res: Response): Promise<void> {
  if (req.sessionId) await prisma.session.deleteMany({ where: { id: req.sessionId } });
  res.clearCookie(SESSION_COOKIE, { path: '/' });
}

/** Cierra todas las sesiones de un usuario (cambio de contraseña, acceso revocado). */
export async function endAllSessions(userId: string): Promise<void> {
  await prisma.session.deleteMany({ where: { userId } });
}

/** Carga req.user desde la cookie. Renueva la sesión (ventana deslizante) como máximo una vez por día. */
export async function loadUser(req: Request, _res: Response, next: NextFunction) {
  try {
    const token = req.cookies?.[SESSION_COOKIE];
    if (!token) return next();
    const id = sha256(token);
    const session = await prisma.session.findUnique({ where: { id }, include: { user: true } });
    if (!session || session.expiresAt < new Date() || !session.user.isActive) return next();
    req.user = session.user;
    req.sessionId = id;
    if (Date.now() - session.lastSeenAt.getTime() > 86_400_000) {
      await prisma.session.update({
        where: { id },
        data: { lastSeenAt: new Date(), expiresAt: new Date(Date.now() + SESSION_DAYS * 86_400_000) },
      });
    }
    next();
  } catch (err) {
    next(err);
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.user) return res.status(401).json({ error: 'UNAUTHENTICATED' });
  next();
}

export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: 'UNAUTHENTICATED' });
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'FORBIDDEN' });
    next();
  };
}
