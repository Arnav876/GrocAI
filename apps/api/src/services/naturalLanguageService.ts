import { GroceryListItemInput } from "@groqai/shared";

export interface INLListParser {
  parseText(rawText: string): Promise<GroceryListItemInput[]>;
}

export class DeterministicNLParser implements INLListParser {
  async parseText(rawText: string): Promise<GroceryListItemInput[]> {
    if (!rawText || !rawText.trim()) return [];

    const segments = rawText
      .split(/[,;\n\r]+|\s+and\s+|\s*\+\s*/gi)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    const items: GroceryListItemInput[] = [];

    for (const segment of segments) {
      const clean = segment.replace(/^[-*•]\s*/, "").trim();
      if (!clean) continue;

      const patternWithUnit = /^(\d+(?:\.\d+)?)\s*(litres?|liter|liters?|ltrs?|l|ml|kgs?|kilos?|kg|grams?|g|pack|packets?|pcs|pieces?|bottles?|cans?|dozens?|dozen)\s+(?:of\s+)?(.+)$/i;
      const match1 = clean.match(patternWithUnit);
      if (match1) {
        let qty = parseFloat(match1[1]);
        const rawUnit = match1[2].toLowerCase();
        const query = match1[3].trim();

        let unit = "pcs";
        if (/^(litres?|liter|liters?|ltrs?|l)$/.test(rawUnit)) unit = "L";
        else if (/^ml$/.test(rawUnit)) unit = "ml";
        else if (/^(kgs?|kilos?|kg)$/.test(rawUnit)) unit = "kg";
        else if (/^(grams?|g)$/.test(rawUnit)) unit = "g";
        else if (/^(pack|packets?)$/.test(rawUnit)) unit = "pack";
        else if (/^(dozens?|dozen)$/.test(rawUnit)) {
          unit = "pcs";
          qty = qty * 12;
        }

        items.push({ query, quantity: qty, unit, allowSubstitutions: false });
        continue;
      }

      const patternNoUnit = /^(\d+(?:\.\d+)?)\s+(.+)$/i;
      const match2 = clean.match(patternNoUnit);
      if (match2) {
        items.push({
          query: match2[2].trim(),
          quantity: parseFloat(match2[1]),
          unit: "pcs",
          allowSubstitutions: false,
        });
        continue;
      }

      if (clean.length > 1) {
        items.push({ query: clean, quantity: 1, unit: "pcs", allowSubstitutions: false });
      }
    }

    return items;
  }
}

export class ExternalAIProviderParser implements INLListParser {
  constructor(private fallback: INLListParser = new DeterministicNLParser()) {}

  async parseText(rawText: string): Promise<GroceryListItemInput[]> {
    // LLM parser hook (configured via AI_PROVIDER).
    // Note: Non-negotiable rule - LLM may ONLY parse text to items and NEVER supply prices.
    return this.fallback.parseText(rawText);
  }
}

export function createNLParser(): INLListParser {
  const provider = process.env.AI_PROVIDER || "none";
  if (provider === "none") {
    return new DeterministicNLParser();
  }
  return new ExternalAIProviderParser();
}
