import {
  DataProvenance,
  DataProvenanceCounts,
  DataProvenancePlatformSummary,
  DataProvenanceStatus,
  PlatformId,
  PriceVerificationStatus,
  SourceType,
} from "./types.js";
import { SUPPORTED_PLATFORMS } from "./constants.js";
import { determinePriceVerificationStatus } from "./freshness.js";

export interface ProvenanceListingRow {
  platform: string;
  sourceType: string;
  availability: string;
  lastObservedAt: Date;
}

const SOURCE_TYPES: SourceType[] = [
  "authorized_api",
  "partner_feed",
  "permitted_page",
  "manual",
  "mock",
];

const VERIFICATION_STATUSES: PriceVerificationStatus[] = [
  "live_verified",
  "cached",
  "stale",
  "unverified",
  "unavailable",
  "estimate",
];

const LIVE_SOURCE_TYPES: SourceType[] = [
  "authorized_api",
  "partner_feed",
  "permitted_page",
];

function emptyRecord<T extends string>(keys: T[]): Record<T, number> {
  return keys.reduce((acc, key) => {
    acc[key] = 0;
    return acc;
  }, {} as Record<T, number>);
}

function emptyPlatformSummary(platform: PlatformId): DataProvenancePlatformSummary {
  return {
    platform,
    totalListings: 0,
    bySourceType: emptyRecord(SOURCE_TYPES),
    byVerification: emptyRecord(VERIFICATION_STATUSES),
    lastObservedAt: null,
  };
}

export function pincodeFromLocationKey(locationKey: string): string {
  const parts = locationKey.split("_");
  return parts.length > 1 ? parts.slice(1).join("_") : locationKey;
}

/**
 * Pure aggregate so the banner, API, and tests all agree on how provenance is
 * classified. A listing is never treated as live merely because it exists:
 * live requires a permitted-page / authorized-API / partner-feed source and no
 * stale or simulated contribution anywhere in the location.
 */
export function summarizeProvenance(
  rows: ProvenanceListingRow[],
  locationKey: string,
  pincode: string = pincodeFromLocationKey(locationKey)
): DataProvenance {
  const bySourceType = emptyRecord(SOURCE_TYPES);
  const byVerification = emptyRecord(VERIFICATION_STATUSES);
  const platforms = new Map<PlatformId, DataProvenancePlatformSummary>(
    SUPPORTED_PLATFORMS.map((platform) => [platform, emptyPlatformSummary(platform)])
  );

  let unknownSourceListings = 0;
  let availableListings = 0;
  let lastObservedAt: Date | null = null;

  for (const row of rows) {
    const sourceType = SOURCE_TYPES.includes(row.sourceType as SourceType)
      ? (row.sourceType as SourceType)
      : null;
    if (sourceType) {
      bySourceType[sourceType] += 1;
    } else {
      unknownSourceListings += 1;
    }

    const verificationStatus = determinePriceVerificationStatus(
      row.lastObservedAt.toISOString(),
      row.sourceType,
      row.availability
    );
    byVerification[verificationStatus] += 1;

    if (row.availability === "available") availableListings += 1;
    if (!lastObservedAt || row.lastObservedAt > lastObservedAt) {
      lastObservedAt = row.lastObservedAt;
    }

    const platform = platforms.get(row.platform as PlatformId);
    if (platform) {
      platform.totalListings += 1;
      if (sourceType) platform.bySourceType[sourceType] += 1;
      platform.byVerification[verificationStatus] += 1;
      if (
        !platform.lastObservedAt ||
        row.lastObservedAt > new Date(platform.lastObservedAt)
      ) {
        platform.lastObservedAt = row.lastObservedAt.toISOString();
      }
    }
  }

  const totalListings = rows.length;
  const liveSourceListings = LIVE_SOURCE_TYPES.reduce(
    (sum, sourceType) => sum + bySourceType[sourceType],
    0
  );

  const counts: DataProvenanceCounts = {
    totalListings,
    availableListings,
    liveSourceListings,
    manualListings: bySourceType.manual,
    mockListings: bySourceType.mock,
    unknownSourceListings,
    liveVerifiedListings: byVerification.live_verified,
    cachedListings: byVerification.cached,
    staleListings: byVerification.stale,
    unavailableListings: byVerification.unavailable,
    unverifiedListings: byVerification.unverified,
    estimateListings: byVerification.estimate,
  };

  let status: DataProvenanceStatus;
  if (totalListings === 0) {
    status = "empty";
  } else if (
    unknownSourceListings === 0 &&
    liveSourceListings === totalListings &&
    byVerification.stale === 0 &&
    byVerification.estimate === 0
  ) {
    status = "live";
  } else if (
    unknownSourceListings === 0 &&
    liveSourceListings === 0 &&
    bySourceType.manual === 0
  ) {
    status = "mock";
  } else {
    status = "mixed";
  }

  return {
    locationKey,
    pincode,
    generatedAt: new Date().toISOString(),
    status,
    counts,
    bySourceType,
    byVerification,
    lastObservedAt: lastObservedAt ? lastObservedAt.toISOString() : null,
    platforms: SUPPORTED_PLATFORMS.map((platform) => platforms.get(platform)!),
    disclaimer:
      "Provenance reflects stored listings only. LIVE means captured from permitted pages or authorized feeds; MANUAL means entered by a person; MOCK means simulated seed data. Always verify prices and fees in the merchant app before checkout.",
  };
}
