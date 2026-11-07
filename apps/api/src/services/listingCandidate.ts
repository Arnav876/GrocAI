import { PrismaClient } from "@prisma/client";
import {
  MatchingService,
  MatchObservationInput,
  CanonicalProductMatchInput,
  MatchEvaluationResult,
  GuardEvaluationResult,
} from "./matchingService.js";

// Re-export worker/ingestion listing candidate contracts
export {
  ListingCandidate,
  isBetterListingCandidate,
  isMultipackOrCombo,
} from "../ingestion/listingCandidate.js";

export type CandidateRecommendedAction =
  | "LINK_CANONICAL"
  | "CREATE_NEW_VARIANT"
  | "NEEDS_HUMAN_REVIEW"
  | "IGNORE";

export interface CandidateSuggestion {
  observationId: string;
  suggestedCanonicalProductId: string | null;
  confidenceScore: number;
  matchReasons: string[];
  guardFlags: GuardEvaluationResult;
  recommendedAction: CandidateRecommendedAction;
}

/**
 * Deterministically decides the recommended operator/system action
 * based on deterministic guard flags and confidence scores. Zero AI.
 */
export function determineRecommendedAction(
  evaluation: MatchEvaluationResult
): CandidateRecommendedAction {
  const { guards, score, classification } = evaluation;

  // 1. Hard rejects due to brand, variant, or base physical dimension incompatibility
  if (!guards.brandGuardPassed || !guards.variantGuardPassed || !guards.dimensionGuardPassed) {
    return "IGNORE";
  }

  // 2. High confidence auto match with all guards passed (including pack size)
  if (classification === "AUTO_MATCH") {
    return "LINK_CANONICAL";
  }

  // 3. Compatible brand, variant, and dimension, but pack size differs (e.g. 500ml vs 1L, 1kg vs 5kg)
  if (!guards.packSizeGuardPassed) {
    return "CREATE_NEW_VARIANT";
  }

  // 4. Same pack size, but score in review range (requires operator review)
  if (score >= 0.45) {
    return "NEEDS_HUMAN_REVIEW";
  }

  return "IGNORE";
}

export class CandidateSuggestionService {
  constructor(
    private prisma?: PrismaClient,
    private matchingService: MatchingService = new MatchingService()
  ) {}

  /**
   * Pure deterministic evaluator: ranks catalog products against an observation
   * and assigns structured suggestions and actions. Can run without DB.
   */
  evaluateObservationAgainstCatalog(
    observation: MatchObservationInput & { id?: string },
    catalog: CanonicalProductMatchInput[],
    limit: number = 3
  ): CandidateSuggestion[] {
    const obsId = observation.id || "obs-preview";
    const ranked = this.matchingService.rankCatalogCandidates(observation, catalog, limit);

    return ranked.map((match) => ({
      observationId: obsId,
      suggestedCanonicalProductId: match.canonicalProductId,
      confidenceScore: match.score,
      matchReasons: match.reasons,
      guardFlags: match.guards,
      recommendedAction: determineRecommendedAction(match),
    }));
  }

  /**
   * Suggests top candidate matches for an observation from the database.
   */
  async suggestCandidatesForObservation(
    observationId: string,
    limit: number = 3
  ): Promise<CandidateSuggestion[]> {
    if (!this.prisma) {
      throw new Error("PrismaClient is required for suggestCandidatesForObservation");
    }

    const observation = await this.prisma.platformObservation.findUnique({
      where: { id: observationId },
    });
    if (!observation) {
      throw new Error(`PlatformObservation with id '${observationId}' not found`);
    }

    const canonicalProducts = await this.prisma.canonicalProduct.findMany();
    const catalog: CanonicalProductMatchInput[] = canonicalProducts.map((cp) => ({
      id: cp.id,
      slug: cp.slug,
      name: cp.name,
      brand: cp.brand,
      category: cp.category,
      variant: cp.variant,
      baseDimension: cp.baseDimension,
      standardPackSize: cp.standardPackSize,
      aliases: cp.aliases,
    }));

    const obsInput: MatchObservationInput & { id: string } = {
      id: observation.id,
      name: observation.name,
      brand: observation.brand,
      quantity: observation.quantity,
      pricePaise: observation.pricePaise,
      platformId: observation.platformId,
    };

    return this.evaluateObservationAgainstCatalog(obsInput, catalog, limit);
  }

  /**
   * Finds unmatched/unverified observations, generates candidate matches,
   * and optionally persists CandidateMatch records with reviewStatus: 'PENDING'.
   */
  async processUnmatchedObservations(options?: {
    limit?: number;
    persist?: boolean;
  }): Promise<{ processed: number; createdMatches: number }> {
    if (!this.prisma) {
      throw new Error("PrismaClient is required for processUnmatchedObservations");
    }

    const persist = options?.persist ?? true;
    const limit = options?.limit ?? 50;

    const unverified = await this.prisma.platformObservation.findMany({
      where: {
        OR: [
          { canonicalProductId: null },
          { verificationStatus: "UNVERIFIED" },
        ],
      },
      take: limit,
    });

    if (unverified.length === 0) {
      return { processed: 0, createdMatches: 0 };
    }

    const canonicalProducts = await this.prisma.canonicalProduct.findMany();
    const catalog: CanonicalProductMatchInput[] = canonicalProducts.map((cp) => ({
      id: cp.id,
      slug: cp.slug,
      name: cp.name,
      brand: cp.brand,
      category: cp.category,
      variant: cp.variant,
      baseDimension: cp.baseDimension,
      standardPackSize: cp.standardPackSize,
      aliases: cp.aliases,
    }));

    let createdMatches = 0;

    for (const obs of unverified) {
      const suggestions = this.evaluateObservationAgainstCatalog(
        {
          id: obs.id,
          name: obs.name,
          brand: obs.brand,
          quantity: obs.quantity,
          pricePaise: obs.pricePaise,
          platformId: obs.platformId,
        },
        catalog,
        3
      );

      if (persist) {
        for (const sugg of suggestions) {
          if (!sugg.suggestedCanonicalProductId) continue;
          if (sugg.recommendedAction === "IGNORE") continue;

          const existing = await this.prisma.candidateMatch.findFirst({
            where: {
              observationId: obs.id,
              canonicalProductId: sugg.suggestedCanonicalProductId,
            },
          });

          if (existing) {
            await this.prisma.candidateMatch.update({
              where: { id: existing.id },
              data: {
                confidenceScore: sugg.confidenceScore,
                matchReasons: sugg.matchReasons,
                guardFlags: sugg.guardFlags as any,
                reviewStatus: "PENDING",
              },
            });
          } else {
            await this.prisma.candidateMatch.create({
              data: {
                observationId: obs.id,
                canonicalProductId: sugg.suggestedCanonicalProductId,
                confidenceScore: sugg.confidenceScore,
                matchReasons: sugg.matchReasons,
                guardFlags: sugg.guardFlags as any,
                reviewStatus: "PENDING",
              },
            });
            createdMatches++;
          }
        }
      }
    }

    return { processed: unverified.length, createdMatches };
  }

  /**
   * Approves a CandidateMatch:
   * Sets CandidateMatch reviewStatus to 'APPROVED'
   * Links PlatformObservation canonicalProductId to the matched product
   * Sets PlatformObservation verificationStatus to 'VERIFIED'
   */
  async approveCandidate(
    candidateMatchId: string,
    note?: string
  ): Promise<{ candidateMatch: any; observation: any }> {
    if (!this.prisma) {
      throw new Error("PrismaClient is required for approveCandidate");
    }

    const match = await this.prisma.candidateMatch.findUnique({
      where: { id: candidateMatchId },
    });
    if (!match) {
      throw new Error(`CandidateMatch with id '${candidateMatchId}' not found`);
    }

    const [updatedMatch, updatedObservation] = await this.prisma.$transaction([
      this.prisma.candidateMatch.update({
        where: { id: candidateMatchId },
        data: {
          reviewStatus: "APPROVED",
          updatedAt: new Date(),
        },
      }),
      this.prisma.platformObservation.update({
        where: { id: match.observationId },
        data: {
          canonicalProductId: match.canonicalProductId,
          verificationStatus: "VERIFIED",
        },
      }),
    ]);

    return { candidateMatch: updatedMatch, observation: updatedObservation };
  }

  /**
   * Rejects a CandidateMatch:
   * Sets CandidateMatch reviewStatus to 'REJECTED'
   */
  async rejectCandidate(
    candidateMatchId: string,
    note?: string
  ): Promise<{ candidateMatch: any }> {
    if (!this.prisma) {
      throw new Error("PrismaClient is required for rejectCandidate");
    }

    const match = await this.prisma.candidateMatch.findUnique({
      where: { id: candidateMatchId },
    });
    if (!match) {
      throw new Error(`CandidateMatch with id '${candidateMatchId}' not found`);
    }

    const updatedMatch = await this.prisma.candidateMatch.update({
      where: { id: candidateMatchId },
      data: {
        reviewStatus: "REJECTED",
        updatedAt: new Date(),
      },
    });

    return { candidateMatch: updatedMatch };
  }
}

// Alias for backwards/alternate naming compatibility
export const ListingCandidateService = CandidateSuggestionService;
export type ListingCandidateService = CandidateSuggestionService;

