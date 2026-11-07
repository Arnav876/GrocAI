-- Unmatched live observations used to be persisted with a null productId and
-- no way to review them. Track explicit human review so they can be promoted
-- or dismissed without ever creating an automatic fuzzy match.

ALTER TABLE "PriceObservation"
  ADD COLUMN "reviewStatus" TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN "reviewedAt" TIMESTAMP(3),
  ADD COLUMN "reviewNote" TEXT;

CREATE INDEX "PriceObservation_reviewStatus_productId_idx"
  ON "PriceObservation"("reviewStatus", "productId");
