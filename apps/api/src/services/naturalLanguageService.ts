import {
  AIProviderType,
  INLListParser,
  NLParseResult,
  ParsedGroceryItem,
  GroceryListItemInput,
  parseGroceryListDeterministic,
  sanitizeExternalAIOutput,
} from "@groqai/shared";

export type AIClientCaller = (
  provider: AIProviderType,
  prompt: string
) => Promise<string | unknown>;

export class DeterministicNLParser implements INLListParser {
  /**
   * Synchronous pure deterministic list parser.
   */
  parseDeterministic(rawText: string): NLParseResult {
    return parseGroceryListDeterministic(rawText);
  }

  /**
   * Async interface compliant with INLListParser.
   */
  async parseGroceryList(
    rawText: string,
    _options?: { providerOverride?: AIProviderType }
  ): Promise<NLParseResult> {
    return this.parseDeterministic(rawText);
  }

  /**
   * Backward-compatible helper returning GroceryListItemInput[].
   */
  async parseText(rawText: string): Promise<GroceryListItemInput[]> {
    const res = this.parseDeterministic(rawText);
    return res.items.map((it) => ({
      query: it.queryName,
      quantity: it.quantity,
      unit: it.unitSize || "pcs",
      requiredVariant: it.variantPreference || undefined,
      allowSubstitutions: it.allowSubstitutions,
    }));
  }
}

const STRICT_SYSTEM_PROMPT = `You are a specialized grocery list parsing assistant for Indian quick-commerce grocery shopping.
Extract products, quantities, pack sizes, brands, and variant preferences from messy user notes.
If the user specifies recipes, meal ideas, or dishes (e.g., "ingredients for chai", "paneer butter masala", "poha for 4 people"), translate them into their essential grocery ingredients with reasonable quantities.
Output a JSON array of items conforming to this exact schema:
[
  {
    "rawSegment": "original text segment",
    "queryName": "canonical item name (e.g., milk, eggs, atta, butter, bread)",
    "brandPreference": "brand name if specified (e.g., Amul, Aashirvaad, Britannia) or null",
    "variantPreference": "variant if specified (e.g., Taaza, Sharbati, Whole Wheat) or null",
    "quantity": 1,
    "unitSize": "pack size if specified (e.g., 500 ml, 1 L, 5 kg, 12 pcs) or null",
    "normalizedDimension": "VOLUME" | "WEIGHT" | "COUNT" | "UNKNOWN",
    "allowSubstitutions": true | false
  }
]
CRITICAL NON-NEGOTIABLE SAFETY RULE:
You are strictly restricted to INPUT UNDERSTANDING. You are EXPLICITLY FORBIDDEN from estimating, hallucinating, or calculating prices, fees, discounts, or costs. Do NOT include any price or fee fields under any circumstances.`;

export class ExternalAIProviderParser implements INLListParser {
  constructor(
    private fallback: DeterministicNLParser = new DeterministicNLParser(),
    private customClientCaller?: AIClientCaller
  ) {}

  parseDeterministic(rawText: string): NLParseResult {
    return this.fallback.parseDeterministic(rawText);
  }

  async parseGroceryList(
    rawText: string,
    options?: { providerOverride?: AIProviderType }
  ): Promise<NLParseResult> {
    const provider: AIProviderType =
      options?.providerOverride ||
      (process.env.AI_PROVIDER as AIProviderType) ||
      "none";

    // When provider is 'none', execute deterministic parser directly
    if (provider === "none" && !this.customClientCaller) {
      const result = this.fallback.parseDeterministic(rawText);
      return {
        ...result,
        providerUsed: "deterministic",
      };
    }

    // Check if API key is present when calling external providers
    const envKey = `${provider.toUpperCase()}_API_KEY`;
    const apiKey = process.env[envKey] || process.env.AI_API_KEY;

    if (!apiKey && !this.customClientCaller) {
      const fallbackResult = this.fallback.parseDeterministic(rawText);
      return {
        ...fallbackResult,
        providerUsed: "deterministic_fallback",
        warnings: [
          `Provider '${provider}' requested, but ${envKey} is not configured. Transparently fell back to deterministic parser.`,
        ],
      };
    }

    try {
      let rawAIResponse: unknown;

      if (this.customClientCaller) {
        rawAIResponse = await this.customClientCaller(provider, rawText);
      } else {
        rawAIResponse = await this.callExternalProvider(provider, apiKey!, rawText);
      }

      // STRICT AI PRICE FIREWALL: Strip all prohibited price/fee keys and validate schema
      const sanitizedItems = sanitizeExternalAIOutput(rawAIResponse);

      return {
        items: sanitizedItems,
        rawText,
        providerUsed: provider,
        unparsedPhrases: [],
      };
    } catch (err: any) {
      // Deterministic fallback guarantee: zero downtime on provider failure or timeout
      const fallbackResult = this.fallback.parseDeterministic(rawText);
      return {
        ...fallbackResult,
        providerUsed: "deterministic_fallback",
        warnings: [
          `Provider '${provider}' failed: ${err.message}. Transparently fell back to deterministic parser.`,
        ],
      };
    }
  }

  async parseText(rawText: string): Promise<GroceryListItemInput[]> {
    const res = await this.parseGroceryList(rawText);
    return res.items.map((it) => ({
      query: it.queryName,
      quantity: it.quantity,
      unit: it.unitSize || "pcs",
      requiredVariant: it.variantPreference || undefined,
      allowSubstitutions: it.allowSubstitutions,
    }));
  }

  private async callExternalProvider(
    provider: AIProviderType,
    apiKey: string,
    prompt: string
  ): Promise<string> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000); // 8s timeout

    try {
      if (provider === "groq") {
        const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: "llama-3.3-70b-versatile",
            messages: [
              { role: "system", content: STRICT_SYSTEM_PROMPT },
              { role: "user", content: prompt },
            ],
            temperature: 0.1,
            response_format: { type: "json_object" },
          }),
          signal: controller.signal,
        });

        if (!res.ok) {
          throw new Error(`Groq API returned ${res.status}: ${await res.text()}`);
        }
        const json: any = await res.json();
        return json.choices?.[0]?.message?.content || "[]";
      }

      if (provider === "openai") {
        const res = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            messages: [
              { role: "system", content: STRICT_SYSTEM_PROMPT },
              { role: "user", content: prompt },
            ],
            temperature: 0.1,
            response_format: { type: "json_object" },
          }),
          signal: controller.signal,
        });

        if (!res.ok) {
          throw new Error(`OpenAI API returned ${res.status}: ${await res.text()}`);
        }
        const json: any = await res.json();
        return json.choices?.[0]?.message?.content || "[]";
      }

      if (provider === "gemini") {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: `${STRICT_SYSTEM_PROMPT}\n\nUser grocery list:\n${prompt}` }] }],
            generationConfig: { responseMimeType: "application/json" },
          }),
          signal: controller.signal,
        });

        if (!res.ok) {
          throw new Error(`Gemini API returned ${res.status}: ${await res.text()}`);
        }
        const json: any = await res.json();
        return json.candidates?.[0]?.content?.parts?.[0]?.text || "[]";
      }

      throw new Error(`Unsupported external provider: ${provider}`);
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function createNLParser(options?: {
  provider?: AIProviderType;
  clientCaller?: AIClientCaller;
}): INLListParser {
  const provider =
    options?.provider || (process.env.AI_PROVIDER as AIProviderType) || "none";
  const deterministic = new DeterministicNLParser();
  if (provider === "none" && !options?.clientCaller) {
    return deterministic;
  }
  return new ExternalAIProviderParser(deterministic, options?.clientCaller);
}
