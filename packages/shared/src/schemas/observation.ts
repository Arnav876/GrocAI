import { z } from 'zod';

export const AvailabilityStatusEnum = z.enum([
  'IN_STOCK',
  'OUT_OF_STOCK',
  'LOW_STOCK',
  'UNAVAILABLE',
]);
export type ObservationAvailabilityStatus = z.infer<typeof AvailabilityStatusEnum>;

export const PlatformIdEnum = z.enum([
  'blinkit',
  'zepto',
  'instamart',
  'bigbasket',
]);
export type ObservationPlatformId = z.infer<typeof PlatformIdEnum>;

export const DataSourceEnum = z.enum([
  'headed_worker',
  'manual_assisted',
  'seed_fixture',
  'cached_snapshot',
]);
export type DataSource = z.infer<typeof DataSourceEnum>;

export const VerificationStatusEnum = z.enum([
  'VERIFIED',
  'UNVERIFIED',
  'STALE',
  'FLAGGED_ANOMALY',
]);
export type VerificationStatus = z.infer<typeof VerificationStatusEnum>;

export const PINCODE_REGEX = /^[1-9][0-9]{5}$/;

export function calculateDiscountPercentage(
  pricePaise: number,
  originalPricePaise: number
): number {
  if (!Number.isInteger(pricePaise) || pricePaise < 0) {
    throw new Error(`pricePaise must be a non-negative integer, received: ${pricePaise}`);
  }
  if (!Number.isInteger(originalPricePaise) || originalPricePaise < 0) {
    throw new Error(
      `originalPricePaise must be a non-negative integer, received: ${originalPricePaise}`
    );
  }
  if (originalPricePaise < pricePaise) {
    throw new Error(
      `originalPricePaise (${originalPricePaise}) cannot be less than pricePaise (${pricePaise})`
    );
  }
  if (originalPricePaise === 0) {
    return 0;
  }
  return Math.round(((originalPricePaise - pricePaise) * 100) / originalPricePaise);
}

export const NormalizedObservationSchema = z
  .object({
    name: z.string().min(1, 'Name must be a non-empty string'),
    brand: z.string().nullable(),
    quantity: z.string().min(1, 'Quantity must be a non-empty string'),
    pricePaise: z
      .number()
      .int('pricePaise must be an integer')
      .nonnegative('pricePaise must be non-negative'),
    originalPricePaise: z
      .number()
      .int('originalPricePaise must be an integer')
      .nonnegative('originalPricePaise must be non-negative'),
    discountPercentage: z
      .number()
      .min(0, 'Discount percentage cannot be negative')
      .max(100, 'Discount percentage cannot exceed 100'),
    availabilityStatus: AvailabilityStatusEnum,
    platformId: PlatformIdEnum,
    productUrl: z.string().url('productUrl must be a valid URL'),
    imageUrl: z.string().url('imageUrl must be a valid URL').nullable(),
    pincode: z
      .string()
      .regex(PINCODE_REGEX, 'pincode must be a valid 6-digit Indian postal code'),
    observedAt: z.string().datetime({ message: 'observedAt must be a valid ISO-8601 timestamp' }),
    dataSource: DataSourceEnum,
    verificationStatus: VerificationStatusEnum,
  })
  .refine((data) => data.originalPricePaise >= data.pricePaise, {
    message: 'originalPricePaise must be greater than or equal to pricePaise',
    path: ['originalPricePaise'],
  });

export type NormalizedObservation = z.infer<typeof NormalizedObservationSchema>;
