export const DEFAULT_PRICE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

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
