import { describe, it, expect } from 'vitest';
import { NormalizedObservationSchema, calculateDiscountPercentage } from '../schemas/observation.js';

// Helper to create a valid observation with all 14 fields
function makeValidObservation(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Amul Taaza Homogenised Toned Milk',
    brand: 'Amul',
    quantity: '500 ml',
    pricePaise: 2700,
    originalPricePaise: 3000,
    discountPercentage: 10,
    availabilityStatus: 'IN_STOCK' as const,
    platformId: 'blinkit' as const,
    productUrl: 'https://blinkit.com/prn/amul-taaza-toned-milk/prid/1234',
    imageUrl: 'https://cdn.blinkit.com/images/amul-taaza.jpg',
    pincode: '110001',
    observedAt: '2026-11-07T12:00:00.000Z',
    dataSource: 'seed_fixture' as const,
    verificationStatus: 'UNVERIFIED' as const,
    ...overrides,
  };
}

describe('NormalizedObservationSchema', () => {
  it('accepts a valid 14-field observation', () => {
    const result = NormalizedObservationSchema.safeParse(makeValidObservation());
    expect(result.success).toBe(true);
  });

  it('rejects float pricePaise (e.g., 4999.5)', () => {
    const result = NormalizedObservationSchema.safeParse(makeValidObservation({ pricePaise: 4999.5 }));
    expect(result.success).toBe(false);
  });

  it('rejects NaN pricePaise', () => {
    const result = NormalizedObservationSchema.safeParse(makeValidObservation({ pricePaise: NaN }));
    expect(result.success).toBe(false);
  });

  it('rejects negative pricePaise', () => {
    const result = NormalizedObservationSchema.safeParse(makeValidObservation({ pricePaise: -100 }));
    expect(result.success).toBe(false);
  });

  it('rejects originalPricePaise < pricePaise', () => {
    const result = NormalizedObservationSchema.safeParse(
      makeValidObservation({ pricePaise: 5000, originalPricePaise: 3000 })
    );
    expect(result.success).toBe(false);
  });

  it('rejects invalid Indian pincode "000001"', () => {
    const result = NormalizedObservationSchema.safeParse(makeValidObservation({ pincode: '000001' }));
    expect(result.success).toBe(false);
  });

  it('rejects 5-digit pincode "11001"', () => {
    const result = NormalizedObservationSchema.safeParse(makeValidObservation({ pincode: '11001' }));
    expect(result.success).toBe(false);
  });

  it('accepts null brand', () => {
    const result = NormalizedObservationSchema.safeParse(makeValidObservation({ brand: null }));
    expect(result.success).toBe(true);
  });

  it('accepts null imageUrl', () => {
    const result = NormalizedObservationSchema.safeParse(makeValidObservation({ imageUrl: null }));
    expect(result.success).toBe(true);
  });
});

describe('calculateDiscountPercentage', () => {
  it('returns 10 for 2700/3000', () => {
    expect(calculateDiscountPercentage(2700, 3000)).toBe(10);
  });

  it('returns 0 when prices are equal', () => {
    expect(calculateDiscountPercentage(5000, 5000)).toBe(0);
  });

  it('returns 0 when originalPricePaise is 0', () => {
    expect(calculateDiscountPercentage(0, 0)).toBe(0);
  });

  it('throws if pricePaise is float', () => {
    expect(() => calculateDiscountPercentage(49.5, 100)).toThrow();
  });

  it('throws if originalPricePaise < pricePaise', () => {
    expect(() => calculateDiscountPercentage(5000, 3000)).toThrow();
  });
});
