export const DEFAULT_PRICE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours (staleness threshold)
export const DEFAULT_CACHE_FRESHNESS_TTL_MS = 60 * 60 * 1000; // 1 hour (reuse without refresh)
export const LIVE_VERIFIED_THRESHOLD_MS = 15 * 60 * 1000; // 15 minutes (live-verified indicator)

export function isPriceStale(observedAtIso: string, ttlMs: number = DEFAULT_PRICE_TTL_MS): boolean {
  try {
    const observedTime = new Date(observedAtIso).getTime();
    if (isNaN(observedTime)) return true;
    const now = Date.now();
    return now - observedTime > ttlMs;
  } catch {
    return true;
  }
}

export function isPriceFresh(observedAtIso: string, ttlMs: number = DEFAULT_CACHE_FRESHNESS_TTL_MS): boolean {
  try {
    const observedTime = new Date(observedAtIso).getTime();
    if (isNaN(observedTime)) return false;
    const now = Date.now();
    return now - observedTime <= ttlMs;
  } catch {
    return false;
  }
}

export function determinePriceVerificationStatus(
  observedAtIso: string | undefined | null,
  sourceType: string = "mock",
  availability: string = "available"
): "live_verified" | "cached" | "stale" | "unverified" | "unavailable" | "estimate" {
  if (availability === "unavailable") {
    return "unavailable";
  }

  if (!observedAtIso) {
    return sourceType === "mock" ? "estimate" : "unverified";
  }

  const observedTime = new Date(observedAtIso).getTime();
  if (isNaN(observedTime)) {
    return sourceType === "mock" ? "estimate" : "unverified";
  }

  const ageMs = Date.now() - observedTime;

  // Stale check across all sources
  if (ageMs > DEFAULT_PRICE_TTL_MS) {
    return "stale";
  }

  // Live verified: recent fetch from authorized API, permitted page, or partner feed
  if (sourceType === "authorized_api" || sourceType === "permitted_page") {
    if (ageMs <= LIVE_VERIFIED_THRESHOLD_MS) {
      return "live_verified";
    }
    return "cached";
  }

  if (sourceType === "partner_feed") {
    if (ageMs <= DEFAULT_CACHE_FRESHNESS_TTL_MS) {
      return "live_verified";
    }
    return "cached";
  }

  if (sourceType === "manual") {
    return "cached";
  }

  // Mock / internal test fixtures are marked as estimate / unverified
  return "estimate";
}

export function formatTimeAgo(observedAtIso: string): string {
  try {
    const observedTime = new Date(observedAtIso).getTime();
    if (isNaN(observedTime)) return "Unknown";
    const diffMs = Math.max(0, Date.now() - observedTime);
    const diffMinutes = Math.floor(diffMs / (60 * 1000));
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMinutes < 1) return "Just now";
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  } catch {
    return "Unknown";
  }
}
