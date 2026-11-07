import {
  PlatformId,
  PLATFORM_METADATA,
  NullCartAdapter,
  assertIntegerPaise,
  addPaise,
  formatPaiseToRupees,
} from "@groqai/shared";

export interface HandoffItemInput {
  title: string;
  brand?: string;
  variant?: string;
  quantity: number;
  unitPricePaise: number;
  totalPricePaise?: number;
  productUrl?: string;
  searchUrl?: string;
}

export interface StoreCartHandoffInput {
  platformId: PlatformId;
  platformName?: string;
  items: HandoffItemInput[];
  subtotalPaise: number;
  deliveryFeePaise?: number;
  handlingFeeMinPaise?: number;
  handlingFeeMaxPaise?: number;
  platformFeePaise?: number;
  smallCartFeePaise?: number;
  hasUnknownFees?: boolean;
  amountToFreeDeliveryPaise?: number;
  meetsMinimumOrder?: boolean;
}

export interface StrategyHandoffInput {
  strategy: string;
  strategyName?: string;
  pincode?: string;
  optimizationId?: string;
  storeCarts: Record<string, StoreCartHandoffInput> | StoreCartHandoffInput[];
}

export interface PlatformHandoffItem {
  title: string;
  brand?: string;
  variant?: string;
  quantity: number;
  unitPricePaise: number;
  totalPricePaise: number;
  unitPriceRupees: number;
  totalPriceRupees: number;
  productUrl?: string;
  searchUrl: string;
  isDeepLink: boolean;
  checkboxMarkdown: string;
}

export interface PlatformHandoffGroup {
  platform: PlatformId;
  platformName: string;
  items: PlatformHandoffItem[];
  subtotalPaise: number;
  subtotalRupees: number;
  estimatedFeesRupees: number;
  hasUnknownFees: boolean;
  estimatedTotalRupees: number;
  estimatedTotalMinPaise: number;
  estimatedTotalMaxPaise: number;
  meetsMinimumOrder: boolean;
  checklistText: string;
  cartReviewUrl: string;
  storeChecklistMarkdown: string;
  cliffTip?: string;
  unknownFeeExplanation?: string;
}

export interface ShoppingHandoffPayload {
  handoffId: string;
  optimizationId?: string;
  pincode?: string;
  strategy: string;
  strategyName: string;
  timestamp: string;
  method: "links_and_checklist";
  isEstimate: boolean;
  notice: string;
  capabilities: {
    createCart: false;
    automatedCheckout: false;
    searchDeepLink: true;
    checklistHandoff: true;
  };
  markdownChecklist: string;
  grandTotalPaise: {
    subtotalPaise: number;
    feeMinPaise: number;
    feeMaxPaise: number;
    estimatedTotalMinPaise: number;
    estimatedTotalMaxPaise: number;
    hasUnknownFees: boolean;
  };
  grandTotalRupees: {
    subtotal: string;
    estimatedTotalMin: string;
    estimatedTotalMax: string;
  };
  platforms: PlatformHandoffGroup[];
}

/**
 * Merchant Search Deep-Link Generator (buildPlatformSearchDeepLink):
 * Generates deterministic, URL-encoded official search links for each platform:
 *  - blinkit: https://blinkit.com/s/?q=<encoded_query>
 *  - zepto: https://www.zeptonow.com/search?query=<encoded_query>
 *  - instamart: https://www.swiggy.com/instamart/search?custom_back=true&query=<encoded_query>
 *  - bigbasket: https://www.bigbasket.com/ps/?q=<encoded_query>
 */
export function buildPlatformSearchDeepLink(platform: PlatformId, query: string): string {
  const encodedQuery = encodeURIComponent(query.trim());
  switch (platform) {
    case "blinkit":
      return `https://blinkit.com/s/?q=${encodedQuery}`;
    case "zepto":
      return `https://www.zeptonow.com/search?query=${encodedQuery}`;
    case "instamart":
      return `https://www.swiggy.com/instamart/search?custom_back=true&query=${encodedQuery}`;
    case "bigbasket":
      return `https://www.bigbasket.com/ps/?q=${encodedQuery}`;
    default:
      return `https://blinkit.com/s/?q=${encodedQuery}`;
  }
}

export class ShoppingHandoffService {
  /**
   * Generates a copyable Markdown shopping checklist from evaluated store carts.
   */
  static generateMarkdownChecklist(
    storeCarts: StoreCartHandoffInput[],
    options?: {
      strategyName?: string;
      pincode?: string;
    }
  ): string {
    const lines: string[] = [];
    const strategyTitle = options?.strategyName || "Optimized Grocery Basket";

    lines.push(`# 🛒 GrocAI Shopping Checklist — ${strategyTitle}`);
    if (options?.pincode) {
      lines.push(`> **Delivery Pincode:** ${options.pincode}`);
    }
    lines.push("");

    let grandSubtotalPaise = 0;
    let grandFeeMinPaise = 0;
    let grandFeeMaxPaise = 0;
    let anyUnknownFees = false;

    for (const cart of storeCarts) {
      if (cart.items.length === 0) continue;

      const meta = PLATFORM_METADATA[cart.platformId];
      const platformName = cart.platformName || meta.name;
      const itemCount = cart.items.length;
      const subtotalPaise = cart.subtotalPaise;
      assertIntegerPaise(subtotalPaise, `${platformName} subtotalPaise`);
      grandSubtotalPaise = addPaise(grandSubtotalPaise, subtotalPaise);

      const deliveryPaise = cart.deliveryFeePaise ?? 0;
      const handlingMin = cart.handlingFeeMinPaise ?? 0;
      const handlingMax = cart.handlingFeeMaxPaise ?? handlingMin;
      const platformPaise = cart.platformFeePaise ?? 0;
      const smallCartPaise = cart.smallCartFeePaise ?? 0;
      const hasUnknown = cart.hasUnknownFees === true || handlingMin !== handlingMax;

      const storeFeeMin = addPaise(
        addPaise(deliveryPaise, handlingMin),
        addPaise(platformPaise, smallCartPaise)
      );
      const storeFeeMax = addPaise(
        addPaise(deliveryPaise, handlingMax),
        addPaise(platformPaise, smallCartPaise)
      );

      grandFeeMinPaise = addPaise(grandFeeMinPaise, storeFeeMin);
      grandFeeMaxPaise = addPaise(grandFeeMaxPaise, storeFeeMax);
      if (hasUnknown) anyUnknownFees = true;

      const storeTotalMin = addPaise(subtotalPaise, storeFeeMin);
      const storeTotalMax = addPaise(subtotalPaise, storeFeeMax);

      lines.push(`### 🛒 ${platformName} Cart (${itemCount} item${itemCount > 1 ? "s" : ""})`);
      lines.push("");

      // Line items with interactive checkboxes
      for (const it of cart.items) {
        assertIntegerPaise(it.unitPricePaise, `${it.title} unitPricePaise`);
        const lineTotal = it.totalPricePaise ?? it.unitPricePaise * it.quantity;
        assertIntegerPaise(lineTotal, `${it.title} lineTotalPaise`);

        const searchDeepLink =
          it.searchUrl || buildPlatformSearchDeepLink(cart.platformId, it.title);
        const linkLabel = `Search on ${platformName}`;
        const itemLine = `- [ ] ${it.quantity}x ${it.title} — ${formatPaiseToRupees(
          lineTotal
        )} [${linkLabel}](${searchDeepLink})`;
        lines.push(itemLine);
      }

      lines.push("");
      lines.push(`- **Subtotal:** ${formatPaiseToRupees(subtotalPaise)}`);
      lines.push(
        `- **Delivery Fee:** ${
          deliveryPaise === 0 ? "FREE" : formatPaiseToRupees(deliveryPaise)
        }`
      );
      lines.push(
        `- **Handling Fee:** ${
          handlingMin === handlingMax
            ? formatPaiseToRupees(handlingMin)
            : `${formatPaiseToRupees(handlingMin)} – ${formatPaiseToRupees(handlingMax)}`
        }`
      );
      if (smallCartPaise > 0) {
        lines.push(`- **Small Cart Fee:** ${formatPaiseToRupees(smallCartPaise)}`);
      }
      if (platformPaise > 0) {
        lines.push(`- **Platform Fee:** ${formatPaiseToRupees(platformPaise)}`);
      }

      if (hasUnknown) {
        lines.push(
          `> ⚠️ **Dynamic Fee Range:** ${formatPaiseToRupees(
            handlingMin
          )} – ${formatPaiseToRupees(
            handlingMax
          )} (Final fee determined at merchant checkout based on surge/slot availability)`
        );
      }

      if (cart.amountToFreeDeliveryPaise && cart.amountToFreeDeliveryPaise > 0) {
        lines.push(
          `> 💡 **Free Delivery Tip:** Add ${formatPaiseToRupees(
            cart.amountToFreeDeliveryPaise
          )} more to qualify for FREE delivery on ${platformName}`
        );
      }

      lines.push(
        `- **Estimated Store Total:** ${
          storeTotalMin === storeTotalMax
            ? formatPaiseToRupees(storeTotalMin)
            : `${formatPaiseToRupees(storeTotalMin)} – ${formatPaiseToRupees(storeTotalMax)}`
        }`
      );
      lines.push(`- **Open Store:** [${meta.websiteUrl}](${meta.websiteUrl})`);
      lines.push("");
    }

    // Grand Total Summary in Markdown
    const grandTotalMin = addPaise(grandSubtotalPaise, grandFeeMinPaise);
    const grandTotalMax = addPaise(grandSubtotalPaise, grandFeeMaxPaise);

    lines.push("---");
    lines.push("## 🧾 Grand Total Summary");
    lines.push(`- **Basket Subtotal:** ${formatPaiseToRupees(grandSubtotalPaise)}`);
    lines.push(
      `- **Cumulative Delivery & Handling Fees:** ${
        grandFeeMinPaise === grandFeeMaxPaise
          ? formatPaiseToRupees(grandFeeMinPaise)
          : `${formatPaiseToRupees(grandFeeMinPaise)} – ${formatPaiseToRupees(grandFeeMaxPaise)}`
      }`
    );
    lines.push(
      `- **Estimated Grand Total:** ${
        grandTotalMin === grandTotalMax
          ? formatPaiseToRupees(grandTotalMin)
          : `${formatPaiseToRupees(grandTotalMin)} – ${formatPaiseToRupees(grandTotalMax)}`
      }`
    );
    lines.push("");
    lines.push(
      `*Honest Handoff: GrocAI does not perform automated checkout or collect payment credentials. Complete your order on the official merchant platform.*`
    );

    return lines.join("\n");
  }

  /**
   * Generates the complete shopping handoff payload strictly adhering to NullCartAdapter.
   */
  static generateHandoffPayload(input: StrategyHandoffInput): ShoppingHandoffPayload {
    const handoffId = `hnd-${Date.now()}`;
    const timestamp = new Date().toISOString();

    // Enforce NullCartAdapter capability invariants
    const nullAdapter = new NullCartAdapter("blinkit");
    const adapterCaps = nullAdapter.getCapabilities();

    // Normalize store carts array
    const rawCarts = Array.isArray(input.storeCarts)
      ? input.storeCarts
      : Object.entries(input.storeCarts).map(([pid, c]) => ({
          ...c,
          platformId: (c.platformId || pid) as PlatformId,
        }));

    const activeCarts = rawCarts.filter((c) => c.items && c.items.length > 0);

    let grandSubtotalPaise = 0;
    let grandFeeMinPaise = 0;
    let grandFeeMaxPaise = 0;
    let hasAnyUnknownFees = false;

    const platformGroups: PlatformHandoffGroup[] = activeCarts.map((cart) => {
      const meta = PLATFORM_METADATA[cart.platformId];
      const platformName = cart.platformName || meta.name;
      const subtotalPaise = cart.subtotalPaise;
      assertIntegerPaise(subtotalPaise, `${platformName} subtotalPaise`);
      grandSubtotalPaise = addPaise(grandSubtotalPaise, subtotalPaise);

      const deliveryPaise = cart.deliveryFeePaise ?? 0;
      const handlingMin = cart.handlingFeeMinPaise ?? 0;
      const handlingMax = cart.handlingFeeMaxPaise ?? handlingMin;
      const platformPaise = cart.platformFeePaise ?? 0;
      const smallCartPaise = cart.smallCartFeePaise ?? 0;
      const hasUnknown = cart.hasUnknownFees === true || handlingMin !== handlingMax;

      const storeFeeMin = addPaise(
        addPaise(deliveryPaise, handlingMin),
        addPaise(platformPaise, smallCartPaise)
      );
      const storeFeeMax = addPaise(
        addPaise(deliveryPaise, handlingMax),
        addPaise(platformPaise, smallCartPaise)
      );

      grandFeeMinPaise = addPaise(grandFeeMinPaise, storeFeeMin);
      grandFeeMaxPaise = addPaise(grandFeeMaxPaise, storeFeeMax);
      if (hasUnknown) hasAnyUnknownFees = true;

      const storeTotalMin = addPaise(subtotalPaise, storeFeeMin);
      const storeTotalMax = addPaise(subtotalPaise, storeFeeMax);

      const items: PlatformHandoffItem[] = cart.items.map((it) => {
        assertIntegerPaise(it.unitPricePaise, `${it.title} unitPricePaise`);
        const lineTotal = it.totalPricePaise ?? it.unitPricePaise * it.quantity;
        assertIntegerPaise(lineTotal, `${it.title} lineTotalPaise`);

        const searchUrl =
          it.searchUrl || buildPlatformSearchDeepLink(cart.platformId, it.title);
        const linkLabel = `Search on ${platformName}`;
        const checkboxMarkdown = `- [ ] ${it.quantity}x ${it.title} — ${formatPaiseToRupees(
          lineTotal
        )} [${linkLabel}](${searchUrl})`;

        return {
          title: it.title,
          brand: it.brand,
          variant: it.variant,
          quantity: it.quantity,
          unitPricePaise: it.unitPricePaise,
          totalPricePaise: lineTotal,
          unitPriceRupees: it.unitPricePaise / 100,
          totalPriceRupees: lineTotal / 100,
          productUrl: it.productUrl || undefined,
          searchUrl,
          isDeepLink: false, // Honest flag: search deep link, not fake checkout cart
          checkboxMarkdown,
        };
      });

      // Backward compatible checklist text
      const checklistText = [
        `🛒 ${platformName} Shopping List (GroqAI Plan: ${input.strategyName || input.strategy})`,
        `Estimated Total: ₹${(storeTotalMin / 100).toFixed(2)} (Subtotal ₹${(
          subtotalPaise / 100
        ).toFixed(2)} + Fees ₹${(storeFeeMin / 100).toFixed(2)})`,
        `----------------------------------------`,
        ...items.map(
          (it, idx) =>
            `${idx + 1}. [ ] ${it.title} x ${it.quantity} - Est ₹${it.totalPriceRupees.toFixed(2)}`
        ),
        `----------------------------------------`,
        `Open ${platformName}: ${meta.websiteUrl}`,
      ].join("\n");

      const storeChecklistMarkdown = ShoppingHandoffService.generateMarkdownChecklist([cart], {
        strategyName: input.strategyName,
        pincode: input.pincode,
      });

      return {
        platform: cart.platformId,
        platformName,
        items,
        subtotalPaise,
        subtotalRupees: subtotalPaise / 100,
        estimatedFeesRupees: storeFeeMin / 100,
        hasUnknownFees: hasUnknown,
        estimatedTotalRupees: storeTotalMin / 100,
        estimatedTotalMinPaise: storeTotalMin,
        estimatedTotalMaxPaise: storeTotalMax,
        meetsMinimumOrder: cart.meetsMinimumOrder ?? true,
        checklistText,
        cartReviewUrl: meta.websiteUrl,
        storeChecklistMarkdown,
        cliffTip:
          cart.amountToFreeDeliveryPaise && cart.amountToFreeDeliveryPaise > 0
            ? `Add ${formatPaiseToRupees(
                cart.amountToFreeDeliveryPaise
              )} more to unlock FREE delivery on ${platformName}`
            : undefined,
        unknownFeeExplanation: hasUnknown
          ? `Handling fee range ${formatPaiseToRupees(handlingMin)} – ${formatPaiseToRupees(
              handlingMax
            )} is unverified and preserved as range`
          : undefined,
      };
    });

    const fullMarkdownChecklist = ShoppingHandoffService.generateMarkdownChecklist(activeCarts, {
      strategyName: input.strategyName,
      pincode: input.pincode,
    });

    const grandTotalMin = addPaise(grandSubtotalPaise, grandFeeMinPaise);
    const grandTotalMax = addPaise(grandSubtotalPaise, grandFeeMaxPaise);

    return {
      handoffId,
      optimizationId: input.optimizationId,
      pincode: input.pincode,
      strategy: input.strategy,
      strategyName: input.strategyName || input.strategy,
      timestamp,
      method: "links_and_checklist",
      isEstimate: true,
      notice:
        "Verify basket, address, fees and total in the app. Payment happens on the platform, not on GrocAI.",
      capabilities: {
        createCart: adapterCaps.createCart as false,
        automatedCheckout: adapterCaps.automatedCheckout as false,
        searchDeepLink: adapterCaps.searchDeepLink as true,
        checklistHandoff: adapterCaps.checklistHandoff as true,
      },
      markdownChecklist: fullMarkdownChecklist,
      grandTotalPaise: {
        subtotalPaise: grandSubtotalPaise,
        feeMinPaise: grandFeeMinPaise,
        feeMaxPaise: grandFeeMaxPaise,
        estimatedTotalMinPaise: grandTotalMin,
        estimatedTotalMaxPaise: grandTotalMax,
        hasUnknownFees: hasAnyUnknownFees,
      },
      grandTotalRupees: {
        subtotal: formatPaiseToRupees(grandSubtotalPaise),
        estimatedTotalMin: formatPaiseToRupees(grandTotalMin),
        estimatedTotalMax: formatPaiseToRupees(grandTotalMax),
      },
      platforms: platformGroups,
    };
  }
}
