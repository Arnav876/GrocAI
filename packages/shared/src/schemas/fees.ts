import { z } from 'zod';

export const FeeRangePaiseSchema = z.object({
  minPaise: z.number().int().nonnegative(),
  maxPaise: z.number().int().nonnegative(),
  isKnown: z.boolean(),
  label: z.string(),
  provenance: z.string().optional(),
}).refine((data) => data.maxPaise >= data.minPaise, {
  message: 'maxPaise must be greater than or equal to minPaise',
  path: ['maxPaise'],
});

export type FeeRangePaise = z.infer<typeof FeeRangePaiseSchema>;

export const FeeBreakdownPaiseSchema = z.object({
  deliveryFee: FeeRangePaiseSchema,
  handlingFee: FeeRangePaiseSchema,
  platformFee: FeeRangePaiseSchema,
  smallCartFee: FeeRangePaiseSchema,
  totalFeeMinPaise: z.number().int().nonnegative(),
  totalFeeMaxPaise: z.number().int().nonnegative(),
  hasUnknownFees: z.boolean(),
});

export type FeeBreakdownPaise = z.infer<typeof FeeBreakdownPaiseSchema>;

