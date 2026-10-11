export class ApiError extends Error {
  constructor(public status: number, public code: string, public body: Record<string, unknown> = {}) {
    super(code);
  }
}

/** Cliente mínimo: la sesión viaja en una cookie httpOnly (nunca tokens en localStorage). */
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/v1${path}`, {
    credentials: 'include',
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body.error ?? 'UNKNOWN', body);
  }
  return res.json() as Promise<T>;
}

export const send = <T = { ok: true }>(path: string, method: 'POST' | 'PUT' | 'PATCH' | 'DELETE', body?: unknown) =>
  api<T>(path, { method, body: body === undefined ? undefined : JSON.stringify(body) });

export const CENTER_WHATSAPP = import.meta.env.VITE_CENTER_WHATSAPP ?? '5491100000000';
