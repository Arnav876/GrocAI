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

  async searchProducts(query: string = "", category?: string): Promise<ProductSummary[]> {
    if (this.isUsingMock()) {
      return mockApiService.searchProducts(query, category);
    }
    const params = new URLSearchParams();
    if (query) params.append("q", query);
    if (category) params.append("category", category);
    const res = await fetch(`${API_BASE_URL}/api/products/search?${params.toString()}`);
    if (!res.ok) throw new Error(`Failed to search products: ${res.statusText}`);
    return res.json();
  }

  async getProductById(id: string): Promise<ProductSummary | null> {
    if (this.isUsingMock()) {
      return mockApiService.getProductById(id);
    }
    const res = await fetch(`${API_BASE_URL}/api/products/${encodeURIComponent(id)}`);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Failed to fetch product: ${res.statusText}`);
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
}

export const apiClient = new GroqApiClient();
