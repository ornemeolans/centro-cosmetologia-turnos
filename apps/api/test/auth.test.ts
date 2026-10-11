import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { completeGoogleLogin } from '../src/auth/service';
import { prisma } from '../src/db';
import { devOutbox } from '../src/lib/email';
import { createProfessionalWithRecord, lastTokenFor, resetDb } from './helpers';

const app = createApp();
const ORIGIN = 'http://localhost:5173';
const post = (agent: request.Agent | ReturnType<typeof request>, path: string, body: object) =>
  (agent as request.Agent).post(`/api/v1${path}`).set('Origin', ORIGIN).send(body);

async function registerAndVerify(email: string, password = 'una-clave-segura') {
  const agent = request.agent(app);
  expect((await post(agent, '/auth/register', { email, password, name: 'Lucía Gómez' })).status).toBe(202);
  const res = await post(agent, '/auth/verify-email', { token: lastTokenFor(email) });
  expect(res.status).toBe(200);
  return agent;
}

beforeEach(resetDb);

describe('registro con email y contraseña', () => {
  it('no deja entrar hasta verificar el email', async () => {
    const agent = request.agent(app);
    await post(agent, '/auth/register', { email: 'lucia@empresa.com', password: 'una-clave-segura', name: 'Lucía' });

    const login = await post(agent, '/auth/login', { identifier: 'lucia@empresa.com', password: 'una-clave-segura' });
    expect(login.status).toBe(403);
    expect(login.body.error).toBe('EMAIL_NOT_VERIFIED');

    await post(agent, '/auth/verify-email', { token: lastTokenFor('lucia@empresa.com') });
    const me = await agent.get('/api/v1/me');
    expect(me.status).toBe(200);
    expect(me.body.user).toMatchObject({ email: 'lucia@empresa.com', role: 'CLIENT' });
  });

  it('un token de verificación se usa una sola vez', async () => {
    const agent = request.agent(app);
    await post(agent, '/auth/register', { email: 'lucia@empresa.com', password: 'una-clave-segura', name: 'Lucía' });
    const token = lastTokenFor('lucia@empresa.com');
    expect((await post(agent, '/auth/verify-email', { token })).status).toBe(200);
    expect((await post(agent, '/auth/verify-email', { token })).status).toBe(400);
  });

  it('rechaza contraseñas cortas', async () => {
    const res = await post(request(app), '/auth/register', { email: 'a@b.com', password: 'corta', name: 'A' });
    expect(res.status).toBe(400);
  });

  it('registrarse con un email que ya tiene cuenta no revela nada y avisa por email', async () => {
    await registerAndVerify('lucia@empresa.com');
    const res = await post(request(app), '/auth/register', { email: 'lucia@empresa.com', password: 'otra-clave-larga', name: 'X' });
    expect(res.status).toBe(202);
    expect(devOutbox.at(-1)?.subject).toBe('Ya tenés una cuenta');
  });
});

describe('vinculación de la ficha por email', () => {
  it('vincula la ficha cuyo email coincide, aunque Gmail se escriba distinto', async () => {
    const { record } = await createProfessionalWithRecord('luciagomez@gmail.com');
    const agent = await registerAndVerify('Lucia.Gomez+turnos@gmail.com');

    const me = await agent.get('/api/v1/me');
    expect(me.body.record).toMatchObject({ id: record.id, status: 'ACTIVA' });
    expect(me.body.needsPhone).toBe(true);
  });

  it('sin ficha coincidente no crea ninguna y /me lo informa', async () => {
    const agent = await registerAndVerify('otra@empresa.com');
    const me = await agent.get('/api/v1/me');
    expect(me.body.record).toBeNull();
    expect(await prisma.clientRecord.count()).toBe(0);
  });

  it('una ficha ya vinculada no se reasigna a otra cuenta', async () => {
    const { record } = await createProfessionalWithRecord('luciagomez@gmail.com');
    const first = await completeGoogleLogin({ sub: 'g-1', email: 'luciagomez@gmail.com', emailVerified: true, name: 'Lucía' });
    await prisma.user.update({ where: { id: first.id }, data: { email: 'cambio@empresa.com' } });
    await completeGoogleLogin({ sub: 'g-2', email: 'luciagomez@gmail.com', emailVerified: true, name: 'Otra' });
    expect((await prisma.clientRecord.findUniqueOrThrow({ where: { id: record.id } })).userId).toBe(first.id);
  });

  it('la clienta sin ficha puede pedir a su cosmetóloga que corrija el email', async () => {
    const { professional } = await createProfessionalWithRecord('luciagomez@gmail.com');
    const agent = await registerAndVerify('lucia.trabajo@empresa.com');

    const res = await post(agent, '/me/email-change-request', { professionalId: professional.id, message: 'Soy Lucía Gómez' });
    expect(res.status).toBe(202);
    expect(devOutbox.at(-1)).toMatchObject({ to: 'ana@centro.com' });
    expect(devOutbox.at(-1)!.text).toContain('lucia.trabajo@empresa.com');
  });
});

describe('Google', () => {
  it('reutiliza la cuenta existente con el mismo email en vez de duplicarla', async () => {
    await registerAndVerify('lucia@gmail.com');
    const user = await completeGoogleLogin({ sub: 'g-123', email: 'lucia@gmail.com', emailVerified: true, name: 'Lucía' });
    expect(await prisma.user.count()).toBe(1);
    expect(await prisma.authIdentity.count({ where: { userId: user.id } })).toBe(2);
  });

  it('rechaza emails no verificados por Google', async () => {
    await expect(completeGoogleLogin({ sub: 'g-1', email: 'x@gmail.com', emailVerified: false, name: 'X' }))
      .rejects.toThrow('EMAIL_NOT_VERIFIED');
  });

  it('OWNER_EMAIL recibe el rol OWNER y su perfil de profesional', async () => {
    const user = await completeGoogleLogin({ sub: 'g-owner', email: 'duena@centro.com', emailVerified: true, name: 'Dueña' });
    expect(user.role).toBe('OWNER');
    expect(await prisma.professional.count({ where: { userId: user.id } })).toBe(1);
  });

  it('un email autorizado por la OWNER entra como RECEPTION', async () => {
    const owner = await completeGoogleLogin({ sub: 'g-owner', email: 'duena@centro.com', emailVerified: true, name: 'Dueña' });
    await prisma.staffAllowlist.create({ data: { email: 'recepcion@gmail.com', role: 'RECEPTION', createdById: owner.id } });
    const user = await completeGoogleLogin({ sub: 'g-rec', email: 'recepcion@gmail.com', emailVerified: true, name: 'Recepción' });
    expect(user.role).toBe('RECEPTION');
  });
});

describe('sesiones y seguridad', () => {
  it('contraseña incorrecta → 401, y tras 5 intentos → 429', async () => {
    await registerAndVerify('lucia@empresa.com');
    for (let i = 0; i < 5; i++) {
      expect((await post(request(app), '/auth/login', { identifier: 'lucia@empresa.com', password: 'incorrecta' })).status).toBe(401);
    }
    expect((await post(request(app), '/auth/login', { identifier: 'lucia@empresa.com', password: 'una-clave-segura' })).status).toBe(429);
  });

  it('logout invalida la sesión', async () => {
    const agent = await registerAndVerify('lucia@empresa.com');
    await post(agent, '/auth/logout', {});
    expect((await agent.get('/api/v1/me')).status).toBe(401);
  });

  it('restablecer la contraseña cierra las sesiones abiertas', async () => {
    const oldSession = await registerAndVerify('lucia@empresa.com');
    await post(request(app), '/auth/password/forgot', { email: 'lucia@empresa.com' });
    const reset = await post(request(app), '/auth/password/reset', { token: lastTokenFor('lucia@empresa.com'), password: 'clave-nueva-larga' });
    expect(reset.status).toBe(200);

    expect((await oldSession.get('/api/v1/me')).status).toBe(401);
    expect((await post(request(app), '/auth/login', { identifier: 'lucia@empresa.com', password: 'clave-nueva-larga' })).status).toBe(200);
  });

  it('pedir recuperación de un email inexistente responde igual y no envía nada', async () => {
    const res = await post(request(app), '/auth/password/forgot', { email: 'nadie@empresa.com' });
    expect(res.status).toBe(202);
    expect(devOutbox).toHaveLength(0);
  });

  it('rechaza pedidos desde otro origen', async () => {
    const res = await request(app).post('/api/v1/auth/login').set('Origin', 'https://otro-sitio.com')
      .send({ identifier: 'a@b.com', password: 'x' });
    expect(res.status).toBe(403);
  });

  it('la sesión se guarda hasheada: el token de la cookie no está en la base', async () => {
    const agent = request.agent(app);
    await post(agent, '/auth/register', { email: 'lucia@empresa.com', password: 'una-clave-segura', name: 'Lucía' });
    const res = await post(agent, '/auth/verify-email', { token: lastTokenFor('lucia@empresa.com') });
    const token = /sid=([^;]+)/.exec(res.headers['set-cookie'][0])![1];
    expect(await prisma.session.count({ where: { id: token } })).toBe(0);
    expect(await prisma.session.count()).toBe(1);
  });
});
