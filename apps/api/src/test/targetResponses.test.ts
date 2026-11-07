import { describe, it, expect } from "vitest";
import {
  BlockedTargetResponse,
  describeBlockedTargetResponse,
} from "../ingestion/browser/targetResponses.js";

function blocked(overrides: Partial<BlockedTargetResponse> = {}): BlockedTargetResponse {
  return {
    status: 403,
    url: "https://www.bigbasket.com/listing-svc/v2/products?type=ps&slug=Milk",
    bodySnippet: "<HTML><HEAD><TITLE>Access Denied</TITLE></HEAD></HTML>",
    ...overrides,
  };
}

describe("Blocked target endpoint detection", () => {
  it("returns null when the data endpoint was not denied", () => {
    expect(describeBlockedTargetResponse("bigbasket", [])).toBeNull();
  });

  it("reports an Akamai access denial as blocked instead of zero results", () => {
    const reason = describeBlockedTargetResponse("bigbasket", [blocked()]);
    expect(reason).toContain("bigbasket target endpoint blocked with HTTP 403");
    expect(reason).toContain("Access Denied");
    expect(reason).toContain("/listing-svc/v2/products");
  });

  it("counts repeated denied attempts and reports edge denials without a body", () => {
    const reason = describeBlockedTargetResponse("zepto", [
      blocked({ status: 429, bodySnippet: "" }),
      blocked({ status: 429, bodySnippet: "" }),
    ]);
    expect(reason).toContain("HTTP 429");
    expect(reason).toContain("edge denied the data endpoint");
    expect(reason).toContain("2 denied attempts");
  });
});
