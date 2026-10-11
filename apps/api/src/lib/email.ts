import { env } from '../env';

/** Normalización usada para vincular la ficha: minúsculas, sin espacios; en gmail.com sin puntos ni sufijo +algo. */
export function normalizeEmail(email: string): string {
  const [local, domain] = email.trim().toLowerCase().split('@');
  if (domain === 'gmail.com' || domain === 'googlemail.com') {
    return `${local.split('+')[0].replaceAll('.', '')}@gmail.com`;
  }
  return `${local}@${domain}`;
}

export interface OutgoingEmail {
  to: string;
  subject: string;
  text: string;
}

/** En desarrollo y tests los emails quedan acá (y en la consola) en lugar de enviarse. */
export const devOutbox: OutgoingEmail[] = [];

export async function sendEmail(mail: OutgoingEmail): Promise<void> {
  if (!env.EMAIL_API_KEY) {
    devOutbox.push(mail);
    if (env.NODE_ENV !== 'test') console.log(`\n[email de desarrollo] Para: ${mail.to}\nAsunto: ${mail.subject}\n${mail.text}\n`);
    return;
  }
  // Resend: https://resend.com/docs/api-reference/emails/send-email
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.EMAIL_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: env.EMAIL_FROM, to: mail.to, subject: mail.subject, text: mail.text }),
  });
  if (!res.ok) throw new Error(`Error enviando email (${res.status}): ${await res.text()}`);
}
