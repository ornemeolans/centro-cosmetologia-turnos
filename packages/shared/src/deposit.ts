/** Montos siempre en centavos (enteros). */
export interface DepositItem {
  priceCents: number;
  /** 0–100, fijado por la profesional en professional_treatments.deposit_percent. */
  depositPercent: number;
}

export function itemDeposit(item: DepositItem): number {
  if (item.depositPercent < 0 || item.depositPercent > 100) throw new Error('deposit_percent fuera de rango');
  return Math.round((item.priceCents * item.depositPercent) / 100);
}

export function totalDeposit(items: DepositItem[]): number {
  return items.reduce((sum, item) => sum + itemDeposit(item), 0);
}

/** El saldo a favor solo se usa con la misma profesional (el dinero está en su cuenta de Mercado Pago). */
export function applyCredit(depositCents: number, availableCreditCents: number) {
  const creditUsed = Math.min(depositCents, Math.max(0, availableCreditCents));
  return { creditUsed, toPay: depositCents - creditUsed };
}
