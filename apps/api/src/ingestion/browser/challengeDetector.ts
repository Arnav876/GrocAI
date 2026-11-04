import { ChallengeDetectionResult } from "../types.js";

const CHALLENGE_KEYWORDS = [
  "cloudflare",
  "turnstile",
  "perimeterx",
  "datadome",
  "captcha",
  "recaptcha",
  "hcaptcha",
  "access denied",
  "security check",
  "unusual traffic",
  "blocked",
  "just a moment",
];

export async function detectChallenge(
  statusCode?: number,
  title?: string,
  bodyText?: string
): Promise<ChallengeDetectionResult> {
  if (statusCode === 403) {
    return {
      isBlocked: true,
      statusCode: 403,
      reason: `HTTP 403 Forbidden: edge gatekeeper blocked access`,
    };
  }

  if (statusCode === 202) {
    return {
      isBlocked: true,
      statusCode: 202,
      reason: `HTTP 202 Interstitial: platform presented challenge token gate`,
    };
  }

  if (statusCode === 429) {
    return {
      isBlocked: true,
      statusCode: 429,
      reason: `HTTP 429 Too Many Requests: platform rate limit reached`,
    };
  }

  const titleLower = (title || "").toLowerCase();
  for (const kw of CHALLENGE_KEYWORDS) {
    if (titleLower.includes(kw)) {
      return {
        isBlocked: true,
        statusCode,
        reason: `Anti-bot gate detected in title: "${title}" (matched '${kw}')`,
      };
    }
  }

  const bodyLower = (bodyText || "").toLowerCase();
  for (const kw of ["perimeterx", "datadome", "cloudflare turnstile", "verify you are human"]) {
    if (bodyLower.includes(kw)) {
      return {
        isBlocked: true,
        statusCode,
        reason: `Anti-bot gate detected in body (matched '${kw}')`,
      };
    }
  }

  return { isBlocked: false, statusCode };
}
