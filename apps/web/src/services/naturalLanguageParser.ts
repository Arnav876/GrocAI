import {
  GroceryListItemInput,
  ParsedGroceryItem,
  NLParseResult,
  parseGroceryListDeterministic,
} from "@groqai/shared";

export interface NLParserResult {
  items: (GroceryListItemInput & Partial<ParsedGroceryItem>)[];
  unparsedPhrases: string[];
}

export interface INaturalLanguageListParser {
  parse(rawText: string): Promise<NLParserResult>;
}

export class DeterministicGroceryListParser implements INaturalLanguageListParser {
  async parse(rawText: string): Promise<NLParserResult> {
    const res = parseGroceryListDeterministic(rawText);

    const items = res.items.map((it) => ({
      ...it,
      query: it.queryName,
      unit: it.unitSize || "pcs",
      requiredVariant: it.variantPreference || undefined,
      allowSubstitutions: it.allowSubstitutions,
    }));

    return {
      items,
      unparsedPhrases: res.unparsedPhrases,
    };
  }

  parseDeterministic(rawText: string): NLParseResult {
    return parseGroceryListDeterministic(rawText);
  }

  async parseGroceryList(rawText: string): Promise<NLParseResult> {
    return parseGroceryListDeterministic(rawText);
  }
}

export const defaultNLParser = new DeterministicGroceryListParser();
