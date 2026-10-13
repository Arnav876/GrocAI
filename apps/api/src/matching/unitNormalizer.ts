export interface NormalizedQuantity {
  value: number;
  baseUnit: "ml" | "g" | "pcs" | "pack" | "unknown";
  rawUnit: string;
}

export function parseAndNormalizeQuantity(packSizeStr: string): NormalizedQuantity {
  if (!packSizeStr) {
    return { value: 1, baseUnit: "unknown", rawUnit: "" };
  }

  const clean = packSizeStr.trim().toLowerCase();

  // Volume: Litres / Millilitres
  const volumeRegex = /^(\d+(?:\.\d+)?)\s*(l|litre|litres|liter|liters|ltr|ltrs|ml)$/i;
  const volMatch = clean.match(volumeRegex);
  if (volMatch) {
    const num = parseFloat(volMatch[1]);
    const u = volMatch[2].toLowerCase();
    if (u === "ml") {
      return { value: num, baseUnit: "ml", rawUnit: u };
    }
    return { value: Math.round(num * 1000), baseUnit: "ml", rawUnit: u };
  }

  // Weight: Kilograms / Grams
  const weightRegex = /^(\d+(?:\.\d+)?)\s*(kg|kgs|kilo|kilos|kilogram|kilograms|g|gm|gms|grams|gram)$/i;
  const wtMatch = clean.match(weightRegex);
  if (wtMatch) {
    const num = parseFloat(wtMatch[1]);
    const u = wtMatch[2].toLowerCase();
    if (u === "g" || u === "gm" || u === "gms" || u === "gram" || u === "grams") {
      return { value: num, baseUnit: "g", rawUnit: u };
    }
    return { value: Math.round(num * 1000), baseUnit: "g", rawUnit: u };
  }

  // Count / Pieces
  const countRegex = /^(\d+(?:\.\d+)?)\s*(pcs|pc|pieces|piece|eggs|bananas|apples|oranges|units)$/i;
  const countMatch = clean.match(countRegex);
  if (countMatch) {
    return {
      value: parseFloat(countMatch[1]),
      baseUnit: "pcs",
      rawUnit: countMatch[2].toLowerCase(),
    };
  }

  // Dozen
  const dozenRegex = /^(\d+(?:\.\d+)?)\s*(dozen|dozens)$/i;
  const dozenMatch = clean.match(dozenRegex);
  if (dozenMatch) {
    return {
      value: Math.round(parseFloat(dozenMatch[1]) * 12),
      baseUnit: "pcs",
      rawUnit: "dozen",
    };
  }

  // Pack
  const packRegex = /^(\d+(?:\.\d+)?)\s*(pack|packs|packet|packets|pouch|pouches|can|cans|bottle|bottles)$/i;
  const packMatch = clean.match(packRegex);
  if (packMatch) {
    return {
      value: parseFloat(packMatch[1]),
      baseUnit: "pack",
      rawUnit: packMatch[2].toLowerCase(),
    };
  }

  // Fallback single number or unknown
  const numOnlyMatch = clean.match(/^(\d+(?:\.\d+)?)$/);
  if (numOnlyMatch) {
    return { value: parseFloat(numOnlyMatch[1]), baseUnit: "pcs", rawUnit: "pcs" };
  }

  return { value: 1, baseUnit: "unknown", rawUnit: clean };
}

export function areQuantitiesCompatible(sizeA: string, sizeB: string, tolerance: number = 0.05): boolean {
  const normA = parseAndNormalizeQuantity(sizeA);
  const normB = parseAndNormalizeQuantity(sizeB);

  if (normA.baseUnit === "unknown" || normB.baseUnit === "unknown") {
    return false;
  }

  if (normA.baseUnit !== normB.baseUnit) {
    return false;
  }

  const diff = Math.abs(normA.value - normB.value);
  const max = Math.max(normA.value, normB.value);
  return max > 0 && diff / max <= tolerance;
}
