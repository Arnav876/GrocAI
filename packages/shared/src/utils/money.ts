import type { FeeRangePaise } from '../schemas/fees.js';

export function assertIntegerPaise(val: number, context: string = 'value'): void {
  if (typeof val !== 'number' || !Number.isInteger(val) || val < 0) {
    throw new Error(
      `Financial invariant violation: ${context} must be a non-negative integer paise, received: ${val}`
    );
  }
}

export function addPaise(a: number, b: number): number {
  assertIntegerPaise(a, 'addend a');
  assertIntegerPaise(b, 'addend b');
  return a + b;
}

export function subtractPaise(minuend: number, subtrahend: number): number {
  assertIntegerPaise(minuend, 'minuend');
  assertIntegerPaise(subtrahend, 'subtrahend');
  if (minuend < subtrahend) {
    throw new Error(
      `Financial invariant violation: subtraction cannot yield negative paise (${minuend} - ${subtrahend})`
    );
  }
  return minuend - subtrahend;
}

export function multiplyPaiseByQty(pricePaise: number, quantity: number): number {
  assertIntegerPaise(pricePaise, 'pricePaise');
  if (typeof quantity !== 'number' || !Number.isFinite(quantity) || quantity < 0) {
    throw new Error(
      `Financial invariant violation: quantity must be a non-negative finite number, received: ${quantity}`
    );
  }
  const total = Math.round(pricePaise * quantity);
  assertIntegerPaise(total, 'multiplication total');
  return total;
}

export function formatPaiseToRupees(paise: number): string {
  assertIntegerPaise(paise, 'paise');
  const rupees = paise / 100;
  return `₹${rupees.toFixed(2)}`;
}

export function addFeeRanges(...fees: FeeRangePaise[]): {
  totalMinPaise: number;
  totalMaxPaise: number;
  hasUnknownFees: boolean;
} {
  let totalMinPaise = 0;
  let totalMaxPaise = 0;
  let hasUnknownFees = false;

  for (const fee of fees) {
    assertIntegerPaise(fee.minPaise, `${fee.label} minPaise`);
    assertIntegerPaise(fee.maxPaise, `${fee.label} maxPaise`);
    totalMinPaise = addPaise(totalMinPaise, fee.minPaise);
    totalMaxPaise = addPaise(totalMaxPaise, fee.maxPaise);
    if (!fee.isKnown || fee.minPaise !== fee.maxPaise) {
      hasUnknownFees = true;
    }
  }

  return {
    totalMinPaise,
    totalMaxPaise,
    hasUnknownFees,
  };
}

