/**
 * The canonical quantity parser lives in @groqai/shared so ingestion and the
 * matcher always agree on what "1 pack (1 L)" means. Keep this module as a
 * re-export for existing API imports.
 */
export {
  areQuantitiesCompatible,
  calculateNormalizedUnitPrice,
  parseAndNormalizeQuantity,
} from "@groqai/shared";
export type { NormalizedQuantity } from "@groqai/shared";
