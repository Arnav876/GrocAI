import {
  CategoryInfo,
  OptimizationResponse,
  OptimizationResponseSchema,
  PlatformHealthStatus,
  ProductSummary,
  ShoppingHandoffResponse,
  ShoppingHandoffResponseSchema,
  OptimizationRequestSchema,
  ShoppingHandoffRequestSchema,
} from "@groqai/shared";
import { z } from "zod";
import { mockApiService } from "./mockApiService.js";

const API_BASE_URL = (import.meta as any).env?.VITE_API_BASE_URL || "";

export class GroqApiClient {
  private isUsingMock(): boolean {
    return !API_BASE_URL || API_BASE_URL.trim() === "";
  }

  async getHealth(): Promise<{ status: string; uptime: number; mode: string; timestamp: string }> {
    if (this.isUsingMock()) {
      return mockApiService.getHealth();
    }
    const res = await fetch(`${API_BASE_URL}/api/health`);
    if (!res.ok) throw new Error(`Health check failed: ${res.statusText}`);
    return res.json();
  }

  async getCategories(): Promise<CategoryInfo[]> {
    if (this.isUsingMock()) {
      return mockApiService.getCategories();
    }
    const res = await fetch(`${API_BASE_URL}/api/categories`);
    if (!res.ok) throw new Error(`Failed to fetch categories: ${res.statusText}`);
    return res.json();
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

  async refreshProduct(id: string, pincode?: string): Promise<{ product: ProductSummary; syncResult: any }> {
    if (this.isUsingMock()) {
      const prod = await mockApiService.getProductById(id);
      if (!prod) throw new Error("Product not found");
      return { product: prod, syncResult: { status: "cached" } };
    }
    const res = await fetch(`${API_BASE_URL}/api/products/${encodeURIComponent(id)}/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pincode: pincode || "110001" }),
    });
    if (!res.ok) throw new Error(`Failed to refresh product prices: ${res.statusText}`);
    return res.json();
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
    const res = await fetch(`${API_BASE_URL}/api/platforms`);
    if (!res.ok) throw new Error(`Failed to fetch platforms: ${res.statusText}`);
    return res.json();
  }

  async createOptimization(
    payload: z.input<typeof OptimizationRequestSchema>
  ): Promise<OptimizationResponse> {
    const validatedPayload = OptimizationRequestSchema.parse(payload);
    if (this.isUsingMock()) {
      return mockApiService.createOptimization(validatedPayload);
    }
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
  }

  async getOptimization(id: string): Promise<OptimizationResponse | null> {
    if (this.isUsingMock()) {
      return mockApiService.getOptimization(id);
    }
    const res = await fetch(`${API_BASE_URL}/api/optimizations/${encodeURIComponent(id)}`);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Failed to fetch optimization: ${res.statusText}`);
    const data = await res.json();
    return OptimizationResponseSchema.parse(data);
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
    locationKey: string = "delhi_110001"
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
