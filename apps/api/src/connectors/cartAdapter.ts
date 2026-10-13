import { PlatformId, PLATFORM_METADATA } from "@groqai/shared";

export interface CartTransferItem {
  productId?: string;
  query: string;
  matchedTitle: string;
  quantity: number;
  packSize?: string;
}

export interface CartTransferRequest {
  platform: PlatformId;
  locationKey: string;
  items: CartTransferItem[];
}

export interface CartTransferResult {
  success: boolean;
  status: "unsupported" | "success" | "failed";
  platform: PlatformId;
  message: string;
  cartReviewUrl?: string;
  transferredItemCount: number;
  unsupportedItemCount: number;
}

export interface ICartAdapter {
  readonly platformId: PlatformId;
  createCart(request: CartTransferRequest): Promise<CartTransferResult>;
}

/**
 * NullCartAdapter: Honest implementation adhering to non-negotiable legal and platform rules.
 * Because none of Blinkit, Zepto, Swiggy Instamart, or BigBasket currently offer open or authorized
 * public cart-creation APIs without partner approval, NullCartAdapter explicitly returns "unsupported".
 * It NEVER claims false success or attempts automated login/checkout.
 */
export class NullCartAdapter implements ICartAdapter {
  constructor(public readonly platformId: PlatformId) {}

  async createCart(request: CartTransferRequest): Promise<CartTransferResult> {
    const meta = PLATFORM_METADATA[this.platformId];
    return {
      success: false,
      status: "unsupported",
      platform: this.platformId,
      message: `Automated cart creation is unsupported for ${meta.name}. Direct checkout must be reviewed and paid on the platform's official application.`,
      cartReviewUrl: meta.websiteUrl,
      transferredItemCount: 0,
      unsupportedItemCount: request.items.length,
    };
  }
}
