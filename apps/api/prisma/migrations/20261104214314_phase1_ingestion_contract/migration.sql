-- AlterTable
ALTER TABLE "PriceObservation" ADD COLUMN     "brand" TEXT,
ADD COLUMN     "discountPercentage" INTEGER,
ADD COLUMN     "externalId" TEXT,
ADD COLUMN     "fetchedAt" TIMESTAMP(3),
ADD COLUMN     "imageUrl" TEXT,
ADD COLUMN     "latitude" DOUBLE PRECISION,
ADD COLUMN     "longitude" DOUBLE PRECISION,
ADD COLUMN     "normalizedUnit" TEXT,
ADD COLUMN     "normalizedUnitPricePaise" INTEGER,
ADD COLUMN     "originalPricePaise" INTEGER,
ADD COLUMN     "packSize" TEXT,
ADD COLUMN     "pincode" TEXT,
ADD COLUMN     "productUrl" TEXT,
ADD COLUMN     "quantity" DOUBLE PRECISION,
ADD COLUMN     "scrapeRunId" TEXT,
ADD COLUMN     "searchUrl" TEXT,
ADD COLUMN     "serviceableArea" TEXT,
ADD COLUMN     "unit" TEXT,
ADD COLUMN     "variant" TEXT,
ADD COLUMN     "verificationStatus" TEXT DEFAULT 'estimate';

-- CreateTable
CREATE TABLE "ScrapeRun" (
    "id" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "locationKey" TEXT NOT NULL DEFAULT 'delhi_110001',
    "trigger" TEXT NOT NULL DEFAULT 'manual',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "queries" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "itemsFound" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "ScrapeRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScrapeJob" (
    "id" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "queries" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "locationKey" TEXT NOT NULL DEFAULT 'delhi_110001',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "error" TEXT,
    "scrapeRunId" TEXT,
    "scheduledFor" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMP(3),
    "lockedBy" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScrapeJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Location" (
    "id" TEXT NOT NULL,
    "locationKey" TEXT NOT NULL,
    "pincode" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "serviceableArea" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Location_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ScrapeRun_platform_status_idx" ON "ScrapeRun"("platform", "status");

-- CreateIndex
CREATE INDEX "ScrapeRun_startedAt_idx" ON "ScrapeRun"("startedAt");

-- CreateIndex
CREATE INDEX "ScrapeJob_status_scheduledFor_priority_idx" ON "ScrapeJob"("status", "scheduledFor", "priority");

-- CreateIndex
CREATE UNIQUE INDEX "Location_locationKey_key" ON "Location"("locationKey");

-- CreateIndex
CREATE INDEX "Location_pincode_idx" ON "Location"("pincode");

-- CreateIndex
CREATE INDEX "Location_locationKey_idx" ON "Location"("locationKey");

-- CreateIndex
CREATE INDEX "PriceObservation_scrapeRunId_idx" ON "PriceObservation"("scrapeRunId");

-- AddForeignKey
ALTER TABLE "PriceObservation" ADD CONSTRAINT "PriceObservation_scrapeRunId_fkey" FOREIGN KEY ("scrapeRunId") REFERENCES "ScrapeRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScrapeJob" ADD CONSTRAINT "ScrapeJob_scrapeRunId_fkey" FOREIGN KEY ("scrapeRunId") REFERENCES "ScrapeRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
