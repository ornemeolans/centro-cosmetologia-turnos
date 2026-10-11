import { describe, expect, it } from 'vitest';
import { applyCredit, totalDeposit } from './deposit';

describe('seña', () => {
  it('suma el % de cada tratamiento del combo, en centavos', () => {
    expect(totalDeposit([
      { priceCents: 3_000_000, depositPercent: 30 },
      { priceCents: 1_550_000, depositPercent: 20 },
    ])).toBe(900_000 + 310_000);
  });

  it('el saldo a favor descuenta hasta cubrir la seña', () => {
    expect(applyCredit(500_000, 200_000)).toEqual({ creditUsed: 200_000, toPay: 300_000 });
    expect(applyCredit(500_000, 800_000)).toEqual({ creditUsed: 500_000, toPay: 0 });
  });
});
