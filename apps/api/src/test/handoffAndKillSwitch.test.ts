import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { PrismaClient } from "@prisma/client";
import { createServer } from "../server.js";

describe("Phase 3 Handoff Integrity, Kill Switches & Admin Controls", () => {
  let prisma: PrismaClient;
  let app: any;

  beforeAll(() => {
    prisma = new PrismaClient();
    app = createServer(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("POST /api/shopping-handoff falls back to links_and_checklist when cart creation is unsupported, never claiming false success", async () => {
    // 1. Create an optimization first
    const optRes = await request(app)
      .post("/api/optimizations")
      .send({
        locationId: "delhi_110001",
        pincode: "110001",
        items: [{ query: "Amul Taaza Milk", quantity: 2, unit: "L" }],
        preferences: { strategy: "cheapest_single_platform" },
      });

    expect(optRes.status).toBe(201);
    const optId = optRes.body.id;

    // 2. Request shopping handoff
    const handoffRes = await request(app)
      .post("/api/shopping-handoff")
      .send({
        optimizationId: optId,
        strategy: "cheapest_single_platform",
      });

    expect(handoffRes.status).toBe(200);
    // Non-negotiable rule: Must return links_and_checklist and never claim automated_cart without partner approval
    expect(handoffRes.body.method).toBe("links_and_checklist");
    expect(handoffRes.body.notice).toContain("Payment happens on the platform");

    const platformGroup = handoffRes.body.platforms[0];
    expect(platformGroup).toHaveProperty("checklistText");
    expect(platformGroup).toHaveProperty("cartReviewUrl");
    expect(platformGroup.checklistText).toContain("Shopping List");
    expect(platformGroup.items[0].isDeepLink).toBe(false); // Honest flag: search link, not fake private deep link
  });

  it("admin kill-switch endpoint immediately disables a connector and updates platform health", async () => {
    // 1. Activate kill switch on Blinkit
    const killRes = await request(app).post("/api/admin/platforms/blinkit/kill-switch");
    expect(killRes.status).toBe(200);
    expect(killRes.body.killSwitchActive).toBe(true);

    // 2. Query /api/platforms to verify Blinkit is marked disabled
    const platformsRes = await request(app).get("/api/platforms");
    expect(platformsRes.status).toBe(200);
    const blinkitStatus = platformsRes.body.find((p: any) => p.id === "blinkit");
    expect(blinkitStatus.status).toBe("disabled");
    expect(blinkitStatus.enabled).toBe(false);

    // 3. Query /api/connectors/health
    const healthRes = await request(app).get("/api/connectors/health");
    expect(healthRes.status).toBe(200);
    const blinkitHealth = healthRes.body.connectors.find((c: any) => c.platform === "blinkit");
    expect(blinkitHealth.isKillSwitchActive).toBe(true);

    // 4. Deactivate kill switch
    const deleteRes = await request(app).delete("/api/admin/platforms/blinkit/kill-switch");
    expect(deleteRes.status).toBe(200);
    expect(deleteRes.body.killSwitchActive).toBe(false);

    // 5. Verify re-enabled status
    const platformsRes2 = await request(app).get("/api/platforms");
    const blinkitStatus2 = platformsRes2.body.find((p: any) => p.id === "blinkit");
    expect(blinkitStatus2.status).toBe("healthy");
    expect(blinkitStatus2.enabled).toBe(true);
  });

  it("admin mode endpoint switches connector integration mode at runtime", async () => {
    const res = await request(app)
      .post("/api/admin/platforms/zepto/mode")
      .send({ mode: "manual" });

    expect(res.status).toBe(200);
    expect(res.body.mode).toBe("manual");

    const platformsRes = await request(app).get("/api/platforms");
    const zepto = platformsRes.body.find((p: any) => p.id === "zepto");
    expect(zepto.mode).toBe("manual");

    // Reset back to mock
    await request(app).post("/api/admin/platforms/zepto/mode").send({ mode: "mock" });
  });

  it("rejects invalid platform modes with HTTP 400", async () => {
    const res = await request(app)
      .post("/api/admin/platforms/zepto/mode")
      .send({ mode: "invalid_unsupported_mode" });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Invalid mode");
  });
});
