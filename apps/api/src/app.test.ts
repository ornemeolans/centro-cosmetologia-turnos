import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from './app';
import { normalizeEmail } from './routes/auth';

const app = createApp();

describe('API', () => {
  it('health', async () => {
    const res = await request(app).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it('la disponibilidad exige sesión', async () => {
    const res = await request(app).get('/api/v1/availability').query({ professionalId: 'x', date: '2026-11-09', treatmentIds: 'x' });
    expect(res.status).toBe(401);
  });

  it('el webhook de Mercado Pago rechaza firmas inválidas', async () => {
    const res = await request(app).post('/api/v1/webhooks/mercadopago?data.id=1').send({});
    expect(res.status).toBe(401);
  });

  it('el tick interno exige el secreto del cron', async () => {
    expect((await request(app).post('/api/v1/internal/tick')).status).toBe(401);
  });
});

describe('normalizeEmail', () => {
  it('trata igual las variantes de una cuenta de Gmail', () => {
    expect(normalizeEmail(' Ana.Perez+turnos@Gmail.com ')).toBe('anaperez@gmail.com');
    expect(normalizeEmail('ana.perez@empresa.com.ar')).toBe('ana.perez@empresa.com.ar');
  });
});
