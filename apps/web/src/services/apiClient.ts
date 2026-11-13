import {
  CategoryInfo,
  DataProvenance,
  DataProvenanceSchema,
  OptimizationResponse,
  OptimizationResponseSchema,
  PlatformHealthStatus,
  ProductSummary,
  ShoppingHandoffResponse,
  ShoppingHandoffResponseSchema,
  OptimizationRequestSchema,
  ShoppingHandoffRequestSchema,
  BasketOptimizationRequest,
  BasketOptimizationResult,
  ShoppingHandoffPayload,
} from "@groqai/shared";
import { z } from "zod";
import { mockApiService } from "./mockApiService.js";

const API_BASE_URL = (import.meta as any).env?.VITE_API_BASE_URL || "";

export class GroqApiClient {
  private isUsingMock(): boolean {
    return !API_BASE_URL || API_BASE_URL.trim() === "";
  }

  async getHealth(): Promise<{
    status: string;
    uptime: number;
    mode: string;
    timestamp: string;
    platformKillSwitches?: Record<string, boolean>;
    ingestionModes?: Record<string, string>;
    capabilities?: {
      createCart: boolean;
      automatedCheckout: boolean;
      search?: boolean;
      livePrice?: boolean;
      searchDeepLink?: boolean;
      checklistHandoff?: boolean;
      deepLinks?: boolean;
      searchLinks?: boolean;
      markdownChecklist?: boolean;
    };
  }> {
    if (this.isUsingMock()) {
      return mockApiService.getHealth();
    }
    try {
      const res = await fetch(`${API_BASE_URL}/api/health`);
      if (!res.ok) throw new Error(`Health check failed: ${res.statusText}`);
      return res.json();
    } catch {
      return mockApiService.getHealth();
    }
  }

  async getCategories(): Promise<CategoryInfo[]> {
    if (this.isUsingMock()) {
      return mockApiService.getCategories();
    }
    const res = await fetch(`${API_BASE_URL}/api/categories`);
    if (!res.ok) throw new Error(`Failed to fetch categories: ${res.statusText}`);
    return res.json();
  }

  async getDataProvenance(pincode: string = "560064"): Promise<DataProvenance> {
    if (this.isUsingMock()) {
      return mockApiService.getDataProvenance(pincode);
    }
    const params = new URLSearchParams({ pincode });
    const res = await fetch(`${API_BASE_URL}/api/data-provenance?${params.toString()}`);
    if (!res.ok) throw new Error(`Failed to fetch data provenance: ${res.statusText}`);
    const data = await res.json();
    return DataProvenanceSchema.parse(data);
  }

  async searchProducts(
    query: string = "",
    category?: string,
    refresh?: boolean,
    pincode?: string
  ): Promise<ProductSummary[]> {
    if (this.isUsingMock()) {
      return mockApiService.searchProducts(query, category);
    }
    const params = new URLSearchParams();
    if (query) params.append("q", query);
    if (category) params.append("category", category);
    if (refresh) params.append("refresh", "true");
    if (pincode) params.append("pincode", pincode);
    const res = await fetch(`${API_BASE_URL}/api/products/search?${params.toString()}`);
    if (!res.ok) throw new Error(`Failed to search products: ${res.statusText}`);
    return res.json();
  }

  async getProductById(id: string, refresh?: boolean, pincode?: string): Promise<ProductSummary | null> {
    if (this.isUsingMock()) {
      return mockApiService.getProductById(id);
    }
    const params = new URLSearchParams();
    if (refresh) params.append("refresh", "true");
    if (pincode) params.append("pincode", pincode);
    const qs = params.toString() ? `?${params.toString()}` : "";
    const res = await fetch(`${API_BASE_URL}/api/products/${encodeURIComponent(id)}${qs}`);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Failed to fetch product: ${res.statusText}`);
    return res.json();
  }

  async refreshProduct(
    id: string,
    pincode?: string
  ): Promise<{
    product: ProductSummary;
    refresh: {
      status: string;
      jobIds: string[];
      platforms: string[];
      queries: string[];
      message: string;
    };
  }> {
    if (this.isUsingMock()) {
      const prod = await mockApiService.getProductById(id);
      if (!prod) throw new Error("Product not found");
      return {
        product: prod,
        refresh: {
          status: "cached",
          jobIds: [],
          platforms: [],
          queries: [],
          message: "Mock mode: no live refresh queued",
        },
      };
    }
    const res = await fetch(`${API_BASE_URL}/api/products/${encodeURIComponent(id)}/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pincode: pincode || "560064" }),
    });
    if (!res.ok) throw new Error(`Failed to refresh product prices: ${res.statusText}`);
    return res.json();
  }

  /**
   * Polls ingestion jobs until they reach a terminal state or the timeout
   * expires. Never claims success for jobs that are still queued.
   */
  async waitForIngestionJobs(
    jobIds: string[],
    timeoutMs: number = 90000
  ): Promise<{
    completed: string[];
    failed: string[];
    blocked: string[];
    pending: string[];
  }> {
    if (this.isUsingMock()) {
      return { completed: jobIds, failed: [], blocked: [], pending: [] };
    }

    const statuses = new Map<string, string>();
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      let allTerminal = true;
      for (const jobId of jobIds) {
        if (statuses.has(jobId)) continue;
        try {
          const job = await this.getIngestionJob(jobId);
          if (["completed", "failed", "blocked"].includes(job.status)) {
            statuses.set(jobId, job.status);
          } else {
            allTerminal = false;
          }
        } catch {
          allTerminal = false;
        }
      }
      if (allTerminal) break;
      await new Promise((resolve) => setTimeout(resolve, 2500));
    }

    const byStatus = (status: string) => jobIds.filter((id) => statuses.get(id) === status);
    return {
      completed: byStatus("completed"),
      failed: byStatus("failed"),
      blocked: byStatus("blocked"),
      pending: jobIds.filter((id) => !statuses.has(id)),
    };
  }

  async syncProducts(
    productIds?: string[],
    query?: string,
    pincode?: string,
    forceRefresh?: boolean
  ): Promise<any> {
    if (this.isUsingMock()) {
      return { totalSynced: productIds?.length || 0, outcomes: [] };
    }
    const res = await fetch(`${API_BASE_URL}/api/products/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productIds, query, pincode, forceRefresh }),
    });
    if (!res.ok) throw new Error(`Failed to sync products: ${res.statusText}`);
    return res.json();
  }

  async getSyncStatus(): Promise<any> {
    if (this.isUsingMock()) {
      return { adapters: [], cache: { freshListings: 40, staleListings: 0 } };
    }
    const res = await fetch(`${API_BASE_URL}/api/sync/status`);
    if (!res.ok) throw new Error(`Failed to fetch sync status: ${res.statusText}`);
    return res.json();
  }

  async getPlatforms(): Promise<PlatformHealthStatus[]> {
    if (this.isUsingMock()) {
      return mockApiService.getPlatforms();
    }
    try {
      const res = await fetch(`${API_BASE_URL}/api/platforms`);
      if (!res.ok) throw new Error(`Failed to fetch platforms: ${res.statusText}`);
      return res.json();
    } catch {
      return mockApiService.getPlatforms();
    }
  }

  async optimizeBasket(
    payload: BasketOptimizationRequest
  ): Promise<BasketOptimizationResult> {
    if (this.isUsingMock()) {
      return mockApiService.optimizeBasket(payload);
    }
    try {
      const res = await fetch(`${API_BASE_URL}/api/optimizations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `Optimization failed: ${res.statusText}`);
      }
      return res.json();
    } catch {
      return mockApiService.optimizeBasket(payload);
    }
  }

  async createOptimization(
    payload: z.input<typeof OptimizationRequestSchema>
  ): Promise<OptimizationResponse> {
    const validatedPayload = OptimizationRequestSchema.parse(payload);
    if (this.isUsingMock()) {
      return mockApiService.createOptimization(validatedPayload);
    }
    try {
      const res = await fetch(`${API_BASE_URL}/api/optimizations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validatedPayload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `Optimization failed: ${res.statusText}`);
      }
      const data = await res.json();
      return OptimizationResponseSchema.parse(data);
    } catch {
      return mockApiService.createOptimization(validatedPayload);
    }
  }

  async getOptimization(id: string): Promise<OptimizationResponse | null> {
    if (this.isUsingMock()) {
      return mockApiService.getOptimization(id);
    }
    try {
      const res = await fetch(`${API_BASE_URL}/api/optimizations/${encodeURIComponent(id)}`);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`Failed to fetch optimization: ${res.statusText}`);
      const data = await res.json();
      return OptimizationResponseSchema.parse(data);
    } catch {
      return mockApiService.getOptimization(id);
    }
  }

  async generateShoppingHandoff(payload: any): Promise<ShoppingHandoffPayload> {
    if (this.isUsingMock()) {
      return mockApiService.generateShoppingHandoff(payload);
    }
    try {
      const res = await fetch(`${API_BASE_URL}/api/shopping-handoff`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `Handoff generation failed: ${res.statusText}`);
      }
      return res.json();
    } catch {
      return mockApiService.generateShoppingHandoff(payload);
    }
  }

  async parseNLList(
    text: string,
    options?: { pincode?: string; optimize?: boolean }
  ): Promise<any> {
    if (this.isUsingMock()) {
      const { defaultNLParser } = await import("./naturalLanguageParser.js");
      return defaultNLParser.parse(text);
    }
    try {
      const res = await fetch(`${API_BASE_URL}/api/nl/parse`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, ...options }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Natural language parsing failed: ${res.statusText}`);
      }
      return res.json();
    } catch {
      const { defaultNLParser } = await import("./naturalLanguageParser.js");
      return defaultNLParser.parse(text);
    }
  }

  async createShoppingHandoff(
    payload: z.infer<typeof ShoppingHandoffRequestSchema>
  ): Promise<ShoppingHandoffResponse> {
    const validatedPayload = ShoppingHandoffRequestSchema.parse(payload);
    if (this.isUsingMock()) {
      return mockApiService.createShoppingHandoff(validatedPayload);
    }
    const res = await fetch(`${API_BASE_URL}/api/shopping-handoff`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validatedPayload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `Handoff generation failed: ${res.statusText}`);
    }
    const data = await res.json();
    return ShoppingHandoffResponseSchema.parse(data);
  }

  async enqueueRefresh(
    queries: string[],
    platforms: string[] = ["blinkit", "zepto", "bigbasket"],
    locationKey: string = "bengaluru_560064"
  ): Promise<{ status: string; jobId: string; jobIds: string[]; message: string }> {
    if (this.isUsingMock()) {
      return { status: "queued", jobId: "mock-job-1", jobIds: ["mock-job-1"], message: "Mock ingestion job" };
    }
    const res = await fetch(`${API_BASE_URL}/api/ingestion/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ queries, platforms, locationKey }),
    });
    if (!res.ok) throw new Error(`Refresh enqueue failed: ${res.statusText}`);
    return res.json();
  }

  async getIngestionJob(jobId: string): Promise<any> {
    if (this.isUsingMock()) {
      return { id: jobId, status: "completed", itemsFound: 5 };
    }
    const res = await fetch(`${API_BASE_URL}/api/ingestion/jobs/${encodeURIComponent(jobId)}`);
    if (!res.ok) throw new Error(`Failed to get ingestion job: ${res.statusText}`);
    return res.json();
  }

  async getIngestionStatus(): Promise<{
    queueDepth: { queued: number; running: number; completed: number; failed: number; blocked: number };
    lastRunByPlatform: Record<string, any>;
    blockedPlatforms: string[];
  }> {
    if (this.isUsingMock()) {
      return {
        queueDepth: { queued: 0, running: 0, completed: 0, failed: 0, blocked: 0 },
        lastRunByPlatform: {},
        blockedPlatforms: ["instamart"],
      };
    }
    const res = await fetch(`${API_BASE_URL}/api/ingestion/status`);
    if (!res.ok) throw new Error(`Failed to get ingestion status: ${res.statusText}`);
    return res.json();
  }

  async submitManualObservation(data: {
    platform?: string;
    title: string;
    priceRupees?: number;
    pricePaise?: number;
    packSize?: string;
    pincode?: string;
    productUrl?: string;
  }): Promise<any> {
    if (this.isUsingMock()) {
      return { message: "Manual observation saved (mock)" };
    }
    const res = await fetch(`${API_BASE_URL}/api/observations/manual`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Failed to submit manual price: ${res.statusText}`);
    }
    return res.json();
  }
}

export const apiClient = new GroqApiClient();
