import { env } from '../env';

/** WhatsApp Cloud API (Meta). https://developers.facebook.com/docs/whatsapp/cloud-api/reference/messages */
const GRAPH = 'https://graph.facebook.com/v21.0';

export const whatsappConfigured = () => Boolean(env.WHATSAPP_PHONE_NUMBER_ID && env.WHATSAPP_TOKEN);

export class WhatsAppError extends Error {
  constructor(message: string, public permanent: boolean) {
    super(message);
  }
}

async function post(body: object): Promise<string> {
  const res = await fetch(`${GRAPH}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', ...body }),
  });
  const json = (await res.json().catch(() => ({}))) as { messages?: { id: string }[]; error?: { message: string; code: number } };
  if (!res.ok || !json.messages?.[0]) {
    // 4xx salvo límite de tasa (429 / código 130429) = error definitivo: no tiene sentido reintentar.
    const permanent = res.status >= 400 && res.status < 500 && res.status !== 429 && json.error?.code !== 130429;
    throw new WhatsAppError(json.error?.message ?? `HTTP ${res.status}`, permanent);
  }
  return json.messages[0].id;
}

const toNumber = (e164: string) => e164.replace(/^\+/, '');

/** Mensaje de plantilla aprobada. `buttons` = payloads de los botones de respuesta rápida, en orden. */
export function sendTemplate(to: string, name: string, bodyParams: string[], buttons: string[] = []) {
  return post({
    to: toNumber(to),
    type: 'template',
    template: {
      name,
      language: { code: 'es_AR' },
      components: [
        { type: 'body', parameters: bodyParams.map((text) => ({ type: 'text', text })) },
        ...buttons.map((payload, index) => ({
          type: 'button', sub_type: 'quick_reply', index: String(index), parameters: [{ type: 'payload', payload }],
        })),
      ],
    },
  });
}

/** Mensaje libre con botones: solo dentro de las 24 h desde el último mensaje de la clienta. */
export function sendButtons(to: string, text: string, buttons: { id: string; title: string }[]) {
  return post({
    to: toNumber(to),
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text },
      action: { buttons: buttons.map((b) => ({ type: 'reply', reply: { id: b.id, title: b.title } })) },
    },
  });
}

export function sendText(to: string, text: string) {
  return post({ to: toNumber(to), type: 'text', text: { body: text } });
}
