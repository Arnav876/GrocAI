import { RawObservation, RawObservationSchema } from "@groqai/shared";

/**
 * Validates an array of RawObservations. Filters out any invalid observations and logs warnings,
 * guaranteeing the scraper returns safe data rather than crashing.
 */
export function validateRawObservations(items: unknown[]): RawObservation[] {
  if (!Array.isArray(items)) {
    console.warn("[Validation] Expected array of observations, received:", typeof items);
    return [];
  }

  const valid: RawObservation[] = [];
  for (const item of items) {
    const res = RawObservationSchema.safeParse(item);
    if (res.success) {
      valid.push(res.data as RawObservation);
    } else {
      console.warn("[Validation] Dropping invalid observation:", res.error.format());
    }
  }
  return valid;
}

