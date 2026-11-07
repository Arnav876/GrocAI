import { PlatformId } from "@groqai/shared";

export interface BlockedTargetResponse {
  status: number;
  url: string;
  bodySnippet?: string;
}

/**
 * A platform can serve a normal HTML shell while denying the private JSON
 * endpoint the scraper actually needs. That is an anti-bot / access-control
 * block, not an empty search result, and must be reported as blocked.
 */
export function describeBlockedTargetResponse(
  platform: PlatformId,
  responses: BlockedTargetResponse[]
): string | null {
  if (responses.length === 0) return null;

  const first = responses[0];
  const accessDenied = /access denied/i.test(first.bodySnippet || "");
  const detail = accessDenied ? "Access Denied" : "edge denied the data endpoint";
  const count = responses.length === 1 ? "" : ` (${responses.length} denied attempts)`;

  return `${platform} target endpoint blocked with HTTP ${first.status}: ${detail}${count} — ${first.url}`;
}
