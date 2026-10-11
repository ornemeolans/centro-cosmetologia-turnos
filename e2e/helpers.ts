import { expect, type APIRequestContext, type Page } from '@playwright/test';

const API = 'http://localhost:3199';
const ZONE = 'America/Argentina/Buenos_Aires';
export const PASSWORD = 'una-clave-segura';

/** Lee el último enlace con token enviado a ese email (outbox de desarrollo de la API E2E). */
export async function lastEmailLink(request: APIRequestContext, to: string): Promise<string> {
  let link: string | undefined;
  await expect.poll(async () => {
    const res = await request.get(`${API}/api/v1/dev/outbox`, { params: { to } });
    const { emails } = (await res.json()) as { emails: { text: string }[] };
    link = emails.at(-1)?.text.match(/https?:\/\/\S+token=\S+/)?.[0];
    return link;
  }).toBeTruthy();
  return link!;
}

/** Crea una cuenta con email y contraseña y la confirma con el enlace del email. */
export async function registerAndVerify(page: Page, request: APIRequestContext, email: string, password = PASSWORD) {
  await page.goto('/registro');
  await page.getByLabel('Nombre y apellido').fill('Lucía Gómez');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Contraseña').fill(password);
  await page.getByRole('button', { name: 'Crear cuenta' }).click();
  await expect(page.getByRole('heading', { name: 'Revisá tu email' })).toBeVisible();

  await page.goto(await lastEmailLink(request, email));
}

export async function login(page: Page, identifier: string, password = PASSWORD) {
  await page.goto('/ingresar');
  await page.getByLabel('Email o usuario').fill(identifier);
  await page.getByLabel('Contraseña').fill(password);
  await page.getByRole('button', { name: 'Ingresar con email' }).click();
}

/** Fecha 'yyyy-MM-dd' del n-ésimo día hábil (lunes a viernes) desde hoy, en la zona del centro. */
export function businessDayIso(n: number): string {
  const weekday = new Intl.DateTimeFormat('en-US', { timeZone: ZONE, weekday: 'short' });
  let d = new Date();
  let count = 0;
  while (count < n) {
    d = new Date(d.getTime() + 86_400_000);
    if (!['Sat', 'Sun'].includes(weekday.format(d))) count++;
  }
  return new Intl.DateTimeFormat('en-CA', { timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}
