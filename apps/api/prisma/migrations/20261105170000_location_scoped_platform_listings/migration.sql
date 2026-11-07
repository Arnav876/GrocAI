-- Scope platform listings by location so prices from different pincodes do
-- not overwrite each other.

ALTER TABLE "PlatformListing"
  ADD COLUMN "locationKey" TEXT NOT NULL DEFAULT 'delhi_110001';

DROP INDEX "PlatformListing_productId_platform_key";

CREATE UNIQUE INDEX "PlatformListing_productId_platform_locationKey_key"
  ON "PlatformListing"("productId", "platform", "locationKey");

CREATE INDEX "PlatformListing_locationKey_idx"
  ON "PlatformListing"("locationKey");
