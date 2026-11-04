import { PlatformId, SUPPORTED_PLATFORMS } from "@groqai/shared";
import { IPlatformConnector } from "./types.js";
import { FallbackPlatformConnector, IntegrationMode } from "./fallbackHierarchy.js";
import { ICartAdapter, NullCartAdapter } from "./cartAdapter.js";
import {
  BlinkitAdapter,
  ZeptoAdapter,
  InstamartAdapter,
  BigBasketAdapter,
  IGroceryPlatformAdapter,
} from "./adapters/index.js";
import { PrismaClient } from "@prisma/client";

export class ConnectorRegistry {
  private adapters = new Map<PlatformId, IGroceryPlatformAdapter>();
  private connectors = new Map<PlatformId, FallbackPlatformConnector>();
  private cartAdapters = new Map<PlatformId, ICartAdapter>();
  private killSwitches = new Map<PlatformId, boolean>();
  private requestStats = new Map<
    PlatformId,
    { total: number; success: number; failure: number; latencyTotalMs: number }
  >();

  constructor(private prisma: PrismaClient) {
    this.adapters.set("blinkit", new BlinkitAdapter(prisma));
    this.adapters.set("zepto", new ZeptoAdapter(prisma));
    this.adapters.set("instamart", new InstamartAdapter(prisma));
    this.adapters.set("bigbasket", new BigBasketAdapter(prisma));

    for (const pid of SUPPORTED_PLATFORMS) {
      this.connectors.set(pid, new FallbackPlatformConnector(pid, prisma));
      // Ship honest NullCartAdapter for every platform returning unsupported
      this.cartAdapters.set(pid, new NullCartAdapter(pid));
      this.killSwitches.set(pid, false);
      this.requestStats.set(pid, { total: 0, success: 0, failure: 0, latencyTotalMs: 0 });
    }
  }

  getAdapter(platformId: PlatformId): IGroceryPlatformAdapter {
    if (this.killSwitches.get(platformId)) {
      throw new Error(`Platform adapter for ${platformId} has been disabled by kill switch`);
    }
    const adapter = this.adapters.get(platformId);
    if (!adapter) {
      throw new Error(`No adapter registered for platform ${platformId}`);
    }
    return adapter;
  }

  getAdapterSafe(platformId: PlatformId): IGroceryPlatformAdapter | undefined {
    return this.adapters.get(platformId);
  }

  getAllAdapters(): IGroceryPlatformAdapter[] {
    return SUPPORTED_PLATFORMS.map((pid) => this.getAdapter(pid));
  }

  get(platformId: PlatformId): FallbackPlatformConnector {
    if (this.killSwitches.get(platformId)) {
      throw new Error(`Platform connector for ${platformId} has been disabled by kill switch`);
    }
    const conn = this.connectors.get(platformId);
    if (!conn) {
      throw new Error(`No connector registered for platform ${platformId}`);
    }
    return conn;
  }

  getConnectorSafe(platformId: PlatformId): FallbackPlatformConnector | undefined {
    return this.connectors.get(platformId);
  }

  getCartAdapter(platformId: PlatformId): ICartAdapter {
    const adapter = this.cartAdapters.get(platformId);
    if (!adapter) {
      return new NullCartAdapter(platformId);
    }
    return adapter;
  }

  setCartAdapter(platformId: PlatformId, adapter: ICartAdapter): void {
    this.cartAdapters.set(platformId, adapter);
  }

  setKillSwitch(platformId: PlatformId, disabled: boolean): void {
    this.killSwitches.set(platformId, disabled);
    console.log(
      `[GroqAI Registry] Platform ${platformId} kill switch set to: ${
        disabled ? "ACTIVE (Disabled)" : "Inactive (Enabled)"
      }`
    );
  }

  isKillSwitchActive(platformId: PlatformId): boolean {
    return !!this.killSwitches.get(platformId);
  }

  setMode(platformId: PlatformId, mode: IntegrationMode): void {
    const conn = this.connectors.get(platformId);
    if (conn) {
      conn.setMode(mode);
    }
    const adapter = this.adapters.get(platformId);
    if (adapter) {
      adapter.setMode(mode);
    }
  }

  getMode(platformId: PlatformId): IntegrationMode {
    const conn = this.connectors.get(platformId);
    return conn ? conn.getMode() : "mock";
  }

  getAll(): FallbackPlatformConnector[] {
    return SUPPORTED_PLATFORMS.map((pid) => this.get(pid));
  }

  recordRequest(platformId: PlatformId, success: boolean, durationMs: number): void {
    const stats = this.requestStats.get(platformId);
    if (stats) {
      stats.total++;
      if (success) stats.success++;
      else stats.failure++;
      stats.latencyTotalMs += durationMs;
    }
  }

  getMetrics(platformId: PlatformId) {
    const stats = this.requestStats.get(platformId) || {
      total: 0,
      success: 0,
      failure: 0,
      latencyTotalMs: 0,
    };
    const conn = this.connectors.get(platformId);
    const cbMetrics = conn?.getCircuitBreakerMetrics();
    const avgLatency = stats.total > 0 ? Math.round(stats.latencyTotalMs / stats.total) : 85;

    return {
      totalRequests: stats.total,
      successfulRequests: stats.success,
      failedRequests: stats.failure,
      errorRate: stats.total > 0 ? Number((stats.failure / stats.total).toFixed(3)) : 0.0,
      avgLatencyMs: avgLatency,
      circuitBreaker: cbMetrics,
    };
  }
}
