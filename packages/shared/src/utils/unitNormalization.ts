export type CanonicalDimension = 'VOLUME' | 'WEIGHT' | 'COUNT' | 'UNKNOWN';
export type CanonicalReferenceUnit = '1L' | '1kg' | '1pc' | 'unit';

export interface NormalizedQuantityResult {
  dimension: CanonicalDimension;
  amountInBaseUnits: number;
  referenceUnit: CanonicalReferenceUnit;
  pricePerReferenceUnitPaise: number;
  multipackCount: number;
}

export function parseAndNormalizeQuantity(
  rawQuantity: string,
  pricePaise: number
): NormalizedQuantityResult {
  if (typeof pricePaise !== 'number' || !Number.isInteger(pricePaise) || pricePaise < 0) {
    throw new Error(
      `Financial invariant violation: pricePaise must be a non-negative integer, received: ${pricePaise}`
    );
  }

  let text = rawQuantity.trim().toLowerCase();
  let multipackCount = 1;

  // 1. Check for multiplier prefix, e.g. "2 x 500 ml" or "2x500ml" or "3 * 100 g"
  const multiMatch = text.match(/^(\d+(?:\.\d+)?)\s*(?:x|\*)\s*(.+)$/i);
  if (multiMatch && multiMatch[1] && multiMatch[2]) {
    multipackCount = parseFloat(multiMatch[1]);
    text = multiMatch[2].trim();
  }

  // 2. Check for parenthesized sub-unit, e.g. "1 pack (400g)" or "pack of 2 (500 ml)"
  const parenMatch = text.match(/\(([^)]+)\)/);
  if (parenMatch && parenMatch[1]) {
    // If outer specifies pack of N
    const outerPackMatch = text.match(/(?:pack(?:\s+of)?|combo(?:\s+of)?)\s*(\d+)/i);
    if (outerPackMatch && outerPackMatch[1] && multipackCount === 1) {
      multipackCount = parseFloat(outerPackMatch[1]);
    }
    text = parenMatch[1].trim();
  }

  // 3. Match Count expressions
  if (text.includes('half dozen')) {
    const totalPcs = 6 * multipackCount;
    return {
      dimension: 'COUNT',
      amountInBaseUnits: totalPcs,
      referenceUnit: '1pc',
      pricePerReferenceUnitPaise: totalPcs > 0 ? Math.round(pricePaise / totalPcs) : pricePaise,
      multipackCount,
    };
  }

  const dozenMatch = text.match(/^(\d+(?:\.\d+)?)\s*dozen/i);
  if (dozenMatch && dozenMatch[1]) {
    const dozens = parseFloat(dozenMatch[1]);
    const totalPcs = Math.round(dozens * 12 * multipackCount);
    return {
      dimension: 'COUNT',
      amountInBaseUnits: totalPcs,
      referenceUnit: '1pc',
      pricePerReferenceUnitPaise: totalPcs > 0 ? Math.round(pricePaise / totalPcs) : pricePaise,
      multipackCount,
    };
  }

  const countMatch = text.match(/^(\d+(?:\.\d+)?)\s*(?:pcs|pieces|piece|pc|units|unit|eggs|pouches|sachets|packs|pack)\b/i);
  if (countMatch && countMatch[1]) {
    const count = parseFloat(countMatch[1]);
    const totalPcs = Math.round(count * multipackCount);
    return {
      dimension: 'COUNT',
      amountInBaseUnits: totalPcs,
      referenceUnit: '1pc',
      pricePerReferenceUnitPaise: totalPcs > 0 ? Math.round(pricePaise / totalPcs) : pricePaise,
      multipackCount,
    };
  }

  // 4. Match Volume expressions
  // Millilitres: ml, millilitre, millilitres, milli litre
  const mlMatch = text.match(/^(\d+(?:\.\d+)?)\s*(?:ml|millilitre|millilitres|milli\s*litre)\b/i);
  if (mlMatch && mlMatch[1]) {
    const ml = parseFloat(mlMatch[1]);
    const totalMl = ml * multipackCount;
    const pricePerLitre = totalMl > 0 ? Math.round((pricePaise * 1000) / totalMl) : pricePaise;
    return {
      dimension: 'VOLUME',
      amountInBaseUnits: totalMl,
      referenceUnit: '1L',
      pricePerReferenceUnitPaise: pricePerLitre,
      multipackCount,
    };
  }

  // Litres: l, litre, litres, ltr, ltrs
  const litreMatch = text.match(/^(\d+(?:\.\d+)?)\s*(?:l|litre|litres|ltr|ltrs)\b/i);
  if (litreMatch && litreMatch[1]) {
    const litres = parseFloat(litreMatch[1]);
    const totalMl = litres * 1000 * multipackCount;
    const pricePerLitre = totalMl > 0 ? Math.round((pricePaise * 1000) / totalMl) : pricePaise;
    return {
      dimension: 'VOLUME',
      amountInBaseUnits: totalMl,
      referenceUnit: '1L',
      pricePerReferenceUnitPaise: pricePerLitre,
      multipackCount,
    };
  }

  // 5. Match Weight expressions
  // Kilograms: kg, kilogram, kilograms, kgs
  const kgMatch = text.match(/^(\d+(?:\.\d+)?)\s*(?:kg|kilogram|kilograms|kgs)\b/i);
  if (kgMatch && kgMatch[1]) {
    const kg = parseFloat(kgMatch[1]);
    const totalG = kg * 1000 * multipackCount;
    const pricePerKg = totalG > 0 ? Math.round((pricePaise * 1000) / totalG) : pricePaise;
    return {
      dimension: 'WEIGHT',
      amountInBaseUnits: totalG,
      referenceUnit: '1kg',
      pricePerReferenceUnitPaise: pricePerKg,
      multipackCount,
    };
  }

  // Grams: g, gm, gms, gram, grams
  const gMatch = text.match(/^(\d+(?:\.\d+)?)\s*(?:g|gm|gms|gram|grams)\b/i);
  if (gMatch && gMatch[1]) {
    const g = parseFloat(gMatch[1]);
    const totalG = g * multipackCount;
    const pricePerKg = totalG > 0 ? Math.round((pricePaise * 1000) / totalG) : pricePaise;
    return {
      dimension: 'WEIGHT',
      amountInBaseUnits: totalG,
      referenceUnit: '1kg',
      pricePerReferenceUnitPaise: pricePerKg,
      multipackCount,
    };
  }

  // Fallback: UNKNOWN
  return {
    dimension: 'UNKNOWN',
    amountInBaseUnits: 1 * multipackCount,
    referenceUnit: 'unit',
    pricePerReferenceUnitPaise: pricePaise,
    multipackCount,
  };
}

