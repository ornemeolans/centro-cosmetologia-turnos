import { describe, expect, it } from 'vitest';
import { normalizePhone, phoneSchema } from './schemas';

describe('normalizePhone (celulares de Argentina)', () => {
  it.each([
    ['3517326453', '+5493517326453'],
    ['351 732-6453', '+5493517326453'],
    ['0351 15 732-6453', '+5493517326453'],
    ['351 15 7326453', '+5493517326453'],
    ['11 15 2345-6789', '+5491123456789'],
    ['2944 15 123456', '+5492944123456'],
    ['54 351 7326453', '+5493517326453'],
    ['+54 9 351 732 6453', '+5493517326453'],
    ['+5493517326453', '+5493517326453'],
  ])('%s → %s', (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });

  it('deja como están los números de otros países', () => {
    expect(normalizePhone('+598 99 123 456')).toBe('+59899123456');
  });

  it('rechaza números incompletos', () => {
    expect(phoneSchema.safeParse({ phoneE164: '732-6453' }).success).toBe(false);
  });
});
