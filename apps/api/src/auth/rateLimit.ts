/**
 * Límite simple en memoria (una sola instancia de API en el plan gratuito).
 * Si se escala a varias instancias, mover a una tabla o a Redis.
 */
export class RateLimiter {
  private hits = new Map<string, number[]>();

  constructor(private max: number, private windowMs: number) {}

  /** Registra un intento y devuelve false si la clave superó el límite. */
  attempt(key: string): boolean {
    const now = Date.now();
    if (this.hits.size > 10_000) this.prune(now);
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    recent.push(now);
    this.hits.set(key, recent);
    return recent.length <= this.max;
  }

  /** Borra las claves sin intentos recientes para que el mapa no crezca sin límite. */
  private prune(now: number) {
    for (const [k, times] of this.hits) if (times.every((t) => now - t >= this.windowMs)) this.hits.delete(k);
  }

  reset(key: string) {
    this.hits.delete(key);
  }

  clear() {
    this.hits.clear();
  }
}

/** 5 intentos de login cada 15 minutos por cuenta (frena adivinar una contraseña). */
export const loginLimiter = new RateLimiter(5, 15 * 60_000);
/**
 * Por IP el límite es más alto: en el centro recepción y profesionales comparten la misma IP pública.
 * Frena a quien prueba muchas cuentas distintas desde un mismo lugar.
 */
export const loginIpLimiter = new RateLimiter(50, 15 * 60_000);
/** Emails de registro, verificación y recuperación: 5 por hora por dirección. */
export const emailLimiter = new RateLimiter(5, 60 * 60_000);
/** Registros y pedidos de recuperación desde una misma IP: 10 por hora. */
export const signupIpLimiter = new RateLimiter(10, 60 * 60_000);
/**
 * Tope global de emails de cuenta (verificación y recuperación) por hora, para que nadie agote
 * la cuota diaria del Gmail del centro, que también usan las confirmaciones de turnos.
 */
export const accountEmailLimiter = new RateLimiter(60, 60 * 60_000);
