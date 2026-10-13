import { areQuantitiesCompatible, parseAndNormalizeQuantity } from "./unitNormalizer.js";

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

// Incompatible variant pairs that must NEVER match
const CONFLICTING_VARIANT_PAIRS: [RegExp, RegExp][] = [
  [/toned/i, /full\s*cream|gold/i],
  [/cow/i, /buffalo/i],
  [/brown/i, /white/i],
  [/skimmed/i, /whole/i],
  [/unpolished/i, /polished/i],
  [/sugar\s*free|diet/i, /regular|original/i],
  [/iodised/i, /rock|black|himalayan/i],
];

export class MatchingService {
  constructor(private aiMatcher?: IAIMatcher) {}

  match(query: MatchQuery, candidate: CandidateProduct): MatchResult {
    const reasons: string[] = [];

    // 1. Exact Barcode or External ID Match
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

    const intersection = queryTokens.filter((t) => candidateTokens.includes(t));
    const tokenConfidence =
      queryTokens.length > 0 ? intersection.length / Math.max(queryTokens.length, candidateTokens.length) : 0;

    let confidence = Math.min(1.0, 0.4 + tokenConfidence * 0.6);

    // If all significant query tokens are matched in candidate
    if (queryTokens.length > 0 && queryTokens.every((t) => candidateTokens.includes(t))) {
      confidence = Math.max(confidence, 0.90);
      reasons.push("All query search tokens matched candidate");
    }

    // If query has exact match in candidate name
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

  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 1 && !["the", "and", "or", "of", "in", "with"].includes(t));
  }
}

export const defaultMatcher = new MatchingService();
