import {
  PlatformId,
  SUPPORTED_PLATFORMS,
  PLATFORM_METADATA,
  PriceObservation,
  ProductSummary,
  SourceType,
  PriceVerificationStatus,
  determinePriceVerificationStatus,
  calculateNormalizedUnitPrice,
  isPriceFresh,
  isPriceStale,
  DEFAULT_CACHE_FRESHNESS_TTL_MS,
  DEFAULT_PRICE_TTL_MS,
  paiseToRupees,
} from "@groqai/shared";
import { PrismaClient } from "@prisma/client";
import { ConnectorRegistry } from "../connectors/registry.js";
import { defaultMatcher } from "../matching/matchingService.js";

export interface SyncOptions {
  forceRefresh?: boolean;
  cacheTtlMs?: number;
  locationKey?: string;
}

export interface PlatformSyncOutcome {
  platform: PlatformId;
  status: "success" | "cached" | "failed" | "disabled";
  verificationStatus: PriceVerificationStatus;
  pricePaise: number | null;
  availability: string;
  observedAt: string;
  sourceType: SourceType;
  error?: string;
}

export interface ProductSyncResult {
  productId: string;
  productName: string;
  packSize: string;
  normalizedUnitPrice?: any;
  platforms: Record<PlatformId, PlatformSyncOutcome>;
  refreshedPlatforms: PlatformId[];
  cachedPlatforms: PlatformId[];
  failedPlatforms: PlatformId[];
}

export class GrocerySyncService {
  private cacheTtlMs: number;
  private staleTtlMs: number;

  constructor(
    private prisma: PrismaClient,
    private registry: ConnectorRegistry,
    config?: { cacheTtlMs?: number; staleTtlMs?: number }
  ) {
    this.cacheTtlMs = config?.cacheTtlMs || DEFAULT_CACHE_FRESHNESS_TTL_MS;
    this.staleTtlMs = config?.staleTtlMs || DEFAULT_PRICE_TTL_MS;
  }

  /**
   * Synchronizes and refreshes pricing and availability for a single product across all 4 platforms.
   * Invariant: Never overwrites valid cached data with failed or incomplete responses.
   */
  async syncProduct(
    productId: string,
    locationKey: string = "delhi_110001",
    options: SyncOptions = {}
  ): Promise<ProductSyncResult> {
    const forceRefresh = options.forceRefresh ?? false;
    const cacheTtl = options.cacheTtlMs || this.cacheTtlMs;

    const prod = await this.prisma.product.findUnique({
      where: { id: productId },
      include: { listings: true },
    });

    if (!prod) {
      throw new Error(`Product ${productId} not found in catalog`);
    }

    const outcomes: Record<PlatformId, PlatformSyncOutcome> = {} as any;
    const refreshedPlatforms: PlatformId[] = [];
    const cachedPlatforms: PlatformId[] = [];
    const failedPlatforms: PlatformId[] = [];

    // Process all platforms in parallel with graceful failure isolation
    await Promise.all(
      SUPPORTED_PLATFORMS.map(async (pid) => {
        const isKilled = this.registry.isKillSwitchActive(pid);
        const existingListing = prod.listings.find((l) => l.platform === pid);

        if (isKilled) {
          outcomes[pid] = {
            platform: pid,
            status: "disabled",
            verificationStatus: "unavailable",
            pricePaise: existingListing?.currentPricePaise || null,
            availability: "unavailable",
            observedAt: existingListing?.lastObservedAt?.toISOString() || new Date().toISOString(),
            sourceType: (existingListing?.sourceType as SourceType) || "mock",
            error: "Connector deactivated via emergency kill switch",
          };
          return;
        }

        const isFresh =
          existingListing &&
          !forceRefresh &&
          isPriceFresh(existingListing.lastObservedAt.toISOString(), cacheTtl);

        // 1. Re-use existing fresh cache if still within freshness TTL
        if (isFresh) {
          const verificationStatus = determinePriceVerificationStatus(
            existingListing.lastObservedAt.toISOString(),
            existingListing.sourceType,
            existingListing.availability
          );
          outcomes[pid] = {
            platform: pid,
            status: "cached",
            verificationStatus,
            pricePaise: existingListing.currentPricePaise,
            availability: existingListing.availability,
            observedAt: existingListing.lastObservedAt.toISOString(),
            sourceType: existingListing.sourceType as SourceType,
          };
          cachedPlatforms.push(pid);
          return;
        }

        // 2. Fetch fresh observation from modular adapter
        try {
          const adapter = this.registry.getAdapter(pid);
          const start = Date.now();
          const observations = await adapter.searchProducts(prod.name, locationKey);
          const duration = Date.now() - start;
          this.registry.recordRequest(pid, true, duration);

          // Find best matching observation using deterministic matcher
          const scored = observations
            .map((o) => ({
              o,
              m: defaultMatcher.match(
                { query: prod.name, variant: prod.variant, packSize: prod.packSize },
                {
                  id: o.productId ?? "",
                  name: o.title,
                  brand: o.brand ?? "",
                  variant: o.variant ?? "",
                  packSize: o.packSize || o.unit || "",
                }
              ),
            }))
            .filter((x) => x.m.isMatch)
            .sort((a, b) => b.m.confidence - a.m.confidence);

          let matchedObs: PriceObservation | null = scored.length > 0 ? scored[0].o : null;
          const matchConfidence = scored.length > 0 ? scored[0].m.confidence : 0;
          const obsPricePaise =
            matchedObs?.pricePaise !== undefined
              ? matchedObs.pricePaise
              : matchedObs?.price !== undefined
              ? Math.round(matchedObs.price * 100)
              : undefined;

          if (!matchedObs || obsPricePaise === undefined) {
            // Preserve existing listing if any, mark unmatched, do not write a random price
            outcomes[pid] = {
              platform: pid,
              status: existingListing ? "cached" : "failed",
              verificationStatus: existingListing ? "cached" : "unavailable",
              pricePaise: existingListing?.currentPricePaise || null,
              availability: existingListing?.availability || "unavailable",
              observedAt: existingListing?.lastObservedAt?.toISOString() || new Date().toISOString(),
              sourceType: (existingListing?.sourceType as SourceType) || "mock",
              error: `No compatible product match found on ${pid}`,
            };
            if (existingListing) cachedPlatforms.push(pid);
            else failedPlatforms.push(pid);
            return;
          }

          if (matchedObs && obsPricePaise !== undefined) {
            // Only clear isStale when sourceType is permitted_page, authorized_api, or partner_feed
            const isLiveSource = ["permitted_page", "authorized_api", "partner_feed"].includes(matchedObs.sourceType);
            const isStale = !isLiveSource;

            // Update PlatformListing in DB with verified observation
            const newObservedAt = new Date(matchedObs.observedAt || Date.now());
            await this.prisma.platformListing.upsert({
              where: { productId_platform: { productId: prod.id, platform: pid } },
              create: {
                productId: prod.id,
                platform: pid,
                currentPricePaise: obsPricePaise,
                availability: matchedObs.availability || "available",
                isStale,
                confidence: matchConfidence > 0 ? matchConfidence : (matchedObs.confidence ?? 1.0),
                sourceType: matchedObs.sourceType,
                lastObservedAt: newObservedAt,
                productUrl: matchedObs.productUrl,
                searchUrl: matchedObs.searchUrl,
              },
              update: {
                currentPricePaise: obsPricePaise,
                availability: matchedObs.availability || "available",
                isStale,
                confidence: matchConfidence > 0 ? matchConfidence : (matchedObs.confidence ?? 1.0),
                sourceType: matchedObs.sourceType,
                lastObservedAt: newObservedAt,
              },
            });

            // Store time-series price observation for persistence
            await this.prisma.priceObservation.create({
              data: {
                productId: prod.id,
                platform: pid,
                rawTitle: matchedObs.title,
                pricePaise: obsPricePaise,
                availability: matchedObs.availability || "available",
                locationKey,
                sourceType: matchedObs.sourceType,
                confidence: matchedObs.confidence ?? 1.0,
                observedAt: newObservedAt,
                notes: matchedObs.notes || [],
              },
            });

            const verificationStatus = determinePriceVerificationStatus(
              matchedObs.observedAt,
              matchedObs.sourceType,
              matchedObs.availability
            );

            outcomes[pid] = {
              platform: pid,
              status: "success",
              verificationStatus,
              pricePaise: obsPricePaise,
              availability: matchedObs.availability || "available",
              observedAt: matchedObs.observedAt,
              sourceType: matchedObs.sourceType,
            };
            refreshedPlatforms.push(pid);
          } else {
            // Matched observation had no price; preserve existing cache without overwriting
            outcomes[pid] = {
              platform: pid,
              status: "cached",
              verificationStatus: existingListing
                ? determinePriceVerificationStatus(
                    existingListing.lastObservedAt.toISOString(),
                    existingListing.sourceType,
                    existingListing.availability
                  )
                : "unverified",
              pricePaise: existingListing?.currentPricePaise || null,
              availability: existingListing?.availability || "unknown",
              observedAt: existingListing?.lastObservedAt?.toISOString() || new Date().toISOString(),
              sourceType: (existingListing?.sourceType as SourceType) || "mock",
            };
            cachedPlatforms.push(pid);
          }
        } catch (err: any) {
          this.registry.recordRequest(pid, false, 200);
          console.warn(`[GroqAI Sync] Failed to refresh ${pid} for product ${prod.id}: ${err.message}`);
          failedPlatforms.push(pid);

          // DO NOT overwrite valid data with failed responses. Mark stale and indicate failure.
          if (existingListing) {
            outcomes[pid] = {
              platform: pid,
              status: "failed",
              verificationStatus: "stale",
              pricePaise: existingListing.currentPricePaise,
              availability: existingListing.availability,
              observedAt: existingListing.lastObservedAt.toISOString(),
              sourceType: existingListing.sourceType as SourceType,
              error: `Live refresh failed (${err.message}); showing previous cached price.`,
            };
          } else {
            outcomes[pid] = {
              platform: pid,
              status: "failed",
              verificationStatus: "unavailable",
              pricePaise: null,
              availability: "unavailable",
              observedAt: new Date().toISOString(),
              sourceType: "mock",
              error: `Live fetch failed: ${err.message}`,
            };
          }
        }
      })
    );

    // Compute lowest price and pack normalization
    let lowestPricePaise = Infinity;
    for (const pid of SUPPORTED_PLATFORMS) {
      const oc = outcomes[pid];
      if (oc?.availability === "available" && oc.pricePaise && oc.pricePaise < lowestPricePaise) {
        lowestPricePaise = oc.pricePaise;
      }
    }

    const effectiveLowest = lowestPricePaise < Infinity ? lowestPricePaise : 0;
    const normalizedUnitPrice =
      effectiveLowest > 0 && prod.packSize
        ? calculateNormalizedUnitPrice(effectiveLowest, prod.packSize) || undefined
        : undefined;

    return {
      productId: prod.id,
      productName: prod.name,
      packSize: prod.packSize,
      normalizedUnitPrice,
      platforms: outcomes,
      refreshedPlatforms,
      cachedPlatforms,
      failedPlatforms,
    };
  }

  /**
   * Synchronizes multiple basket items across platforms with caching and failure isolation.
   */
  async syncBasketItems(
    items: { query: string; requiredVariant?: string }[],
    locationKey: string = "delhi_110001",
    options: SyncOptions = {}
  ): Promise<ProductSyncResult[]> {
    const allProds = await this.prisma.product.findMany({
      include: { listings: true },
    });

    const results: ProductSyncResult[] = [];

    for (const item of items) {
      let bestProd: any = null;
      let highestConfidence = -1;

      for (const candidate of allProds) {
        const matchRes = defaultMatcher.match(
          { query: item.query, variant: item.requiredVariant },
          candidate
        );
        if (matchRes.isMatch && matchRes.confidence > highestConfidence) {
          highestConfidence = matchRes.confidence;
          bestProd = candidate;
        }
      }

      if (bestProd) {
        const syncResult = await this.syncProduct(bestProd.id, locationKey, options);
        results.push(syncResult);
      }
    }

    return results;
  }
}
