import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { PrismaClient } from "@prisma/client";
import { ObscuraService, obscuraService } from "../ingestion/browser/obscuraService.js";
import { browserManager } from "../ingestion/browser/manager.js";
import { createServer } from "../server.js";

describe("Obscura Anti-Detect Browser Engine Integration", () => {
  let prisma: PrismaClient;
  let app: any;
  const testService = new ObscuraService({
    port: 9230,
    host: "127.0.0.1",
    stealth: true,
    allowPrivateNetwork: true,
  });

  beforeAll(async () => {
    prisma = new PrismaClient();
    app = createServer(prisma);
  });

  afterAll(async () => {
    await testService.stop();
    await obscuraService.stop();
    await browserManager.closeAll();
    await prisma.$disconnect();
  });

  it("resolves the downloaded Obscura binary correctly", () => {
    const binPath = testService.resolveBinPath();
    expect(binPath).not.toBeNull();
    expect(binPath).toContain("tools/obscura/obscura");
  });

  it("reports status when stopped", async () => {
    const status = await testService.getStatus();
    expect(status.available).toBe(true);
    expect(status.cdpUrl).toBe("http://127.0.0.1:9230");
  });

  it("spawns Obscura daemon and responds to /json/version", async () => {
    const { cdpUrl, managed } = await testService.start();
    expect(cdpUrl).toBe("http://127.0.0.1:9230");
    expect(managed).toBe(true);

    const isHealthy = await testService.isHealthy();
    expect(isHealthy).toBe(true);

    const version = await testService.getVersion();
    expect(version).not.toBeNull();
    expect(version?.Browser).toBeDefined();
    expect(version?.["Protocol-Version"]).toBeDefined();
  }, 15000);

  it("connects Playwright over CDP and navigates to a test page", async () => {
    const { browser, page } = await testService.connectPlaywright();
    expect(browser.isConnected()).toBe(true);

    await page.goto("https://httpbin.org/get", { timeout: 15000 });
    const content = await page.textContent("body");
    expect(content).toContain("httpbin.org");

    await page.close();
    await browser.close();
  }, 20000);

  it("scrapes a web page via scrapePage helper", async () => {
    const result = await testService.scrapePage("https://httpbin.org/get", {
      timeout: 15000,
    });
    expect(result.status).toBe(200);
    expect(result.content).toContain("headers");
    expect(result.durationMs).toBeGreaterThan(0);
  }, 20000);

  it("BrowserManager uses Obscura when OBSCURA_ENABLED=true", async () => {
    process.env.OBSCURA_ENABLED = "true";
    process.env.OBSCURA_PORT = "9230";

    const context = await browserManager.getContext("blinkit");
    expect(context).toBeDefined();

    const page = await context.newPage();
    await page.goto("https://httpbin.org/get", { timeout: 15000 });
    const text = await page.textContent("body");
    expect(text).toContain("httpbin.org");

    await page.close();
    await browserManager.closeContext("blinkit");
  }, 20000);

  describe("Admin API Endpoints (/api/admin/obscura)", () => {
    it("GET /api/admin/obscura/status returns engine metadata", async () => {
      const res = await request(app).get("/api/admin/obscura/status");
      expect(res.status).toBe(200);
      expect(res.body.available).toBe(true);
      expect(res.body.cdpUrl).toBeDefined();
    });

    it("POST /api/admin/obscura/test executes a scrape using Obscura", async () => {
      const res = await request(app)
        .post("/api/admin/obscura/test")
        .send({ url: "https://httpbin.org/get" });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.content).toContain("httpbin.org");
    }, 20000);
  });
});
