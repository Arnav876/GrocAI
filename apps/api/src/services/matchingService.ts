import {
  parseAndNormalizeQuantity,
  areQuantitiesCompatible,
} from "../matching/unitNormalizer.js";
import {
  parseAndNormalizeQuantityWithPrice,
  type CanonicalDimension,
} from "@groqai/shared";

// Backward-compatible interfaces for existing callers
export interface CandidateProduct {
  id: string;
  name: string;
  brand: string;
  variant: string;
  packSize: string;
  barcode?: string;
  externalId?: string;
}

export interface MatchQuery {
  query: string;
  brand?: string;
  variant?: string;
  packSize?: string;
  barcode?: string;
  allowSubstitutions?: boolean;
}

export interface MatchResult {
  candidateId: string;
  confidence: number;
  isMatch: boolean;
  needsReview: boolean;
  reasons: string[];
}

export interface IAIMatcher {
  evaluateMatch(query: MatchQuery, candidate: CandidateProduct): Promise<MatchResult>;
}

export class AIMatcherStub implements IAIMatcher {
  async evaluateMatch(query: MatchQuery, candidate: CandidateProduct): Promise<MatchResult> {
    return {
      candidateId: candidate.id,
      confidence: 0.5,
      isMatch: false,
      needsReview: true,
      reasons: ["AI matcher stub (disabled by default)"],
    };
  }
}

// Phase 2 Canonical & Observation Input Interfaces
export interface MatchObservationInput {
  name: string;
  brand?: string | null;
  quantity: string;
  pricePaise?: number;
  platformId?: string;
  barcode?: string;
  externalId?: string;
}

export interface CanonicalProductMatchInput {
  id: string;
  slug?: string;
  name: string;
  brand: string;
  category?: string;
  variant: string;
  baseDimension: CanonicalDimension | string;
  standardPackSize: string;
  aliases?: string[];
}

export interface GuardEvaluationResult {
  brandGuardPassed: boolean;
  variantGuardPassed: boolean;
  packSizeGuardPassed: boolean;
  dimensionGuardPassed: boolean;
  exactPackSizeMatch?: boolean;
  conflictDetails: string[];
}

export type MatchClassification = 'AUTO_MATCH' | 'CANDIDATE_REVIEW' | 'REJECTED';

export interface MatchEvaluationResult {
  canonicalProductId: string | null;
  score: number;
  classification: MatchClassification;
  guards: GuardEvaluationResult;
  reasons: string[];
}

// Incompatible variant pairs across Indian quick-commerce staples (Hard Guards)
export const CONFLICTING_VARIANT_PAIRS: [RegExp, RegExp][] = [
  // Milk variants
  [/\btaaza\b|\btoned\b/i, /\bgold\b|\bfull\s*cream\b/i],
  [/\bcow\b/i, /\bbuffalo\b/i],
  [/\bcow\b/i, /\b(taaza|toned|gold|a2)\b/i],
  [/\bslim\b|\bdouble\s*toned\b/i, /\b(gold|full\s*cream|whole)\b/i],
  [/\blactose\s*free\b/i, /\b(regular|taaza|gold|standardised)\b/i],

  // Atta / Flour variants
  [/\bselect\b|\bsharbati\b/i, /\bsuperior\b|\bmp\b|\bmultigrain\b/i],
  [/\bmultigrain\b/i, /\bwhole\s*wheat\b|\bshudh\b|\bchakki\b/i],
  [/\bmaida\b/i, /\batta\b/i],

  // Rice variants
  [/\bclassic\b/i, /\b(dubar|tibar|mogra|super|mini)\b/i],
  [/\bdubar\b/i, /\b(tibar|mogra)\b/i],
  [/\bbrown\b/i, /\bwhite\b/i],
  [/\bbasmati\b/i, /\bsona\s*masoori\b|\bkolam\b/i],

  // Butter variants
  [/\bsalted\b/i, /\bunsalted\b|\bwhite\s*butter\b/i],
  [/\bgarlic\b/i, /\bplain\b|\bclassic\b/i],

  // Bread variants
  [/\bwhole\s*wheat\b|\bbrown\b/i, /\bwhite\b/i],
  [/\bmultigrain\b/i, /\bwhite\b/i],

  // Eggs variants
  [/\bfree\s*range\b/i, /\b(caged|regular|table)\b/i],
  [/\bbrown\b|\bcountry\b/i, /\bwhite\b/i],

  // General staples
  [/\bunpolished\b/i, /\bpolished\b/i],
  [/\bsugar\s*free\b|\bdiet\b/i, /\bregular\b|\boriginal\b/i],
  [/\biodised\b|\biodized\b/i, /\b(rock|black|himalayan|pink)\b/i],
];

// Packaging / marketing tokens that don't change core identity
const NOISE_TOKENS = new Set([
  "tetra",
  "pack",
  "packs",
  "packet",
  "packets",
  "pouch",
  "pouches",
  "combo",
  "combos",
  "homogenised",
  "homogenized",
  "standardised",
  "standardized",
  "pasteurised",
  "pasteurized",
  "uht",
  "days",
  "shelf",
  "life",
  "fresh",
  "jar",
  "bottle",
  "can",
]);

const GENERIC_TOKENS = new Set([
  "milk",
  "toned",
  "full",
  "cream",
  "fresh",
  "high",
  "atta",
  "flour",
  "oil",
  "rice",
  "dal",
  "bread",
  "butter",
  "eggs",
]);

export class MatchingService {
  constructor(private aiMatcher?: IAIMatcher) {}

  /**
   * Evaluates an observed raw listing against a CanonicalProduct in the catalog
   * executing strict deterministic Phase 2 tokenization and guardrails.
   */
  evaluateObservation(
    observation: MatchObservationInput,
    canonical: CanonicalProductMatchInput
  ): MatchEvaluationResult {
    const reasons: string[] = [];
    const conflictDetails: string[] = [];

    // 1. Exact Barcode Match
    if (observation.barcode && observation.barcode === canonical.id) {
      return {
        canonicalProductId: canonical.id,
        score: 1.0,
        classification: 'AUTO_MATCH',
        guards: {
          brandGuardPassed: true,
          variantGuardPassed: true,
          packSizeGuardPassed: true,
          dimensionGuardPassed: true,
          conflictDetails: [],
        },
        reasons: ['Exact barcode match'],
      };
    }

    // 2. BRAND GUARD
    const brandGuardPassed = this.checkBrandCompatibility(
      observation.brand || this.extractBrandFromName(observation.name),
      canonical.brand
    );
    if (!brandGuardPassed) {
      conflictDetails.push(
        `Brand conflict: observation '${observation.brand || 'unknown'}' vs canonical '${canonical.brand}'`
      );
      reasons.push(`Brand mismatch: '${observation.brand}' vs '${canonical.brand}'`);
    }

    // 3. VARIANT GUARD
    const variantGuardPassed = this.checkVariantConflict(
      `${observation.name}`,
      `${canonical.name} ${canonical.variant}`
    );
    if (!variantGuardPassed) {
      conflictDetails.push(
        `Conflicting variant detected between observation '${observation.name}' and canonical '${canonical.name}' (${canonical.variant})`
      );
      reasons.push('Conflicting variant tokens detected across grocery staple dictionary');
    }

    // 4. DIMENSION & PACK-SIZE GUARD
    const { dimensionGuardPassed, packSizeGuardPassed, exactPackSizeMatch, packSizeConflictReason } =
      this.checkPackSizeCompatibility(
        observation.quantity,
        canonical.standardPackSize,
        canonical.baseDimension
      );

    if (!dimensionGuardPassed) {
      conflictDetails.push(packSizeConflictReason || 'Base physical dimension conflict');
      reasons.push(packSizeConflictReason || 'Physical dimension conflict (e.g. Volume vs Weight)');
    } else if (!packSizeGuardPassed) {
      conflictDetails.push(packSizeConflictReason || 'Pack size quantity mismatch');
      reasons.push(packSizeConflictReason || 'Pack size differs (requires candidate review)');
    }

    // 5. DETERMINISTIC TOKEN SIMILARITY & ALIAS OVERLAP
    const normalizedObsName = this.normalizeProductString(observation.name);
    const normalizedCanonicalName = this.normalizeProductString(canonical.name);
    const normalizedVariant = this.normalizeProductString(canonical.variant);

    // Check alias exact match
    let aliasMatchBonus = 0;
    if (canonical.aliases && canonical.aliases.length > 0) {
      for (const alias of canonical.aliases) {
        const normAlias = this.normalizeProductString(alias);
        if (normalizedObsName === normAlias || normalizedObsName.includes(normAlias)) {
          aliasMatchBonus = 0.35;
          reasons.push(`Matched canonical alias: '${alias}'`);
          break;
        }
      }
    }

    // Token overlap scoring (excluding noise and unit/quantity tokens already checked by pack-size guard)
    const isQuantityToken = (t: string) => /^\d+(?:ml|l|g|kg|gm|pcs?|pc)?$/i.test(t);
    const obsTokens = this.tokenize(normalizedObsName).filter(
      (t) => !NOISE_TOKENS.has(t) && !isQuantityToken(t)
    );
    const targetTokens = this.tokenize(
      `${normalizedCanonicalName} ${normalizedVariant}`
    ).filter((t) => !NOISE_TOKENS.has(t) && !isQuantityToken(t));

    const brandTokens = new Set(this.tokenize(canonical.brand));
    const intersection = obsTokens.filter((t) => targetTokens.includes(t));
    const coverage = obsTokens.length > 0 ? intersection.length / obsTokens.length : 0;

    let baseScore = coverage > 0 ? 0.4 + coverage * 0.5 : 0.0;
    if (aliasMatchBonus > 0) {
      baseScore = Math.max(baseScore, 0.90);
    }
    baseScore = Math.min(1.0, baseScore + aliasMatchBonus);

    // If query has exact name match
    if (normalizedObsName.includes(normalizedCanonicalName)) {
      baseScore = Math.max(baseScore, 0.95);
      reasons.push('Observation name contains canonical name');
    }

    // Check missing distinctive tokens (excluding quantities/numbers)
    if (aliasMatchBonus === 0) {
      const isQuantityOrNumber = (t: string) => /^\d+(?:ml|l|g|kg|gm|pcs?|pc)?$/i.test(t);
      const missingDistinctive = obsTokens.filter(
        (t) =>
          !targetTokens.includes(t) &&
          !GENERIC_TOKENS.has(t) &&
          !brandTokens.has(t) &&
          !isQuantityOrNumber(t)
      );
      if (missingDistinctive.length > 0) {
        baseScore = Math.min(baseScore, 0.49);
        reasons.push(`Missing distinctive token(s): ${missingDistinctive.join(', ')}`);
      }
    }

    // Apply hard guard penalties
    if (!brandGuardPassed || !variantGuardPassed || !dimensionGuardPassed) {
      baseScore = Math.min(baseScore, 0.20);
    } else if (!packSizeGuardPassed) {
      // Pack size mismatch caps confidence to candidate review (0.50..0.75)
      baseScore = Math.min(baseScore, 0.70);
    }

    const roundedScore = Number(baseScore.toFixed(4));

    // 6. CLASSIFICATION DETERMINATION
    let classification: MatchClassification;
    if (
      roundedScore >= 0.85 &&
      brandGuardPassed &&
      variantGuardPassed &&
      packSizeGuardPassed &&
      dimensionGuardPassed
    ) {
      classification = 'AUTO_MATCH';
      reasons.push('High token overlap and all deterministic guards passed');
    } else if (
      roundedScore >= 0.45 &&
      brandGuardPassed &&
      variantGuardPassed &&
      dimensionGuardPassed
    ) {
      classification = 'CANDIDATE_REVIEW';
      reasons.push('Candidate matches product family but requires operator review or pack variant creation');
    } else {
      classification = 'REJECTED';
      reasons.push('Match score below threshold or hard guard conflict');
    }

    return {
      canonicalProductId: canonical.id,
      score: roundedScore,
      classification,
      guards: {
        brandGuardPassed,
        variantGuardPassed,
        packSizeGuardPassed,
        dimensionGuardPassed,
        exactPackSizeMatch,
        conflictDetails,
      },
      reasons,
    };
  }

  /**
   * Evaluates an observation against an array of CanonicalProducts and ranks candidates.
   */
  rankCatalogCandidates(
    observation: MatchObservationInput,
    catalog: CanonicalProductMatchInput[],
    limit: number = 3
  ): MatchEvaluationResult[] {
    const results = catalog.map((cp) => this.evaluateObservation(observation, cp));
    // Sort by classification precedence (AUTO_MATCH > CANDIDATE_REVIEW > REJECTED) then score desc
    return results
      .sort((a, b) => {
        const order = { AUTO_MATCH: 3, CANDIDATE_REVIEW: 2, REJECTED: 1 };
        if (order[a.classification] !== order[b.classification]) {
          return order[b.classification] - order[a.classification];
        }
        return b.score - a.score;
      })
      .slice(0, limit);
  }

  // --- DETERMINISTIC GUARDS ---

  checkBrandCompatibility(obsBrand?: string | null, canonicalBrand?: string | null): boolean {
    if (!obsBrand || !canonicalBrand) return true;
    const a = obsBrand.toLowerCase().trim();
    const b = canonicalBrand.toLowerCase().trim();
    if (a === b) return true;
    return a.includes(b) || b.includes(a);
  }

  checkVariantConflict(textA: string, textB: string): boolean {
    const lowerA = textA.toLowerCase();
    const lowerB = textB.toLowerCase();

    for (const [regexA, regexB] of CONFLICTING_VARIANT_PAIRS) {
      const aInFirst = regexA.test(lowerA);
      const bInFirst = regexB.test(lowerA);
      const aInSecond = regexA.test(lowerB);
      const bInSecond = regexB.test(lowerB);

      if ((aInFirst && bInSecond && !bInFirst) || (bInFirst && aInSecond && !aInFirst)) {
        return false;
      }
    }
    return true;
  }

  checkPackSizeCompatibility(
    obsPackSizeStr: string,
    canonicalPackSizeStr: string,
    canonicalDimension?: string
  ): {
    dimensionGuardPassed: boolean;
    packSizeGuardPassed: boolean;
    exactPackSizeMatch: boolean;
    packSizeConflictReason?: string;
  } {
    return this.checkPackSizeAndDimensionCompatibility(
      obsPackSizeStr,
      canonicalPackSizeStr,
      canonicalDimension
    );
  }

  checkPackSizeAndDimensionCompatibility(
    obsPackSizeStr: string,
    canonicalPackSizeStr: string,
    canonicalDimension?: string
  ): {
    dimensionGuardPassed: boolean;
    packSizeGuardPassed: boolean;
    exactPackSizeMatch: boolean;
    packSizeConflictReason?: string;
  } {
    // Parse using shared normalizer
    const obsNorm = parseAndNormalizeQuantityWithPrice(obsPackSizeStr, 100);
    const canNorm = parseAndNormalizeQuantityWithPrice(canonicalPackSizeStr, 100);

    // 1. Dimension match
    if (
      canonicalDimension &&
      obsNorm.dimension !== 'UNKNOWN' &&
      obsNorm.dimension !== canonicalDimension
    ) {
      return {
        dimensionGuardPassed: false,
        packSizeGuardPassed: false,
        exactPackSizeMatch: false,
        packSizeConflictReason: `Incompatible dimensions: observation is ${obsNorm.dimension} vs canonical ${canonicalDimension}`,
      };
    }

    if (
      obsNorm.dimension !== 'UNKNOWN' &&
      canNorm.dimension !== 'UNKNOWN' &&
      obsNorm.dimension !== canNorm.dimension
    ) {
      return {
        dimensionGuardPassed: false,
        packSizeGuardPassed: false,
        exactPackSizeMatch: false,
        packSizeConflictReason: `Incompatible dimensions: ${obsNorm.dimension} vs ${canNorm.dimension}`,
      };
    }

    // 2. Quantity compatibility (exact amount)
    if (
      obsNorm.dimension !== 'UNKNOWN' &&
      canNorm.dimension !== 'UNKNOWN' &&
      obsNorm.amountInBaseUnits !== canNorm.amountInBaseUnits
    ) {
      return {
        dimensionGuardPassed: true,
        packSizeGuardPassed: false,
        exactPackSizeMatch: false,
        packSizeConflictReason: `Pack size differs: ${obsPackSizeStr} (${obsNorm.amountInBaseUnits}) vs ${canonicalPackSizeStr} (${canNorm.amountInBaseUnits})`,
      };
    }

    // Fallback quantity check using existing legacy compatible helper
    const legacyCompat = areQuantitiesCompatible(obsPackSizeStr, canonicalPackSizeStr);
    return {
      dimensionGuardPassed: true,
      packSizeGuardPassed: legacyCompat,
      exactPackSizeMatch: legacyCompat,
      packSizeConflictReason: legacyCompat ? undefined : `Incompatible pack size string: ${obsPackSizeStr} vs ${canonicalPackSizeStr}`,
    };
  }

  normalizeProductString(str: string): string {
    return str
      .toLowerCase()
      .replace(/[^\w\s\.]/g, " ")
      .replace(/\s+/g, " ")
      .replace(/(\d+)\s*(?:l|litre|litres|ltr)\b/gi, "$1l")
      .replace(/(\d+)\s*(?:ml|millilitre|millilitres)\b/gi, "$1ml")
      .replace(/(\d+)\s*(?:kg|kilo|kilogram|kilograms)\b/gi, "$1kg")
      .replace(/(\d+)\s*(?:g|gm|gms|gram|grams)\b/gi, "$1g")
      .trim();
  }

  tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 1 && !["the", "and", "or", "of", "in", "with"].includes(t));
  }

  private extractBrandFromName(name: string): string | null {
    const commonBrands = [
      "Amul",
      "Mother Dairy",
      "Aashirvaad",
      "Tata",
      "Tata Sampann",
      "Fortune",
      "Britannia",
      "India Gate",
      "Farm Made",
      "Pillsbury",
      "Dabur",
      "Nestle",
    ];
    for (const b of commonBrands) {
      if (new RegExp(`\\b${b}\\b`, "i").test(name)) {
        return b;
      }
    }
    return null;
  }

  // --- BACKWARD COMPATIBLE METHOD ---
  match(query: MatchQuery, candidate: CandidateProduct): MatchResult {
    const reasons: string[] = [];

    // 1. Exact Barcode Match
    if (query.barcode && candidate.barcode && query.barcode === candidate.barcode) {
      return {
        candidateId: candidate.id,
        confidence: 1.0,
        isMatch: true,
        needsReview: false,
        reasons: ["Exact barcode match"],
      };
    }

    // 2. Deterministic Guard: Pack Size / Quantity Check
    if (query.packSize && candidate.packSize) {
      const compatible = areQuantitiesCompatible(query.packSize, candidate.packSize);
      if (!compatible) {
        return {
          candidateId: candidate.id,
          confidence: 0.0,
          isMatch: false,
          needsReview: false,
          reasons: [
            `Incompatible pack size: requested ${query.packSize} vs candidate ${candidate.packSize}`,
          ],
        };
      }
    }

    // 3. Deterministic Guard: Conflicting Variant Keywords
    const queryText = `${query.query} ${query.variant || ""}`.toLowerCase();
    const candidateText = `${candidate.name} ${candidate.variant}`.toLowerCase();

    for (const [regexA, regexB] of CONFLICTING_VARIANT_PAIRS) {
      const aInQuery = regexA.test(queryText);
      const bInQuery = regexB.test(queryText);
      const aInCandidate = regexA.test(candidateText);
      const bInCandidate = regexB.test(candidateText);

      if ((aInQuery && bInCandidate && !bInQuery) || (bInQuery && aInCandidate && !aInQuery)) {
        return {
          candidateId: candidate.id,
          confidence: 0.2,
          isMatch: false,
          needsReview: false,
          reasons: [
            `Conflicting product variant: ${regexA.source} vs ${regexB.source} (e.g. Taaza vs Gold)`,
          ],
        };
      }
    }

    // 4. Brand Guard
    if (query.brand && candidate.brand) {
      const qBrand = query.brand.toLowerCase().trim();
      const cBrand = candidate.brand.toLowerCase().trim();
      if (qBrand !== cBrand && !cBrand.includes(qBrand) && !qBrand.includes(cBrand)) {
        if (!query.allowSubstitutions) {
          return {
            candidateId: candidate.id,
            confidence: 0.3,
            isMatch: false,
            needsReview: false,
            reasons: [`Brand mismatch: requested ${query.brand} vs ${candidate.brand}`],
          };
        }
      }
    }

    // 5. Token Overlap Similarity on Names
    const queryTokens = this.tokenize(queryText);
    const candidateTokens = this.tokenize(candidateText);

    const effectiveQueryTokens = queryTokens.filter((t) => !NOISE_TOKENS.has(t));
    const scoringTokens = effectiveQueryTokens.length > 0 ? effectiveQueryTokens : queryTokens;

    const brandTokens = new Set(this.tokenize(query.brand || ""));
    const intersection = scoringTokens.filter((t) => candidateTokens.includes(t));
    const coverage = scoringTokens.length > 0 ? intersection.length / scoringTokens.length : 0;

    let confidence = coverage > 0 ? Math.min(0.9, 0.4 + coverage * 0.6) : 0.0;

    const missingDistinctive = scoringTokens.filter(
      (t) => !candidateTokens.includes(t) && !GENERIC_TOKENS.has(t) && !brandTokens.has(t)
    );
    if (missingDistinctive.length > 0) {
      confidence = Math.min(confidence, 0.49);
      reasons.push(`Missing distinctive product token(s): ${missingDistinctive.join(", ")}`);
    }

    if (scoringTokens.length > 0 && missingDistinctive.length === 0 && coverage === 1) {
      confidence = Math.max(confidence, 0.90);
      reasons.push("All query search tokens matched candidate");
    }

    if (candidateText.includes(query.query.toLowerCase().trim())) {
      confidence = Math.max(confidence, 0.95);
      reasons.push("Query substring matches product name");
    }

    const isMatch = confidence >= 0.5;
    const needsReview = confidence >= 0.5 && confidence < 0.85;

    if (needsReview) {
      reasons.push("Low confidence match — requires review, never silently equal");
    }

    return {
      candidateId: candidate.id,
      confidence,
      isMatch,
      needsReview,
      reasons,
    };
  }
}

export const defaultMatcher = new MatchingService();
