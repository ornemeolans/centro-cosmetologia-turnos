import type { NextFunction, Request, RequestHandler, Response } from 'express';

/** Error con código estable para el frontend (los mensajes en castellano viven en la web). */
export class HttpError extends Error {
  constructor(public status: number, public code: string, public details?: Record<string, unknown>) {
    super(code);
  }
}

/** Envuelve handlers async para que los errores lleguen al middleware de errores. */
export const wrap =
  (fn: (req: Request, res: Response) => Promise<unknown>): RequestHandler =>
  (req: Request, res: Response, next: NextFunction) => {
    fn(req, res).catch(next);
  };

export const notFound = (what = 'NOT_FOUND') => new HttpError(404, what);
export const forbidden = (what = 'FORBIDDEN') => new HttpError(403, what);

/** Error de exclusión de Postgres (23P01): dos turnos activos de la misma profesional se solapan. */
export function isOverlapError(err: unknown): boolean {
  const text = String((err as { message?: string })?.message ?? '');
  return text.includes('no_overlap') || text.includes('23P01');
}
