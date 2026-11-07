import { PriceObservation } from "@groqai/shared";

export interface ListingCandidate {
  productId: string;
  platform: string;
  locationKey: string;
  observation: PriceObservation;
  confidence: number;
}

// "2 x 500 ml", "1 L X 12", "pack of 6" and explicit combo titles are
// different SKUs from a single pack even when the total quantity is equal.
const MULTIPACK_PATTERN =
  /(\d+(?:\.\d+)?)\s*(?:ml|l|g|kg|pcs?|pc|pack|pouch|bottle|can)\s*x\s*\d+|\d+\s*x\s*\d+(?:\.\d+)?\s*(?:ml|l|g|kg|pcs?|pc|pack|pouch|bottle|can)/i;

export function isMultipackOrCombo(packSize?: string, title?: string): boolean {
  const text = `${packSize || ""} ${title || ""}`;
  return /\bcombo\b/i.test(text) || MULTIPACK_PATTERN.test(text);
}

function isAvailable(observation: PriceObservation): boolean {
  return (observation.availability ?? "available") !== "unavailable";
}

function tieBreakKey(candidate: ListingCandidate): string {
  const observation = candidate.observation;
  return `${observation.externalId || ""}|${observation.productUrl || ""}|${observation.title}`;
}

/**
 * Deterministically chooses which observation should represent a
 * product/platform/location listing for one scrape run. Raw observations are
 * all persisted for audit; only this representative wins the listing.
 *
 * Priority:
 *   1. available over unavailable
 *   2. single pack over multipack/combo
 *   3. higher match confidence
 *   4. lower price
 *   5. stable identifier tie-break
 */
export function isBetterListingCandidate(
  next: ListingCandidate,
  current: ListingCandidate
): boolean {
  const nextAvailable = isAvailable(next.observation);
  const currentAvailable = isAvailable(current.observation);
  if (nextAvailable !== currentAvailable) return nextAvailable;

  const nextMultipack = isMultipackOrCombo(
    next.observation.packSize,
    next.observation.title
  );
  const currentMultipack = isMultipackOrCombo(
    current.observation.packSize,
    current.observation.title
  );
  if (nextMultipack !== currentMultipack) return !nextMultipack;

  if (next.confidence !== current.confidence) {
    return next.confidence > current.confidence;
  }

  const nextPrice = next.observation.pricePaise ?? Number.POSITIVE_INFINITY;
  const currentPrice = current.observation.pricePaise ?? Number.POSITIVE_INFINITY;
  if (nextPrice !== currentPrice) return nextPrice < currentPrice;

  return tieBreakKey(next) < tieBreakKey(current);
}
