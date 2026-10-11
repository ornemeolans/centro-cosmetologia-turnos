import { env } from '../env';

/**
 * Cliente mínimo de la API de Mercado Pago. Se exporta como objeto para poder reemplazarlo en tests.
 * Docs: https://www.mercadopago.com.ar/developers/es/reference
 */
const API = 'https://api.mercadopago.com';
const redirectUri = () => env.MP_REDIRECT_URI || `${env.WEB_ORIGIN}/api/v1/oauth/mercadopago/callback`;

export interface MpTokens {
  access_token: string;
  refresh_token: string;
  user_id: number;
  expires_in: number;
}

export interface MpPayment {
  id: number;
  status: 'approved' | 'pending' | 'in_process' | 'rejected' | 'cancelled' | 'refunded' | 'charged_back' | string;
  transaction_amount: number;
  currency_id: string;
  external_reference: string | null;
}

async function call<T>(path: string, init: RequestInit & { token?: string; idempotencyKey?: string } = {}): Promise<T> {
  const { token, idempotencyKey, ...rest } = init;
  const res = await fetch(`${API}${path}`, {
    ...rest,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(idempotencyKey ? { 'X-Idempotency-Key': idempotencyKey } : {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Mercado Pago ${path} → ${res.status}: ${JSON.stringify(body)}`);
  return body as T;
}

export const mp = {
  authorizeUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: env.MP_CLIENT_ID, response_type: 'code', platform_id: 'mp', state, redirect_uri: redirectUri(),
    });
    return `https://auth.mercadopago.com.ar/authorization?${params}`;
  },

  exchangeCode(code: string): Promise<MpTokens> {
    return call('/oauth/token', {
      method: 'POST',
      body: JSON.stringify({
        client_id: env.MP_CLIENT_ID, client_secret: env.MP_CLIENT_SECRET, grant_type: 'authorization_code', code, redirect_uri: redirectUri(),
      }),
    });
  },

  refresh(refreshToken: string): Promise<MpTokens> {
    return call('/oauth/token', {
      method: 'POST',
      body: JSON.stringify({ client_id: env.MP_CLIENT_ID, client_secret: env.MP_CLIENT_SECRET, grant_type: 'refresh_token', refresh_token: refreshToken }),
    });
  },

  createPreference(token: string, body: object): Promise<{ id: string; init_point: string }> {
    return call('/checkout/preferences', { method: 'POST', token, body: JSON.stringify(body) });
  },

  getPayment(token: string, id: string): Promise<MpPayment> {
    return call(`/v1/payments/${encodeURIComponent(id)}`, { token });
  },

  searchPayments(token: string, externalReference: string): Promise<{ results: MpPayment[] }> {
    return call(`/v1/payments/search?external_reference=${encodeURIComponent(externalReference)}&sort=date_created&criteria=desc`, { token });
  },

  refund(token: string, paymentId: string): Promise<unknown> {
    return call(`/v1/payments/${encodeURIComponent(paymentId)}/refunds`, { method: 'POST', token, idempotencyKey: `refund-${paymentId}`, body: '{}' });
  },
};
