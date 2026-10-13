import { GroceryListItemInput } from "@groqai/shared";

export interface NLParserResult {
  items: GroceryListItemInput[];
  unparsedPhrases: string[];
}

export interface INaturalLanguageListParser {
  parse(rawText: string): Promise<NLParserResult>;
}

export class DeterministicGroceryListParser implements INaturalLanguageListParser {
  async parse(rawText: string): Promise<NLParserResult> {
    if (!rawText || !rawText.trim()) {
      return { items: [], unparsedPhrases: [] };
    }

    // Split on commas, newlines, " and ", " + ", ";"
    const delimiterRegex = /[,;\n\r]+|\s+and\s+|\s*\+\s*/gi;
    const segments = rawText
      .split(delimiterRegex)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    const items: GroceryListItemInput[] = [];
    const unparsedPhrases: string[] = [];

    for (const segment of segments) {
      const parsed = this.parseSegment(segment);
      if (parsed) {
        items.push(parsed);
      } else {
        unparsedPhrases.push(segment);
      }
    }

    return { items, unparsedPhrases };
  }

  private parseSegment(segment: string): GroceryListItemInput | null {
    const clean = segment.replace(/^[-*•]\s*/, "").trim();
    if (!clean) return null;

    // Pattern 1: "<quantity> <unit> <product>" e.g., "2 litres milk", "5 kg rice", "500 g paneer"
    const patternWithUnit = /^(\d+(?:\.\d+)?)\s*(litres?|liter|liters?|ltrs?|l|ml|kgs?|kilos?|kg|grams?|g|pack|packets?|pcs|pieces?|bottles?|cans?|dozens?|dozen)\s+(?:of\s+)?(.+)$/i;
    const match1 = clean.match(patternWithUnit);
    if (match1) {
      let qty = parseFloat(match1[1]);
      let rawUnit = match1[2].toLowerCase();
      const query = match1[3].trim();

      // Normalize unit
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

      return {
        query,
        quantity: qty,
        unit,
        allowSubstitutions: false,
      };
    }

    // Pattern 2: "<quantity> <product>" e.g., "12 eggs", "2 onions", "3 apples"
    const patternNoUnit = /^(\d+(?:\.\d+)?)\s+(.+)$/i;
    const match2 = clean.match(patternNoUnit);
    if (match2) {
      const qty = parseFloat(match2[1]);
      const query = match2[2].trim();
      return {
        query,
        quantity: qty,
        unit: "pcs",
        allowSubstitutions: false,
      };
    }

    // Pattern 3: just product name e.g., "milk", "bread", "atta" -> default qty 1
    if (clean.length > 1) {
      return {
        query: clean,
        quantity: 1,
        unit: "pcs",
        allowSubstitutions: false,
      };
    }

    return null;
  }
}

export const defaultNLParser = new DeterministicGroceryListParser();
