import { NormalizedUnitPrice } from "./types.js";
import { paiseToRupees } from "./money.js";

export interface NormalizedQuantity {
  value: number;
  baseUnit: "ml" | "g" | "pcs" | "pack" | "unknown";
  rawUnit: string;
}

/**
 * Unit alternatives ordered so that longer names win before their prefixes.
 * Used both for anchored pack sizes ("1 L") and quantities embedded in
 * marketplace-style pack descriptors ("1 pack (1 L)").
 */
const UNIT_PATTERN =
  "(ml|millilitres?|milliliters?|ltrs?|litres?|liters?|l|kgs?|kilos?|kilograms?|grams?|gms?|gm|g|pcs|pc|pieces?|units?|dozens?|eggs|bananas|apples|oranges|packs?|packets?|pouches?|pouch|cans?|bottles?|bottle)";

function quantityFromUnit(value: number, rawUnit: string): NormalizedQuantity {
  const u = rawUnit.toLowerCase();

  if (u === "ml" || u.startsWith("millilit")) {
    return { value, baseUnit: "ml", rawUnit: u };
  }
  if (/^(l|ltr|ltrs|litre|litres|liter|liters)$/.test(u)) {
    return { value: Math.round(value * 1000), baseUnit: "ml", rawUnit: u };
  }
  if (u === "g" || u === "gm" || u === "gms" || u === "gram" || u === "grams") {
    return { value, baseUnit: "g", rawUnit: u };
  }
  if (/^(kg|kgs|kilo|kilos|kilogram|kilograms)$/.test(u)) {
    return { value: Math.round(value * 1000), baseUnit: "g", rawUnit: u };
  }
  if (/^(pcs|pc|pieces?|units?|eggs|bananas|apples|oranges)$/.test(u)) {
    return { value, baseUnit: "pcs", rawUnit: u };
  }
  if (/^dozens?$/.test(u)) {
    return { value: Math.round(value * 12), baseUnit: "pcs", rawUnit: "dozen" };
  }
  if (/^(pack|packs|packet|packets|pouch|pouches|can|cans|bottle|bottles)$/.test(u)) {
    return { value, baseUnit: "pack", rawUnit: u };
  }

  return { value: 1, baseUnit: "unknown", rawUnit: u };
}

export function parseAndNormalizeQuantity(packSizeStr: string): NormalizedQuantity {
  if (!packSizeStr) {
    return { value: 1, baseUnit: "unknown", rawUnit: "" };
  }

  const clean = packSizeStr.trim().toLowerCase().replace(/×/g, "x").replace(/\s+/g, " ");

  // Fast path for plain quantities: "1 L", "500 g", "6 pcs".
  const directRegex = new RegExp(`^(\\d+(?:\\.\\d+)?)\\s*${UNIT_PATTERN}$`, "i");
  const directMatch = clean.match(directRegex);
  if (directMatch) {
    return quantityFromUnit(parseFloat(directMatch[1]), directMatch[2]);
  }

  // Multipacks. Quantity-first is common on Indian marketplaces
  // ("1 L X 12", "200 ml X 2") while count-first appears in catalogs
  // ("2 x 1 L", "6 x 100 ml").
  const multiQuantityFirst = new RegExp(
    `(\\d+(?:\\.\\d+)?)\\s*${UNIT_PATTERN}\\s*x\\s*(\\d+)`,
    "i"
  );
  const multiQuantityMatch = clean.match(multiQuantityFirst);
  if (multiQuantityMatch) {
    const count = parseInt(multiQuantityMatch[3], 10);
    const quantity = quantityFromUnit(parseFloat(multiQuantityMatch[1]) * count, multiQuantityMatch[2]);
    if (quantity.baseUnit !== "unknown") return quantity;
  }

  const multiRegex = new RegExp(
    `(\\d+)\\s*x\\s*(\\d+(?:\\.\\d+)?)\\s*${UNIT_PATTERN}`,
    "i"
  );
  const multiMatch = clean.match(multiRegex);
  if (multiMatch) {
    const count = parseInt(multiMatch[1], 10);
    const quantity = quantityFromUnit(parseFloat(multiMatch[2]) * count, multiMatch[3]);
    if (quantity.baseUnit !== "unknown") return quantity;
  }

  // "pack of 6", or "pack of 6 (500 ml)" / "pack of 6 x 500 ml".
  const packOfMatch = clean.match(/pack\s*of\s*(\d+)/);
  if (packOfMatch) {
    const count = parseInt(packOfMatch[1], 10);
    const rest = clean.replace(packOfMatch[0], " ").trim();
    const inner = parseAndNormalizeQuantity(rest);
    if (inner.baseUnit !== "unknown" && inner.baseUnit !== "pack") {
      return { ...inner, value: inner.value * count };
    }
    return { value: count, baseUnit: "pcs", rawUnit: "pack" };
  }

  // Marketplace descriptors put the real quantity in parentheses:
  // "1 pack (1 L)", "1 pack (500 ml)", "1 pack (400 g)".
  const parenthesized = clean.match(/[([{]([^)\]}]+)[)\]}]/);
  if (parenthesized) {
    const inner = parseAndNormalizeQuantity(parenthesized[1]);
    if (inner.baseUnit !== "unknown" && inner.baseUnit !== "pack") return inner;
  }

  // Quantity embedded in a longer descriptor, e.g. "500 g (Pouch)" or
  // "1 L (Tetra Pack)".
  const embeddedRegex = new RegExp(`(\\d+(?:\\.\\d+)?)\\s*${UNIT_PATTERN}`, "i");
  const embeddedMatch = clean.match(embeddedRegex);
  if (embeddedMatch) {
    return quantityFromUnit(parseFloat(embeddedMatch[1]), embeddedMatch[2]);
  }

  // Fallback single number.
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

/**
 * Calculates normalized unit price to standard comparison units:
 * - Liquid / Volume: standard unit "L" (1000 ml)
 * - Solids / Weight: standard unit "kg" (1000 g)
 * - Items / Count: standard unit "pc"
 */
export function calculateNormalizedUnitPrice(
  pricePaise: number,
  packSizeStr: string
): NormalizedUnitPrice | null {
  if (pricePaise <= 0 || !packSizeStr) return null;

  const norm = parseAndNormalizeQuantity(packSizeStr);
  if (norm.baseUnit === "unknown" || norm.value <= 0) return null;

  let standardUnit = "";
  let pricePerUnitPaise = 0;

  switch (norm.baseUnit) {
    case "ml": {
      standardUnit = "L";
      pricePerUnitPaise = Math.round((pricePaise / norm.value) * 1000);
      break;
    }
    case "g": {
      standardUnit = "kg";
      pricePerUnitPaise = Math.round((pricePaise / norm.value) * 1000);
      break;
    }
    case "pcs": {
      standardUnit = "pc";
      pricePerUnitPaise = Math.round(pricePaise / norm.value);
      break;
    }
    case "pack": {
      standardUnit = "pack";
      pricePerUnitPaise = Math.round(pricePaise / norm.value);
      break;
    }
    default:
      return null;
  }

  const pricePerUnitRupees = paiseToRupees(pricePerUnitPaise);
  const displayUnitPrice = `₹${pricePerUnitRupees.toFixed(2)} / ${standardUnit}`;

  return {
    unit: standardUnit,
    pricePerUnitPaise,
    pricePerUnitRupees,
    displayUnitPrice,
  };
}
