import { expect, test } from '@playwright/test';
import { businessDayIso, login } from './helpers';

test('recepción: perfil de primera vez y turno destacado en la agenda', async ({ page }, testInfo) => {
  await login(page, 'recepcion');
  await expect(page).toHaveURL(/\/agenda$/);

  const email = `sofia-${testInfo.project.name}@example.com`;
  await page.getByRole('button', { name: 'Primera vez' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Nombre').fill('Sofía');
  await dialog.getByLabel('Apellido').fill(testInfo.project.name === 'mobile' ? 'Ruiz' : 'Díaz');
  await dialog.getByLabel('Email').fill(email);
  await dialog.getByLabel('Celular (WhatsApp)').fill('+5491155554444');
  await dialog.getByLabel('Profesional').selectOption({ label: 'Ana Pérez' });
  await dialog.getByRole('button', { name: 'Crear y elegir horario' }).click();

  const booking = page.getByRole('dialog', { name: 'Nuevo turno' });
  await booking.getByLabel('Profesional').selectOption({ label: 'Ana Pérez' });
  await booking.getByRole('checkbox', { name: /Limpieza facial/ }).check();
  const day = businessDayIso(testInfo.project.name === 'mobile' ? 3 : 2);
  await booking.getByLabel('Otro día').fill(day);
  await booking.getByRole('list', { name: 'Horarios disponibles' }).getByRole('button').first().click();
  await booking.getByRole('button', { name: 'Agendar' }).click();
  await expect(booking).toBeHidden();

  await page.getByLabel('Fecha').fill(day);
  const lastName = testInfo.project.name === 'mobile' ? 'Ruiz' : 'Díaz';
  const item = page.getByRole('listitem').filter({ hasText: `Sofía ${lastName}` });
  await expect(item.getByText('Primera vez')).toBeVisible();
});

test('profesional: abre la ficha y agrega una entrada a la historia', async ({ page }, testInfo) => {
  await login(page, 'ana@centro.test');
  await page.getByRole('link', { name: 'Fichas' }).click();
  await page.getByLabel('Buscar').fill(`lucia-${testInfo.project.name}`);
  await page.getByRole('link', { name: /Gómez, Lucía/ }).click();
  await expect(page.getByRole('heading', { name: 'Lucía Gómez' })).toBeVisible();

  await page.getByRole('tab', { name: 'Historia' }).click();
  const note = `Piel deshidratada, ${testInfo.project.name}`;
  await page.getByLabel(/Nueva entrada/).fill(note);
  await page.getByRole('button', { name: 'Agregar a la historia' }).click();
  await expect(page.getByText(note)).toBeVisible();
});

test('dueña: invita una profesional', async ({ page }, testInfo) => {
  await login(page, 'duena@centro.test');
  await page.getByRole('link', { name: 'Administración' }).click();
  const email = `bea-${testInfo.project.name}@centro.test`;
  await page.getByLabel('Nombre').first().fill(`Bea ${testInfo.project.name}`);
  await page.getByLabel('Email').first().fill(email);
  await page.getByRole('button', { name: 'Invitar' }).click();
  const row = page.getByRole('listitem').filter({ hasText: email });
  await expect(row.getByText('Invitada')).toBeVisible();
});
