import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { PostgresScrapeQueue } from "../ingestion/queue.js";

const prisma = new PrismaClient();

describe("Epic 2 — Postgres Job Queue & Concurrency Isolation", () => {
  const queue = new PostgresScrapeQueue(prisma);
  const createdJobIds: string[] = [];

  beforeEach(async () => {
    // Ensure clean queue state for each test
    await prisma.scrapeJob.deleteMany({});
  });

  afterAll(async () => {
    await prisma.scrapeJob.deleteMany({}).catch(() => {});
    await prisma.$disconnect();
  });

  it("enqueues jobs and retrieves accurate queue statistics", async () => {
    const jobId = await queue.enqueue({
      platform: "blinkit",
      queries: ["Amul milk"],
      locationKey: "delhi_110001",
      priority: 10,
    });
    createdJobIds.push(jobId);

    const stats = await queue.getStats();
    expect(stats.queued).toBeGreaterThanOrEqual(1);

    const job = await prisma.scrapeJob.findUnique({ where: { id: jobId } });
    expect(job).not.toBeNull();
    expect(job!.platform).toBe("blinkit");
    expect(job!.status).toBe("queued");
    expect(job!.priority).toBe(10);

    const claimed = await queue.claimNext("worker-0");
    if (claimed) await queue.complete(claimed.id);
  });

  it("prevents two workers from processing the same job (concurrency isolation)", async () => {
    const jobId = await queue.enqueue({
      platform: "zepto",
      queries: ["eggs"],
      priority: 5,
    });
    createdJobIds.push(jobId);

    // Worker 1 claims
    const claim1 = await queue.claimNext("worker-1");
    expect(claim1).not.toBeNull();
    expect(claim1!.id).toBe(jobId);
    expect(claim1!.lockedBy).toBe("worker-1");
    expect(claim1!.status).toBe("running");

    // Worker 2 attempts to claim while Worker 1 is running
    const claim2 = await queue.claimNext("worker-2");
    // Should NOT get the same job
    if (claim2) {
      expect(claim2.id).not.toBe(jobId);
    } else {
      expect(claim2).toBeNull();
    }

    // Worker 1 completes the job
    await queue.complete(jobId);
    const completedJob = await prisma.scrapeJob.findUnique({ where: { id: jobId } });
    expect(completedJob!.status).toBe("completed");
  });

  it("recovers stuck jobs when a worker dies mid-job", async () => {
    const jobId = await queue.enqueue({
      platform: "bigbasket",
      queries: ["atta"],
    });
    createdJobIds.push(jobId);

    // Simulate worker claiming and dying: manually set lockedAt to 5 minutes ago
    const past = new Date(Date.now() - 300000);
    await prisma.scrapeJob.update({
      where: { id: jobId },
      data: {
        status: "running",
        lockedBy: "dead-worker",
        lockedAt: past,
      },
    });

    // Run recovery
    const recovered = await queue.recoverStuckJobs(120000);
    expect(recovered).toBeGreaterThanOrEqual(1);

    const recoveredJob = await prisma.scrapeJob.findUnique({ where: { id: jobId } });
    expect(recoveredJob!.status).toBe("queued");
    expect(recoveredJob!.lockedBy).toBeNull();
  });

  it("applies exponential backoff on retryable failures", async () => {
    const jobId = await queue.enqueue({
      platform: "blinkit",
      queries: ["butter"],
    });
    createdJobIds.push(jobId);

    await queue.claimNext("worker-retry-test");
    await queue.fail(jobId, "Transient network timeout", true);

    const retriedJob = await prisma.scrapeJob.findUnique({ where: { id: jobId } });
    expect(retriedJob!.status).toBe("queued");
    expect(retriedJob!.attempts).toBe(1);
    expect(retriedJob!.scheduledFor.getTime()).toBeGreaterThan(Date.now());
  });
});
