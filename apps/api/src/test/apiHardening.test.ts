import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { PrismaClient } from "@prisma/client";
import { createServer } from "../server.js";

const prisma = new PrismaClient();
const ADMIN_KEY = "test-admin-secret";
const FEE_LOCATION = "delhi_560004";

describe("API hardening — admin auth and request correlation", () => {
  let openApp: any;
  let securedApp: any;

  beforeAll(async () => {
    openApp = createServer(prisma, { adminApiKey: null });
    securedApp = createServer(prisma, { adminApiKey: ADMIN_KEY });
    await prisma.platformFeeRule.deleteMany({ where: { locationKey: FEE_LOCATION } });
  });

  afterAll(async () => {
    await prisma.platformFeeRule.deleteMany({ where: { locationKey: FEE_LOCATION } });
    await prisma.$disconnect();
  });

  it("echoes a valid client request id and generates one when absent", async () => {
    const echoed = await request(openApp)
      .get("/api/health")
      .set("x-request-id", "trace-test-123");
    expect(echoed.status).toBe(200);
    expect(echoed.headers["x-request-id"]).toBe("trace-test-123");

    const generated = await request(openApp).get("/api/health");
    expect(generated.headers["x-request-id"]).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    );
  });

  it("advertises whether admin auth is enabled without exposing the key", async () => {
    const open = await request(openApp).get("/api/health");
    expect(open.body.adminAuthEnabled).toBe(false);
    expect(JSON.stringify(open.body)).not.toContain(ADMIN_KEY);

    const secured = await request(securedApp).get("/api/health");
    expect(secured.body.adminAuthEnabled).toBe(true);
    expect(JSON.stringify(secured.body)).not.toContain(ADMIN_KEY);
  });

  it("keeps admin routes usable in local mode and marks auth as disabled", async () => {
    const res = await request(openApp).post("/api/admin/platforms/blinkit/kill-switch");
    expect(res.status).toBe(200);
    expect(res.headers["x-admin-auth"]).toBe("disabled");

    await request(openApp).delete("/api/admin/platforms/blinkit/kill-switch");
  });

  it("requires the admin key for admin routes when configured", async () => {
    const missing = await request(securedApp).post("/api/admin/platforms/blinkit/kill-switch");
    expect(missing.status).toBe(401);
    expect(missing.body.error).toContain("Admin authentication required");
    expect(missing.body.requestId).toBeDefined();

    const wrong = await request(securedApp)
      .post("/api/admin/platforms/blinkit/kill-switch")
      .set("x-admin-key", "wrong-key");
    expect(wrong.status).toBe(401);

    const accepted = await request(securedApp)
      .post("/api/admin/platforms/blinkit/kill-switch")
      .set("x-admin-key", ADMIN_KEY);
    expect(accepted.status).toBe(200);
    expect(accepted.headers["x-admin-auth"]).toBe("ok");

    const restored = await request(securedApp)
      .delete("/api/admin/platforms/blinkit/kill-switch")
      .set("authorization", `Bearer ${ADMIN_KEY}`);
    expect(restored.status).toBe(200);
  });

  it("protects manual fee writes but keeps fee reads public", async () => {
    const payload = {
      locationKey: FEE_LOCATION,
      deliveryFeePaise: 2500,
      handlingFeePaise: 500,
      platformFeePaise: 200,
    };

    const blocked = await request(securedApp).put("/api/fees/zepto").send(payload);
    expect(blocked.status).toBe(401);

    const saved = await request(securedApp)
      .put("/api/fees/zepto")
      .set("x-admin-key", ADMIN_KEY)
      .send(payload);
    expect(saved.status).toBe(200);
    expect(saved.body.rule.sourceType).toBe("manual");

    const read = await request(securedApp).get(`/api/fees?locationKey=${FEE_LOCATION}`);
    expect(read.status).toBe(200);
    const zepto = read.body.rules.find((r: any) => r.platform === "zepto");
    expect(zepto.deliveryFeePaise).toBe(2500);
  });
});
