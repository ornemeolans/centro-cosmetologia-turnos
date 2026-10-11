import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { verifyMercadoPagoSignature, verifyMetaSignature } from './signatures';

describe('verifyMercadoPagoSignature', () => {
  const secret = 'secreto-de-prueba';
  const sign = (manifest: string) => createHmac('sha256', secret).update(manifest).digest('hex');

  it('acepta una firma válida', () => {
    const v1 = sign('id:123456;request-id:req-1;ts:1700000000;');
    expect(verifyMercadoPagoSignature({
      xSignature: `ts=1700000000,v1=${v1}`, xRequestId: 'req-1', dataId: '123456', secret,
    })).toBe(true);
  });

  it('rechaza una firma alterada o sin secreto', () => {
    const v1 = sign('id:123456;request-id:req-1;ts:1700000000;');
    expect(verifyMercadoPagoSignature({
      xSignature: `ts=1700000000,v1=${v1}`, xRequestId: 'req-1', dataId: '999', secret,
    })).toBe(false);
    expect(verifyMercadoPagoSignature({
      xSignature: `ts=1700000000,v1=${v1}`, xRequestId: 'req-1', dataId: '123456', secret: '',
    })).toBe(false);
  });
});

describe('verifyMetaSignature', () => {
  it('valida el HMAC del cuerpo crudo', () => {
    const body = Buffer.from('{"entry":[]}');
    const header = `sha256=${createHmac('sha256', 'app-secret').update(body).digest('hex')}`;
    expect(verifyMetaSignature(body, header, 'app-secret')).toBe(true);
    expect(verifyMetaSignature(Buffer.from('{}'), header, 'app-secret')).toBe(false);
  });
});
