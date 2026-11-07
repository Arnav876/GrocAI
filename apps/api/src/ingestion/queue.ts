import { PrismaClient } from "@prisma/client";
import { PlatformId } from "@groqai/shared";

export interface EnqueueJobOptions {
  platform: PlatformId;
  queries: string[];
  locationKey?: string;
  priority?: number;
}

export class PostgresScrapeQueue {
  constructor(private prisma: PrismaClient) {}

  async enqueue(options: EnqueueJobOptions): Promise<string> {
    const job = await this.prisma.scrapeJob.create({
      data: {
        platform: options.platform,
        queries: options.queries,
        locationKey: options.locationKey || "delhi_110001",
        priority: options.priority || 0,
        status: "queued",
      },
    });
    return job.id;
  }

  async claimNext(workerId: string): Promise<any | null> {
    // Check and claim next job using atomic update
    const now = new Date(Date.now() + 1000);

    return await this.prisma.$transaction(async (tx) => {
      // Find candidate job
      const candidate = await tx.scrapeJob.findFirst({
        where: {
          status: "queued",
          scheduledFor: { lte: now },
        },
        orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
      });

      if (!candidate) return null;

      // Atomically claim the job
      const claimed = await tx.scrapeJob.update({
        where: { id: candidate.id },
        data: {
          status: "running",
          lockedBy: workerId,
          lockedAt: now,
          attempts: { increment: 1 },
        },
      });

      return claimed;
    });
  }

  async complete(jobId: string, scrapeRunId?: string): Promise<void> {
    await this.prisma.scrapeJob.update({
      where: { id: jobId },
      data: {
        status: "completed",
        completedAt: new Date(),
        scrapeRunId,
        lockedBy: null,
      },
    });
  }

  async fail(jobId: string, error: string, canRetry: boolean = true): Promise<void> {
    const job = await this.prisma.scrapeJob.findUnique({ where: { id: jobId } });
    if (!job) return;

    if (canRetry && job.attempts < job.maxAttempts) {
      // Exponential backoff
      const delayMs = Math.min(1000 * Math.pow(2, job.attempts), 30000);
      const nextRun = new Date(Date.now() + delayMs);

      await this.prisma.scrapeJob.update({
        where: { id: jobId },
        data: {
          status: "queued",
          scheduledFor: nextRun,
          error,
          lockedBy: null,
          lockedAt: null,
        },
      });
    } else {
      await this.prisma.scrapeJob.update({
        where: { id: jobId },
        data: {
          status: "failed",
          error,
          completedAt: new Date(),
          lockedBy: null,
        },
      });
    }
  }

  async markBlocked(jobId: string, error: string): Promise<void> {
    await this.prisma.scrapeJob.update({
      where: { id: jobId },
      data: {
        status: "blocked",
        error,
        completedAt: new Date(),
        lockedBy: null,
      },
    });
  }

  async recoverStuckJobs(staleThresholdMs: number = 180000): Promise<number> {
    const cutoff = new Date(Date.now() - staleThresholdMs);

    const result = await this.prisma.scrapeJob.updateMany({
      where: {
        status: "running",
        lockedAt: { lt: cutoff },
      },
      data: {
        status: "queued",
        lockedBy: null,
        lockedAt: null,
      },
    });

    if (result.count > 0) {
      console.warn(`[Queue] Recovered ${result.count} stuck jobs back to queued state`);
    }

    return result.count;
  }

  async getStats(): Promise<{ queued: number; running: number; completed: number; failed: number; blocked: number }> {
    const counts = await this.prisma.scrapeJob.groupBy({
      by: ["status"],
      _count: { id: true },
    });

    const stats = { queued: 0, running: 0, completed: 0, failed: 0, blocked: 0 };
    for (const c of counts) {
      if (c.status in stats) {
        (stats as any)[c.status] = c._count.id;
      }
    }
    return stats;
  }
}

