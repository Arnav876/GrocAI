import { z } from "zod";

export const AIProviderTypeSchema = z.enum(["none", "groq", "openai", "gemini"]);
export type AIProviderType = z.infer<typeof AIProviderTypeSchema>;

export const NormalizedDimensionSchema = z.enum(["VOLUME", "WEIGHT", "COUNT", "UNKNOWN"]);
export type NormalizedDimension = z.infer<typeof NormalizedDimensionSchema>;

export const ParsedGroceryItemSchema = z.object({
  rawSegment: z.string().default(""),
  queryName: z.string().min(1, "queryName cannot be empty"),
  brandPreference: z.string().nullable().default(null),
  variantPreference: z.string().nullable().default(null),
  quantity: z.number().int().positive().default(1),
  unitSize: z.string().nullable().default(null),
  normalizedDimension: NormalizedDimensionSchema.default("UNKNOWN"),
  allowSubstitutions: z.boolean().default(true),
  // Backward compatibility fields
  query: z.string().optional(),
  unit: z.string().optional(),
  requiredVariant: z.string().optional(),
});

export type ParsedGroceryItem = z.infer<typeof ParsedGroceryItemSchema>;

export interface NLParseResult {
  items: ParsedGroceryItem[];
  rawText: string;
  providerUsed: AIProviderType | "deterministic" | "deterministic_fallback";
  unparsedPhrases: string[];
  warnings?: string[];
}

export interface INLListParser {
  parseGroceryList(
    rawText: string,
    options?: { providerOverride?: AIProviderType }
  ): Promise<NLParseResult>;
  parseDeterministic(rawText: string): NLParseResult;
  parseText?(rawText: string): Promise<any>;
}

export const STAPLE_BRANDS = [
  "Amul",
  "Mother Dairy",
  "Aashirvaad",
  "Fortune",
  "Tata Sampann",
  "Tata",
  "India Gate",
  "Britannia",
  "Farm Made",
  "Nandini",
  "Harvest Gold",
  "Country Delight",
  "Madhur",
  "Daawat",
  "Saffola",
  "Dabur",
  "Catch",
  "Everest",
  "MDH",
  "Patanjali",
  "Borges",
  "Nescafe",
  "Bru",
] as const;

export const STAPLE_VARIANTS = [
  "Taaza",
  "Gold",
  "Sharbati",
  "Superior MP",
  "MP",
  "Classic",
  "Whole Wheat",
  "Brown",
  "White",
  "Salted",
  "Unsalted",
  "Free Range",
  "Cow",
  "Buffalo",
  "Toned",
  "Double Toned",
  "Full Cream",
  "Diet",
  "Refined",
  "Mustard",
  "Sunflower",
] as const;

/**
 * Prohibited monetary / financial keys that are strictly barred from AI input understanding.
 * The AI Price Firewall actively removes these fields to prevent hallucinated prices
 * from leaking into downstream deterministic optimization.
 */
export const PROHIBITED_FINANCIAL_KEYS = new Set([
  "price",
  "pricepaise",
  "price_paise",
  "cost",
  "fee",
  "fees",
  "estimatedfee",
  "estimated_fee",
  "discount",
  "mrp",
  "total",
  "estimate",
  "estimatedtotal",
  "estimated_total",
  "unitprice",
  "unitpricepaise",
  "unit_price",
  "unit_price_paise",
  "totalprice",
  "totalpricepaise",
  "total_price",
  "total_price_paise",
  "rate",
  "subtotal",
  "subtotalpaise",
  "subtotal_paise",
]);

/**
 * Sanitizes external AI / LLM output.
 * Strips any prohibited price, fee, or monetary keys before validating against ParsedGroceryItemSchema.
 * Throws an Error if the payload is malformed, triggering the deterministic fallback.
 */
export function sanitizeExternalAIOutput(rawPayload: unknown): ParsedGroceryItem[] {
  if (!rawPayload) {
    throw new Error("AI payload is null or empty");
  }

  let data = rawPayload;

  // Handle JSON string input (including markdown-fenced ```json ... ```)
  if (typeof data === "string") {
    const trimmed = data.trim();
    const cleanJson = trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    try {
      data = JSON.parse(cleanJson);
    } catch (err: any) {
      throw new Error(`Failed to parse AI JSON response: ${err.message}`);
    }
  }

  // Handle wrapper object { items: [...] } or { result: [...] } or { data: [...] }
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const record = data as Record<string, unknown>;
    if (Array.isArray(record.items)) {
      data = record.items;
    } else if (Array.isArray(record.result)) {
      data = record.result;
    } else if (Array.isArray(record.data)) {
      data = record.data;
    } else {
      throw new Error(
        "Invalid AI payload: expected an array or an object containing an 'items' array"
      );
    }
  }

  if (!Array.isArray(data)) {
    throw new Error("Invalid AI payload: expected an array of parsed items");
  }

  const sanitizedList: ParsedGroceryItem[] = [];

  for (const item of data) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error("Invalid item format in AI payload: expected an object");
    }

    const cleanedObj: Record<string, unknown> = {};

    for (const [key, val] of Object.entries(item as Record<string, unknown>)) {
      const normalizedKey = key.toLowerCase().replace(/[-_]/g, "");
      // HARD AI PRICE FIREWALL: Strip all prohibited financial/pricing keys
      if (PROHIBITED_FINANCIAL_KEYS.has(normalizedKey)) {
        continue;
      }
      cleanedObj[key] = val;
    }

    // Ensure rawSegment fallback if missing
    if (!cleanedObj.rawSegment) {
      cleanedObj.rawSegment = String(cleanedObj.queryName || cleanedObj.query || "");
    }
    // Ensure queryName fallback if query was provided instead
    if (!cleanedObj.queryName && cleanedObj.query) {
      cleanedObj.queryName = String(cleanedObj.query);
    }

    // Populate backward compatibility fields
    if (!cleanedObj.query && cleanedObj.queryName) {
      cleanedObj.query = cleanedObj.queryName;
    }
    if (!cleanedObj.unit && cleanedObj.unitSize) {
      cleanedObj.unit = cleanedObj.unitSize;
    }
    if (!cleanedObj.requiredVariant && cleanedObj.variantPreference) {
      cleanedObj.requiredVariant = cleanedObj.variantPreference;
    }

    // Parse and validate strictly via Zod
    const validated = ParsedGroceryItemSchema.parse(cleanedObj);
    sanitizedList.push(validated);
  }

  return sanitizedList;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Deterministically parses a single grocery note segment.
 * Handles Indian & English quantity idioms, brands, variants, pack sizes, and substitution flags.
 */
export function parseSegmentDeterministic(segment: string): ParsedGroceryItem | null {
  const originalSegment = segment.trim();
  let text = originalSegment.replace(/^(?:[-*•]|\d+[.)])\s*/, "").trim();
  if (!text) return null;

  // 1. Substitution Modifier Detection
  let allowSubstitutions = true;
  const strictSubRegex =
    /\((?:no\s+substitutes?|no\s+substitutions?|strictly\s+no\s+substitutes?|strictly|only|exact|no\s+subs?)\)|\b(?:no\s+substitutes?|no\s+substitutions?|strictly\s+no\s+substitutes?|strictly|only|exact|no\s+subs?)\b/gi;
  const permissiveSubRegex =
    /\((?:any\s+brand|or\s+similar|substitutes?\s+ok|substitutions?\s+ok)\)|\b(?:any\s+brand|or\s+similar|substitutes?\s+ok|substitutions?\s+ok)\b/gi;

  if (strictSubRegex.test(text)) {
    allowSubstitutions = false;
    text = text.replace(strictSubRegex, " ").trim();
  } else if (permissiveSubRegex.test(text)) {
    allowSubstitutions = true;
    text = text.replace(permissiveSubRegex, " ").trim();
  }

  // 2. Dozen Conversion Detection
  let quantity = 1;
  let unitSize: string | null = null;
  let normalizedDimension: NormalizedDimension = "UNKNOWN";

  const halfDozenRegex = /\b(?:half\s+a\s+dozen|half\s+dozen)\b/i;
  const multipleDozenRegex = /\b(\d+)\s+dozens?\b/i;
  const singleDozenRegex = /\b(?:1\s+dozen|a\s+dozen|dozen)\b/i;

  if (halfDozenRegex.test(text)) {
    quantity = 1;
    unitSize = "6 pcs";
    normalizedDimension = "COUNT";
    text = text.replace(halfDozenRegex, " ").trim();
  } else {
    const multiDozenMatch = text.match(multipleDozenRegex);
    if (multiDozenMatch) {
      const dozenCount = parseInt(multiDozenMatch[1], 10);
      quantity = dozenCount;
      unitSize = dozenCount === 2 ? "24 pcs" : `${dozenCount * 12} pcs`;
      normalizedDimension = "COUNT";
      text = text.replace(multipleDozenRegex, " ").trim();
    } else if (singleDozenRegex.test(text)) {
      quantity = 1;
      unitSize = "12 pcs";
      normalizedDimension = "COUNT";
      text = text.replace(singleDozenRegex, " ").trim();
    }
  }

  // 3. Multipack vs Volume/Weight Detection (e.g. "2 packets of 500 ml", "2 x 500ml", "2x500 ml")
  if (normalizedDimension === "UNKNOWN") {
    const multipackRegex =
      /^(\d+)\s*(?:x|packets?\s+of|packs?\s+of|bottles?\s+of)\s*(\d+(?:\.\d+)?)\s*(l|ltr|ltrs|litres?|liters?|ml|kg|kgs|kilos?|g|gms?|gm|grams?|pcs|pieces?)\b/i;
    const multiMatch = text.match(multipackRegex);
    if (multiMatch) {
      quantity = parseInt(multiMatch[1], 10);
      const val = multiMatch[2];
      const rawU = multiMatch[3].toLowerCase();

      if (/^(l|ltr|ltrs|litres?|liters?)$/.test(rawU)) {
        unitSize = `${val} L`;
        normalizedDimension = "VOLUME";
      } else if (/^ml$/.test(rawU)) {
        unitSize = `${val} ml`;
        normalizedDimension = "VOLUME";
      } else if (/^(kg|kgs|kilos?)$/.test(rawU)) {
        unitSize = `${val} kg`;
        normalizedDimension = "WEIGHT";
      } else if (/^(g|gms?|gm|grams?)$/.test(rawU)) {
        unitSize = `${val} g`;
        normalizedDimension = "WEIGHT";
      } else {
        unitSize = `${val} pcs`;
        normalizedDimension = "COUNT";
      }

      text = text.replace(multipackRegex, " ").trim();
    }
  }

  // 4. Standard Quantity + Unit at start of segment (e.g. "2 litres milk", "500 gm butter", "5 kg atta", "1 packet bread")
  if (normalizedDimension === "UNKNOWN") {
    const standardUnitRegex =
      /^(\d+(?:\.\d+)?)\s*(litres?|liter|liters?|ltrs?|l|ml|kgs?|kilos?|kg|grams?|gms?|gm|g|pack|packets?|pcs|pieces?|bottles?|cans?)\b(?:\s+of\b)?/i;
    const stdMatch = text.match(standardUnitRegex);
    if (stdMatch) {
      const parsedNum = parseFloat(stdMatch[1]);
      const rawU = stdMatch[2].toLowerCase();

      if (/^(litres?|liter|liters?|ltrs?|l)$/.test(rawU)) {
        // "2 litres milk" -> quantity: 2, unitSize: "1 L"
        quantity = Math.max(1, Math.round(parsedNum));
        unitSize = "1 L";
        normalizedDimension = "VOLUME";
      } else if (/^ml$/.test(rawU)) {
        quantity = 1;
        unitSize = `${parsedNum} ml`;
        normalizedDimension = "VOLUME";
      } else if (/^(kgs?|kilos?|kg)$/.test(rawU)) {
        quantity = 1;
        unitSize = `${parsedNum} kg`;
        normalizedDimension = "WEIGHT";
      } else if (/^(grams?|gms?|gm|g)$/.test(rawU)) {
        quantity = 1;
        unitSize = `${parsedNum} g`;
        normalizedDimension = "WEIGHT";
      } else if (/^(pack|packets?)$/.test(rawU)) {
        quantity = Math.max(1, Math.round(parsedNum));
        unitSize = "1 pack";
        normalizedDimension = "COUNT";
      } else {
        quantity = Math.max(1, Math.round(parsedNum));
        unitSize = `${quantity} pcs`;
        normalizedDimension = "COUNT";
      }

      text = text.replace(standardUnitRegex, " ").trim();
    }
  }

  // 5. Quantity count without explicit unit (e.g. "12 eggs", "2 bread")
  if (normalizedDimension === "UNKNOWN") {
    const countPrefixRegex = /^(\d+)\s+(.+)$/;
    const countMatch = text.match(countPrefixRegex);
    if (countMatch) {
      quantity = parseInt(countMatch[1], 10);
      text = countMatch[2].trim();
      normalizedDimension = "COUNT";
      if (/eggs?\b/i.test(text)) {
        unitSize = `${quantity} pcs`;
      }
    }
  }

  // 5b. Trailing or inline quantity + unit (e.g. "sugar 1 kg", "atta 5kg", "oil 2 ltr")
  if (normalizedDimension === "UNKNOWN") {
    const trailingUnitRegex =
      /\b(\d+(?:\.\d+)?)\s*(litres?|liter|liters?|ltrs?|l|ml|kgs?|kilos?|kg|grams?|gms?|gm|g|pack|packets?|pcs|pieces?|bottles?|cans?)\b/i;
    const trailMatch = text.match(trailingUnitRegex);
    if (trailMatch) {
      const parsedNum = parseFloat(trailMatch[1]);
      const rawU = trailMatch[2].toLowerCase();

      if (/^(litres?|liter|liters?|ltrs?|l)$/.test(rawU)) {
        quantity = Math.max(1, Math.round(parsedNum));
        unitSize = "1 L";
        normalizedDimension = "VOLUME";
      } else if (/^ml$/.test(rawU)) {
        quantity = 1;
        unitSize = `${parsedNum} ml`;
        normalizedDimension = "VOLUME";
      } else if (/^(kgs?|kilos?|kg)$/.test(rawU)) {
        quantity = 1;
        unitSize = `${parsedNum} kg`;
        normalizedDimension = "WEIGHT";
      } else if (/^(grams?|gms?|gm|g)$/.test(rawU)) {
        quantity = 1;
        unitSize = `${parsedNum} g`;
        normalizedDimension = "WEIGHT";
      } else if (/^(pack|packets?)$/.test(rawU)) {
        quantity = Math.max(1, Math.round(parsedNum));
        unitSize = "1 pack";
        normalizedDimension = "COUNT";
      } else {
        quantity = Math.max(1, Math.round(parsedNum));
        unitSize = `${quantity} pcs`;
        normalizedDimension = "COUNT";
      }

      text = text.replace(trailingUnitRegex, " ").trim();
    }
  }

  // 6. Brand Preference Extraction
  let brandPreference: string | null = null;
  for (const b of STAPLE_BRANDS) {
    const bRegex = new RegExp(`\\b${escapeRegex(b)}\\b`, "i");
    if (bRegex.test(text)) {
      brandPreference = b;
      text = text.replace(bRegex, " ").trim();
      break;
    }
  }

  // 7. Variant Preference Extraction
  let variantPreference: string | null = null;
  for (const v of STAPLE_VARIANTS) {
    const vRegex = new RegExp(`\\b${escapeRegex(v)}\\b`, "i");
    if (vRegex.test(text)) {
      variantPreference = v;
      text = text.replace(vRegex, " ").trim();
      break;
    }
  }

  // 8. Clean up remaining queryName
  let queryName = text
    .replace(/[()[\]{},;]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // If queryName is empty after removing brand/variant, recover from original
  if (!queryName) {
    queryName = (brandPreference || "") + (variantPreference ? ` ${variantPreference}` : "");
    queryName = queryName.trim() || originalSegment;
  }

  return {
    rawSegment: originalSegment,
    queryName,
    query: queryName,
    brandPreference,
    variantPreference,
    requiredVariant: variantPreference || undefined,
    quantity: Math.max(1, quantity),
    unitSize,
    unit: unitSize || "pcs",
    normalizedDimension,
    allowSubstitutions,
  };
}

/**
 * Deterministically splits and parses grocery list notes into structured items.
 */
export function parseGroceryListDeterministic(rawText: string): NLParseResult {
  if (!rawText || !rawText.trim()) {
    return {
      items: [],
      rawText: rawText || "",
      providerUsed: "deterministic",
      unparsedPhrases: [],
    };
  }

  // Complex delimiters: commas, semicolons, newlines, " and ", " & ", " plus ", " + "
  const delimiterRegex = /[,;\n\r]+|\s+(?:and|&|plus)\s+|\s*\+\s*/gi;
  const rawSegments = rawText
    .split(delimiterRegex)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const items: ParsedGroceryItem[] = [];
  const unparsedPhrases: string[] = [];

  for (const segment of rawSegments) {
    const parsed = parseSegmentDeterministic(segment);
    if (parsed) {
      items.push(parsed);
    } else {
      unparsedPhrases.push(segment);
    }
  }

  return {
    items,
    rawText,
    providerUsed: "deterministic",
    unparsedPhrases,
  };
}
