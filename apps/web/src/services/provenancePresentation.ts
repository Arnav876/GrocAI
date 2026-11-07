import { DataProvenance } from "@groqai/shared";

export type ProvenanceTone = "live" | "mixed" | "mock" | "empty";

export interface ProvenancePresentation {
  tone: ProvenanceTone;
  badge: string;
  message: string;
  detail: string;
}

function pluralize(count: number, singular: string, plural: string = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

/**
 * Produces the banner copy. Kept pure so the honesty rules are testable and
 * cannot drift from the aggregate returned by the API.
 */
export function describeProvenance(provenance: DataProvenance): ProvenancePresentation {
  const { counts, status, pincode } = provenance;

  if (status === "empty") {
    return {
      tone: "empty",
      badge: "NO DATA",
      message: `No prices captured for pincode ${pincode} yet.`,
      detail:
        "Search or refresh a product to queue live capture. Nothing is shown as live until it is actually captured.",
    };
  }

  if (status === "mock") {
    return {
      tone: "mock",
      badge: "MOCK DATA",
      message: `Simulated catalog feeds for pincode ${pincode} — no live prices captured.`,
      detail: `${pluralize(counts.mockListings, "simulated listing")}. Estimates only; verify in the merchant app.`,
    };
  }

  if (status === "live") {
    return {
      tone: "live",
      badge: "LIVE DATA",
      message: `${counts.liveSourceListings} of ${pluralize(counts.totalListings, "listing")} captured live for pincode ${pincode}.`,
      detail: `${counts.liveVerifiedListings} live-verified · ${counts.staleListings} stale · ${counts.unavailableListings} unavailable. Verify at checkout.`,
    };
  }

  const unknownNote =
    counts.unknownSourceListings > 0
      ? ` · ${counts.unknownSourceListings} unknown source`
      : "";
  return {
    tone: "mixed",
    badge: "MIXED DATA",
    message: `${counts.liveSourceListings} live · ${counts.manualListings} manual · ${counts.mockListings} simulated listings for pincode ${pincode}.`,
    detail: `${counts.liveVerifiedListings} live-verified · ${counts.staleListings} stale${unknownNote}. Simulated and manual prices are labeled per listing; verify at checkout.`,
  };
}
