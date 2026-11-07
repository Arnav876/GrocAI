import { describe, it, expect } from "vitest";
import { describeRefreshOutcome } from "../services/refreshOutcome.js";

describe("Refresh outcome messaging", () => {
  it("reports full success only when every job completed", () => {
    const outcome = describeRefreshOutcome(
      { completed: ["a", "b", "c"], failed: [], blocked: [], pending: [] },
      3
    );
    expect(outcome.text).toContain("completed on all 3 platform jobs");
    expect(outcome.isError).toBe(false);
    expect(outcome.partial).toBe(false);
  });

  it("reports a partial refresh when one platform is blocked", () => {
    const outcome = describeRefreshOutcome(
      { completed: ["a", "b"], failed: [], blocked: ["c"], pending: [] },
      3
    );
    expect(outcome.text).toContain("Partial refresh: 2 of 3");
    expect(outcome.text).toContain("1 blocked");
    expect(outcome.text).toContain("Cached prices were kept");
    expect(outcome.isError).toBe(true);
    expect(outcome.partial).toBe(true);
  });

  it("does not claim success when everything was blocked or pending", () => {
    const blocked = describeRefreshOutcome(
      { completed: [], failed: [], blocked: ["a", "b"], pending: [] },
      2
    );
    expect(blocked.text).toContain("No platform refreshed");
    expect(blocked.text).toContain("cached prices were kept");
    expect(blocked.isError).toBe(true);

    const pending = describeRefreshOutcome(
      { completed: [], failed: [], blocked: [], pending: ["a"] },
      1
    );
    expect(pending.text).toContain("still queued");
    expect(pending.isError).toBe(true);
  });
});
