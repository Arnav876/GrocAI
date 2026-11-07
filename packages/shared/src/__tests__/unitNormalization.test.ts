import { describe, it, expect } from 'vitest';
import { parseAndNormalizeQuantity } from '../utils/unitNormalization.js';

describe('parseAndNormalizeQuantity', () => {
  describe('Volume normalization', () => {
    it('normalizes "250 ml" at 2500p -> 10000p per litre', () => {
      const result = parseAndNormalizeQuantity('250 ml', 2500);
      expect(result.dimension).toBe('VOLUME');
      expect(result.amountInBaseUnits).toBe(250);
      expect(result.referenceUnit).toBe('1L');
      expect(result.pricePerReferenceUnitPaise).toBe(10000); // ₹100/L
    });

    it('normalizes "500 ml" at 3300p -> 6600p per litre', () => {
      const result = parseAndNormalizeQuantity('500 ml', 3300);
      expect(result.dimension).toBe('VOLUME');
      expect(result.amountInBaseUnits).toBe(500);
      expect(result.pricePerReferenceUnitPaise).toBe(6600);
    });

    it('normalizes "1 L" at 5600p -> 5600p per litre', () => {
      const result = parseAndNormalizeQuantity('1 L', 5600);
      expect(result.dimension).toBe('VOLUME');
      expect(result.amountInBaseUnits).toBe(1000);
      expect(result.pricePerReferenceUnitPaise).toBe(5600);
    });

    it('normalizes "2 x 500 ml" at 5400p -> 5400p per litre', () => {
      const result = parseAndNormalizeQuantity('2 x 500 ml', 5400);
      expect(result.dimension).toBe('VOLUME');
      expect(result.amountInBaseUnits).toBe(1000);
      expect(result.multipackCount).toBe(2);
      expect(result.pricePerReferenceUnitPaise).toBe(5400);
    });
  });

  describe('Weight normalization', () => {
    it('normalizes "100 g" at 5700p -> 57000p per kg', () => {
      const result = parseAndNormalizeQuantity('100 g', 5700);
      expect(result.dimension).toBe('WEIGHT');
      expect(result.amountInBaseUnits).toBe(100);
      expect(result.referenceUnit).toBe('1kg');
      expect(result.pricePerReferenceUnitPaise).toBe(57000);
    });

    it('normalizes "500 g" at 5000p -> 10000p per kg', () => {
      const result = parseAndNormalizeQuantity('500 g', 5000);
      expect(result.dimension).toBe('WEIGHT');
      expect(result.pricePerReferenceUnitPaise).toBe(10000);
    });

    it('normalizes "1 kg" at 8000p -> 8000p per kg', () => {
      const result = parseAndNormalizeQuantity('1 kg', 8000);
      expect(result.dimension).toBe('WEIGHT');
      expect(result.amountInBaseUnits).toBe(1000);
      expect(result.pricePerReferenceUnitPaise).toBe(8000);
    });

    it('normalizes "5 kg" at 35000p -> 7000p per kg', () => {
      const result = parseAndNormalizeQuantity('5 kg', 35000);
      expect(result.dimension).toBe('WEIGHT');
      expect(result.amountInBaseUnits).toBe(5000);
      expect(result.pricePerReferenceUnitPaise).toBe(7000);
    });
  });

  describe('Count normalization', () => {
    it('normalizes "6 pcs" at 5400p -> 900p per piece', () => {
      const result = parseAndNormalizeQuantity('6 pcs', 5400);
      expect(result.dimension).toBe('COUNT');
      expect(result.amountInBaseUnits).toBe(6);
      expect(result.referenceUnit).toBe('1pc');
      expect(result.pricePerReferenceUnitPaise).toBe(900);
    });

    it('normalizes "12 pcs" at 10800p -> 900p per piece', () => {
      const result = parseAndNormalizeQuantity('12 pcs', 10800);
      expect(result.dimension).toBe('COUNT');
      expect(result.amountInBaseUnits).toBe(12);
      expect(result.pricePerReferenceUnitPaise).toBe(900);
    });

    it('normalizes "1 dozen" at 10800p -> 900p per piece', () => {
      const result = parseAndNormalizeQuantity('1 dozen', 10800);
      expect(result.dimension).toBe('COUNT');
      expect(result.amountInBaseUnits).toBe(12);
      expect(result.pricePerReferenceUnitPaise).toBe(900);
    });

    it('normalizes "half dozen" at 5400p -> 900p per piece', () => {
      const result = parseAndNormalizeQuantity('half dozen', 5400);
      expect(result.dimension).toBe('COUNT');
      expect(result.amountInBaseUnits).toBe(6);
      expect(result.pricePerReferenceUnitPaise).toBe(900);
    });
  });

  describe('Apples-to-apples comparison', () => {
    it('proves two 500ml at ₹27 each are cheaper per litre than one 1L at ₹56', () => {
      // Two 500ml packs at ₹27 each = ₹54 total for 1L
      const twoPacks = parseAndNormalizeQuantity('2 x 500 ml', 5400); // 5400 paise = ₹54
      // One 1L pack at ₹56
      const onePack = parseAndNormalizeQuantity('1 L', 5600); // 5600 paise = ₹56

      expect(twoPacks.pricePerReferenceUnitPaise).toBe(5400); // ₹54/L
      expect(onePack.pricePerReferenceUnitPaise).toBe(5600);  // ₹56/L
      expect(twoPacks.pricePerReferenceUnitPaise).toBeLessThan(onePack.pricePerReferenceUnitPaise);
    });
  });

  describe('Pack with parenthesized quantity', () => {
    it('normalizes "1 pack (400g)" correctly', () => {
      const result = parseAndNormalizeQuantity('1 pack (400g)', 4500);
      expect(result.dimension).toBe('WEIGHT');
      expect(result.amountInBaseUnits).toBe(400);
      expect(result.referenceUnit).toBe('1kg');
      expect(result.pricePerReferenceUnitPaise).toBe(11250); // 4500 * 1000 / 400
    });
  });

  describe('Edge cases', () => {
    it('throws on float pricePaise', () => {
      expect(() => parseAndNormalizeQuantity('500 ml', 49.5)).toThrow();
    });

    it('normalizes "1.5 L" correctly', () => {
      const result = parseAndNormalizeQuantity('1.5 L', 7500);
      expect(result.dimension).toBe('VOLUME');
      expect(result.amountInBaseUnits).toBe(1500);
      expect(result.pricePerReferenceUnitPaise).toBe(5000);
    });
  });
});
