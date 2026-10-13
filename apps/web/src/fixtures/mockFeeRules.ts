import { PlatformFeeStructure } from "@groqai/shared";

export const MOCK_PLATFORM_FEE_RULES: Record<string, PlatformFeeStructure> = {
  blinkit: {
    platform: "blinkit",
    locationKey: "delhi_110001",
    deliveryFeePaise: 1500, // ₹15
    handlingFeePaise: 400,  // ₹4
    platformFeePaise: 300,  // ₹3
    freeDeliveryThresholdPaise: 19900, // ₹199
    minimumOrderValuePaise: 9900,     // ₹99
    sourceType: "mock",
    observedAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
    notes: ["Delivery free above ₹199 in Central Delhi"],
  },
  zepto: {
    platform: "zepto",
    locationKey: "delhi_110001",
    deliveryFeePaise: 2500, // ₹25
    handlingFeePaise: 500,  // ₹5
    platformFeePaise: 200,  // ₹2
    freeDeliveryThresholdPaise: 14900, // ₹149
    minimumOrderValuePaise: 9900,     // ₹99
    sourceType: "mock",
    observedAt: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
    notes: ["Free delivery on cart value > ₹149"],
  },
  instamart: {
    platform: "instamart",
    locationKey: "delhi_110001",
    deliveryFeePaise: 3000, // ₹30
    handlingFeePaise: 500,  // ₹5
    platformFeePaise: 400,  // ₹4
    freeDeliveryThresholdPaise: 19900, // ₹199
    minimumOrderValuePaise: 10000,    // ₹100
    sourceType: "mock",
    observedAt: new Date(Date.now() - 20 * 60 * 1000).toISOString(),
    notes: ["Rain surge charge waived"],
  },
  bigbasket: {
    platform: "bigbasket",
    locationKey: "delhi_110001",
    deliveryFeePaise: 3000, // ₹30
    // Unknown handling fee: represented as range ₹5 - ₹15 or null
    handlingFeePaise: { minPaise: 500, maxPaise: 1500 },
    platformFeePaise: 300,  // ₹3
    freeDeliveryThresholdPaise: 25000, // ₹250
    minimumOrderValuePaise: 15000,    // ₹150
    sourceType: "mock",
    observedAt: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
    notes: ["Handling fee varies by hub (range ₹5 - ₹15); not published for pincode 110001"],
  },
};
