import { describe, it, expect, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { ConnectorRegistry } from "../connectors/registry.js";
import { CatalogBackgroundService } from "../services/catalogJobs.js";
import { PostgresScrapeQueue } from "../ingestion/queue.js";

describe("Phase 2 — Scheduler refresh enqueueing", () => {
  const prisma = new PrismaClient();
  const registry = new ConnectorRegistry(prisma);
  const queue = new PostgresScrapeQueue(prisma);
  const service = new CatalogBackgroundService(prisma, registry, queue);
  const testLocation = "test_scheduler_110099";

  afterAll(async () => {
    await prisma.scrapeJob.deleteMany({ where: { locationKey: testLocation } }).catch(() => {});
    await prisma.$disconnect();
  });

  it("groups stale listings into one job per platform/location and skips Instamart", async () => {
    const result = await (service as any).enqueueStaleRefreshes([
      { platform: "blinkit", locationKey: testLocation, product: { name: "Amul Taaza Toned Fresh Milk" } },
      { platform: "blinkit", locationKey: testLocation, product: { name: "Amul Gold Full Cream Fresh Milk" } },
      { platform: "instamart", locationKey: testLocation, product: { name: "Manual Only Product" } },
    ]);

    expect(result.enqueued).toBe(1);
    expect(result.skipped).toEqual([]);

    const jobs = await prisma.scrapeJob.findMany({
      where: { locationKey: testLocation },
    });
    expect(jobs).toHaveLength(1);
    expect(jobs[0].platform).toBe("blinkit");
    expect(jobs[0].status).toBe("queued");
    expect(jobs[0].queries).toEqual([
      "Amul Taaza Toned Fresh Milk",
      "Amul Gold Full Cream Fresh Milk",
    ]);
    expect(jobs.some((j) => j.platform === "instamart")).toBe(false);
  });

  it("does not enqueue a second job while one is already queued for the same platform/location", async () => {
    const result = await (service as any).enqueueStaleRefreshes([
      { platform: "blinkit", locationKey: testLocation, product: { name: "Amul Taaza Toned Fresh Milk" } },
    ]);

    expect(result.enqueued).toBe(0);
    expect(result.skipped).toContain(`blinkit@${testLocation}`);

    const count = await prisma.scrapeJob.count({
      where: { locationKey: testLocation, platform: "blinkit" },
    });
    expect(count).toBe(1);
  });
});
