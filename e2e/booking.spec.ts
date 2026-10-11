import { expect, test } from '@playwright/test';
import { businessDayIso, login, registerAndVerify } from './helpers';

test('la página de inicio ofrece ingresar y pedir el primer turno por WhatsApp', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Tu próximo turno/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /Primera vez/ })).toHaveAttribute('href', /^https:\/\/wa\.me\/\d+\?text=/);

  await page.getByRole('main').getByRole('link', { name: 'Ingresar' }).click();
  await expect(page.getByRole('link', { name: 'Continuar con Google' })).toHaveAttribute('href', '/api/v1/auth/google/start');
});

test('reservar exige iniciar sesión', async ({ page }) => {
  await page.goto('/reservar');
  await expect(page).toHaveURL(/\/ingresar$/);
});

test('clienta: reserva con seña, confirmación, calendario y cancelación con saldo a favor', async ({ page, request }, testInfo) => {
  await registerAndVerify(page, request, `lucia-${testInfo.project.name}@example.com`);
  await expect(page).toHaveURL(/\/mis-turnos$/);

  // Sin teléfono no hay WhatsApp: se pide antes de reservar.
  await page.getByLabel('Celular').fill('+5491123456789');
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByLabel('Celular')).toBeHidden();

  await page.getByRole('main').getByRole('link', { name: 'Reservar turno' }).click();
  await page.getByRole('button', { name: /Ana Pérez/ }).click();
  await page.getByRole('checkbox', { name: /Limpieza facial/ }).check();
  // El peeling se puede combinar con la limpieza: queda habilitado.
  await expect(page.getByRole('checkbox', { name: /Peeling químico/ })).toBeEnabled();

  // Cada proyecto usa un día distinto: corren en paralelo contra la misma agenda.
  await page.getByLabel('Otro día').fill(businessDayIso(testInfo.project.name === 'mobile' ? 6 : 5));
  const slots = page.getByRole('list', { name: 'Horarios disponibles' }).getByRole('button');
  await expect(slots.first()).toHaveText('09:00');
  await slots.first().click();

  await expect(page.getByText('A pagar ahora')).toBeVisible();
  await page.getByRole('button', { name: 'Pagar seña con Mercado Pago' }).click();

  // Checkout simulado → vuelta a la web → confirmado.
  await expect(page.getByRole('heading', { name: '¡Turno confirmado!' })).toBeVisible();
  await page.getByRole('link', { name: /Ver mis turnos/ }).click();

  const card = page.getByRole('main').locator('div', { has: page.getByText('Limpieza facial · Ana Pérez') }).first();
  await expect(card.getByText('Confirmado')).toBeVisible();
  await expect(card.getByRole('link', { name: 'Google Calendar' })).toHaveAttribute('href', /calendar\.google\.com/);

  await card.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('queda como saldo a favor');
  await page.getByRole('dialog').getByRole('button', { name: 'Cancelar turno' }).click();
  await expect(page.getByRole('heading', { name: 'Saldo a favor' })).toBeVisible();
  await expect(page.getByText(/9\.000/).first()).toBeVisible();
});

test('clienta sin ficha puede pedir que corrijan su email', async ({ page, request }, testInfo) => {
  await registerAndVerify(page, request, `otra-${testInfo.project.name}@example.com`);
  await expect(page.getByRole('heading', { name: 'No encontramos tu ficha' })).toBeVisible();
  await page.getByLabel('Tu cosmetóloga').selectOption({ label: 'Ana Pérez' });
  await page.getByRole('button', { name: 'Pedir que actualice mi email' }).click();
  await expect(page.getByText('Listo, le avisamos por email.')).toBeVisible();
});

test('contraseña incorrecta muestra un error claro', async ({ page }) => {
  await login(page, 'ana@centro.test', 'no-es-esta-clave');
  await expect(page.getByRole('alert')).toHaveText('El email o la contraseña no son correctos.');
});
