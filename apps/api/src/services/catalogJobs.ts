import { PlatformId, SUPPORTED_PLATFORMS } from "@groqai/shared";
import { PrismaClient } from "@prisma/client";
import { ConnectorRegistry } from "../connectors/registry.js";
import { PostgresScrapeQueue } from "../ingestion/queue.js";

export interface JobMetrics {
  lastRunTimestamp: string | null;
  staleCount: number;
  refreshedCount: number;
  enqueuedJobs: number;
  skippedPlatforms: string[];
  alerts: string[];
}

export class CatalogBackgroundService {
  private timer: NodeJS.Timeout | null = null;
  private isRunning = false;
  private queue: PostgresScrapeQueue;
  private platformJobEnabled: Record<PlatformId, boolean> = {
    blinkit: true,
    zepto: true,
    instamart: true,
    bigbasket: true,
  };
  private metrics: JobMetrics = {
    lastRunTimestamp: null,
    staleCount: 0,
    refreshedCount: 0,
    enqueuedJobs: 0,
    skippedPlatforms: [],
    alerts: [],
  };

  constructor(
    private prisma: PrismaClient,
    private registry: ConnectorRegistry,
    queue?: PostgresScrapeQueue
  ) {
    this.queue = queue || new PostgresScrapeQueue(prisma);
  }

  setPlatformJobEnabled(platform: PlatformId, enabled: boolean): void {
    this.platformJobEnabled[platform] = enabled;
  }

  isPlatformJobEnabled(platform: PlatformId): boolean {
    return this.platformJobEnabled[platform] ?? true;
  }

  getMetrics(): JobMetrics {
    return { ...this.metrics };
  }

  /**
   * Run single maintenance cycle:
   * 1. Detect stale listings (>6 hours old) and flag them.
   * 2. Enqueue one polite refresh job per platform/location for stale data.
   * 3. Log observability alerts without sensitive data.
   */
  async runMaintenanceCycle(): Promise<JobMetrics> {
    const alerts: string[] = [];
    const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000);

    // 1. Identify newly stale listings
    const newlyStale = await this.prisma.platformListing.findMany({
      where: {
        lastObservedAt: { lt: sixHoursAgo },
        isStale: false,
      },
      select: { id: true },
    });

    if (newlyStale.length > 0) {
      await this.prisma.platformListing.updateMany({
        where: { id: { in: newlyStale.map((l) => l.id) } },
        data: { isStale: true },
      });

      alerts.push(
        `[GroqAI Observability] Flagged ${newlyStale.length} listing(s) as stale (>6h since last observation).`
      );
    }

    // 2. Enqueue refreshes for every stale listing, including ones that were
    // already stale because a previous scheduled run failed or was blocked.
    const staleListings = await this.prisma.platformListing.findMany({
      where: { isStale: true },
      include: { product: { select: { name: true } } },
      orderBy: { lastObservedAt: "asc" },
      take: 200,
    });

    const refresh = await this.enqueueStaleRefreshes(staleListings);

    // 3. Check per-platform staleness counts
    let totalStale = 0;
    for (const pid of SUPPORTED_PLATFORMS) {
      if (!this.platformJobEnabled[pid]) continue;

      const count = await this.prisma.platformListing.count({
        where: { platform: pid, isStale: true },
      });
      totalStale += count;
      if (count > 10) {
        alerts.push(
          `[GroqAI Alert] High stale data volume on ${pid}: ${count} items exceed 6h TTL.`
        );
      }
    }

    this.metrics = {
      lastRunTimestamp: new Date().toISOString(),
      staleCount: totalStale,
      refreshedCount: newlyStale.length,
      enqueuedJobs: refresh.enqueued,
      skippedPlatforms: refresh.skipped,
      alerts,
    };

    return this.metrics;
  }

  private async enqueueStaleRefreshes(
    staleListings: Array<{
      platform: string;
      locationKey: string;
      product: { name: string };
    }>
  ): Promise<{ enqueued: number; skipped: string[] }> {
    const groups = new Map<
      string,
      { platform: PlatformId; locationKey: string; queries: Set<string> }
    >();

    for (const listing of staleListings) {
      const platform = listing.platform as PlatformId;
      if (!SUPPORTED_PLATFORMS.includes(platform)) continue;
      // Instamart is manual/assisted only; never enqueue automated scrapes.
      if (platform === "instamart") continue;
      if (!this.platformJobEnabled[platform]) continue;

      const key = `${platform}|${listing.locationKey}`;
      const group = groups.get(key);
      if (group) {
        if (group.queries.size < 10) group.queries.add(listing.product.name);
      } else {
        groups.set(key, {
          platform,
          locationKey: listing.locationKey,
          queries: new Set([listing.product.name]),
        });
      }
    }

    let enqueued = 0;
    const skipped: string[] = [];

    for (const group of groups.values()) {
      const activeJob = await this.prisma.scrapeJob.findFirst({
        where: {
          platform: group.platform,
          locationKey: group.locationKey,
          status: { in: ["queued", "running"] },
        },
        select: { id: true },
      });

      if (activeJob) {
        skipped.push(`${group.platform}@${group.locationKey}`);
        continue;
      }

      await this.queue.enqueue({
        platform: group.platform,
        queries: Array.from(group.queries),
        locationKey: group.locationKey,
        priority: 1,
      });
      enqueued++;
    }

    return { enqueued, skipped };
  }

  startPeriodic(intervalMs: number = 60000): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.timer = setInterval(() => {
      this.runMaintenanceCycle().catch((err) => {
        console.error("[GroqAI Background Jobs] Error in maintenance cycle:", err);
      });
    }, intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.isRunning = false;
  }
}
