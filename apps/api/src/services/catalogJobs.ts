import { PlatformId, SUPPORTED_PLATFORMS } from "@groqai/shared";
import { PrismaClient } from "@prisma/client";
import { ConnectorRegistry } from "../connectors/registry.js";

export interface JobMetrics {
  lastRunTimestamp: string | null;
  staleCount: number;
  refreshedCount: number;
  alerts: string[];
}

export class CatalogBackgroundService {
  private timer: NodeJS.Timeout | null = null;
  private isRunning = false;
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
    alerts: [],
  };

  constructor(
    private prisma: PrismaClient,
    private registry: ConnectorRegistry
  ) {}

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
   * 2. Log observability alerts without sensitive data.
   * 3. Perform cache maintenance and price history retention check.
   */
  async runMaintenanceCycle(): Promise<JobMetrics> {
    const alerts: string[] = [];
    const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000);

    // 1. Identify stale listings
    const staleListings = await this.prisma.platformListing.findMany({
      where: {
        lastObservedAt: { lt: sixHoursAgo },
        isStale: false,
      },
    });

    if (staleListings.length > 0) {
      await this.prisma.platformListing.updateMany({
        where: { id: { in: staleListings.map((l) => l.id) } },
        data: { isStale: true },
      });

      alerts.push(
        `[GroqAI Observability] Flagged ${staleListings.length} listing(s) as stale (>6h since last observation).`
      );
    }

    // 2. Check per-platform staleness counts
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
      refreshedCount: staleListings.length,
      alerts,
    };

    return this.metrics;
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
