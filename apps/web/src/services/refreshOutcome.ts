export interface IngestionOutcome {
  completed: string[];
  failed: string[];
  blocked: string[];
  pending: string[];
}

export interface RefreshOutcomeDescription {
  text: string;
  isError: boolean;
  partial: boolean;
}

/**
 * Never lets a partial refresh read as a full success. If any platform was
 * blocked, failed, or is still pending, the message says so explicitly and
 * notes that cached prices were kept for those platforms.
 */
export function describeRefreshOutcome(
  outcome: IngestionOutcome,
  totalJobs?: number
): RefreshOutcomeDescription {
  const completed = outcome.completed.length;
  const total =
    totalJobs ??
    completed + outcome.failed.length + outcome.blocked.length + outcome.pending.length;

  if (total === 0) {
    return {
      text: "No ingestion jobs were queued; showing cached prices.",
      isError: true,
      partial: false,
    };
  }

  if (completed === total) {
    return {
      text: `Live refresh completed on all ${total} platform job${total === 1 ? "" : "s"}. Prices reflect the latest verified observations.`,
      isError: false,
      partial: false,
    };
  }

  const skipped: string[] = [];
  if (outcome.blocked.length > 0) skipped.push(`${outcome.blocked.length} blocked`);
  if (outcome.failed.length > 0) skipped.push(`${outcome.failed.length} failed`);
  if (outcome.pending.length > 0) skipped.push(`${outcome.pending.length} still pending`);

  if (completed > 0) {
    return {
      text: `Partial refresh: ${completed} of ${total} platform jobs completed (${skipped.join(
        ", "
      )}). Cached prices were kept for platforms that did not refresh.`,
      isError: true,
      partial: true,
    };
  }

  if (outcome.blocked.length > 0) {
    return {
      text: `No platform refreshed (${skipped.join(
        ", "
      )}). Automated capture was blocked by rate limits or an access wall; cached prices were kept unchanged.`,
      isError: true,
      partial: false,
    };
  }

  if (outcome.failed.length > 0) {
    return {
      text: "Live refresh failed. Cached prices were kept unchanged.",
      isError: true,
      partial: false,
    };
  }

  return {
    text: "Refresh is still queued (no worker picked it up yet). Showing cached prices.",
    isError: true,
    partial: false,
  };
}
