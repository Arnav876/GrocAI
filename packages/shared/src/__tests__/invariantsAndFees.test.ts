import { describe, it, expect } from 'vitest';
import { NullCartAdapter, UnsupportedCapabilityError } from '../adapters/NullCartAdapter.js';
import { addPaise, subtractPaise, multiplyPaiseByQty, assertIntegerPaise, addFeeRanges, formatPaiseToRupees } from '../utils/money.js';
import type { FeeRangePaise } from '../schemas/fees.js';

describe('NullCartAdapter', () => {
  const adapter = new NullCartAdapter('blinkit');

  it('reports createCart: false in capabilities', () => {
    const caps = adapter.getCapabilities();
    expect(caps.createCart).toBe(false);
    expect(caps.automatedCheckout).toBe(false);
    expect(caps.search).toBe(true);
    expect(caps.livePrice).toBe(true);
    expect(caps.searchDeepLink).toBe(true);
    expect(caps.checklistHandoff).toBe(true);
  });

  it('supportsCartCreation() returns false', () => {
    expect(adapter.supportsCartCreation()).toBe(false);
  });

  it('createCart() throws UnsupportedCapabilityError', () => {
    expect(() => adapter.createCart()).toThrow(UnsupportedCapabilityError);
  });

  it('error message includes credential/OTP/payment warning', () => {
    try {
      adapter.createCart();
    } catch (e) {
      expect((e as Error).message).toContain('credentials');
      expect((e as Error).message).toContain('OTP');
      expect((e as Error).message).toContain('payment');
    }
  });
});

describe('Integer paise arithmetic', () => {
  it('assertIntegerPaise throws on float', () => {
    expect(() => assertIntegerPaise(49.5, 'test')).toThrow();
  });

  it('assertIntegerPaise throws on NaN', () => {
    expect(() => assertIntegerPaise(NaN, 'test')).toThrow();
  });

  it('assertIntegerPaise throws on negative', () => {
    expect(() => assertIntegerPaise(-1, 'test')).toThrow();
  });

  it('addPaise works correctly', () => {
    expect(addPaise(100, 200)).toBe(300);
  });

  it('addPaise throws on float input', () => {
    expect(() => addPaise(1.5, 200)).toThrow();
  });

  it('subtractPaise works correctly', () => {
    expect(subtractPaise(300, 100)).toBe(200);
  });

  it('subtractPaise throws when result would be negative', () => {
    expect(() => subtractPaise(100, 300)).toThrow();
  });

  it('multiplyPaiseByQty works correctly', () => {
    expect(multiplyPaiseByQty(500, 3)).toBe(1500);
  });

  it('formatPaiseToRupees formats correctly', () => {
    expect(formatPaiseToRupees(5000)).toBe('₹50.00');
    expect(formatPaiseToRupees(0)).toBe('₹0.00');
    expect(formatPaiseToRupees(199)).toBe('₹1.99');
  });
});

describe('addFeeRanges preserves unknown fees', () => {
  it('sums ranges and detects hasUnknownFees when any component is unknown', () => {
    const deliveryFee: FeeRangePaise = { minPaise: 2500, maxPaise: 2500, isKnown: true, label: 'Delivery Fee' };
    const handlingFee: FeeRangePaise = { minPaise: 500, maxPaise: 1500, isKnown: false, label: 'Handling Fee', provenance: 'BigBasket dynamic range' };
    const platformFee: FeeRangePaise = { minPaise: 200, maxPaise: 200, isKnown: true, label: 'Platform Fee' };

    const result = addFeeRanges(deliveryFee, handlingFee, platformFee);

    expect(result.totalMinPaise).toBe(3200);
    expect(result.totalMaxPaise).toBe(4200);
    expect(result.hasUnknownFees).toBe(true);
  });

  it('returns hasUnknownFees false when all fees are known', () => {
    const deliveryFee: FeeRangePaise = { minPaise: 2500, maxPaise: 2500, isKnown: true, label: 'Delivery Fee' };
    const handlingFee: FeeRangePaise = { minPaise: 600, maxPaise: 600, isKnown: true, label: 'Handling Fee' };

    const result = addFeeRanges(deliveryFee, handlingFee);

    expect(result.totalMinPaise).toBe(3100);
    expect(result.totalMaxPaise).toBe(3100);
    expect(result.hasUnknownFees).toBe(false);
  });

  it('never coerces unknown fee range to 0', () => {
    const unknownFee: FeeRangePaise = { minPaise: 500, maxPaise: 1500, isKnown: false, label: 'Dynamic Fee' };

    const result = addFeeRanges(unknownFee);

    // The unknown fee must NOT be coerced to 0
    expect(result.totalMinPaise).toBe(500);
    expect(result.totalMaxPaise).toBe(1500);
    expect(result.totalMinPaise).toBeGreaterThan(0);
    expect(result.hasUnknownFees).toBe(true);
  });
});
