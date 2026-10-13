import {
  PlatformCapabilities,
  PlatformFeeStructure,
  PlatformId,
  PriceObservation,
} from "@groqai/shared";

export interface FaultInjectionConfig {
  simulateTimeout?: boolean;
  simulateUnavailable?: boolean;
  simulateStale?: boolean;
  forcedLatencyMs?: number;
}

export interface IPlatformConnector {
  readonly platformId: PlatformId;
  getCapabilities(): PlatformCapabilities;
  searchProducts(query: string, locationKey: string): Promise<PriceObservation[]>;
  getPrice(productId: string, locationKey: string): Promise<PriceObservation | null>;
  getFees(locationKey: string): Promise<PlatformFeeStructure | null>;
  setFaultInjection(config: FaultInjectionConfig): void;
}
