-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "icon" TEXT NOT NULL,
    "bgPastel" TEXT NOT NULL,
    "itemCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "variant" TEXT NOT NULL,
    "packSize" TEXT NOT NULL,
    "mrpPaise" INTEGER,
    "rating" DOUBLE PRECISION DEFAULT 4.5,
    "reviewCount" INTEGER DEFAULT 100,
    "discountPercentage" INTEGER DEFAULT 0,
    "isOutOfStock" BOOLEAN NOT NULL DEFAULT false,
    "isNew" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformListing" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "externalId" TEXT,
    "productUrl" TEXT,
    "searchUrl" TEXT,
    "currentPricePaise" INTEGER,
    "availability" TEXT NOT NULL DEFAULT 'available',
    "isStale" BOOLEAN NOT NULL DEFAULT false,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "sourceType" TEXT NOT NULL DEFAULT 'mock',
    "lastObservedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformListing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceObservation" (
    "id" TEXT NOT NULL,
    "productId" TEXT,
    "platform" TEXT NOT NULL,
    "rawTitle" TEXT NOT NULL,
    "pricePaise" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "availability" TEXT NOT NULL DEFAULT 'available',
    "locationKey" TEXT NOT NULL DEFAULT 'delhi_110001',
    "sourceType" TEXT NOT NULL DEFAULT 'mock',
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PriceObservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformFeeRule" (
    "id" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "locationKey" TEXT NOT NULL DEFAULT 'delhi_110001',
    "deliveryFeePaise" INTEGER,
    "handlingFeePaise" INTEGER,
    "handlingFeeRangeMinPaise" INTEGER,
    "handlingFeeRangeMaxPaise" INTEGER,
    "platformFeePaise" INTEGER,
    "freeDeliveryThresholdPaise" INTEGER,
    "minimumOrderValuePaise" INTEGER,
    "sourceType" TEXT NOT NULL DEFAULT 'mock',
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformFeeRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroceryList" (
    "id" TEXT NOT NULL,
    "locationId" TEXT NOT NULL DEFAULT 'delhi_110001',
    "pincode" TEXT NOT NULL DEFAULT '110001',
    "budgetPaise" INTEGER,
    "strategy" TEXT DEFAULT 'optimized_multi_platform',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GroceryList_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroceryListItem" (
    "id" TEXT NOT NULL,
    "listId" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "unit" TEXT NOT NULL DEFAULT 'pcs',
    "requiredVariant" TEXT,
    "allowSubstitutions" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GroceryListItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OptimizationResult" (
    "id" TEXT NOT NULL,
    "listId" TEXT,
    "locationId" TEXT NOT NULL DEFAULT 'delhi_110001',
    "pincode" TEXT NOT NULL DEFAULT '110001',
    "baselineName" TEXT NOT NULL,
    "baselineTotalPaise" INTEGER NOT NULL,
    "optionsJson" TEXT NOT NULL,
    "warnings" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OptimizationResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Category_slug_key" ON "Category"("slug");

-- CreateIndex
CREATE INDEX "Category_slug_idx" ON "Category"("slug");

-- CreateIndex
CREATE INDEX "Product_brand_idx" ON "Product"("brand");

-- CreateIndex
CREATE INDEX "Product_categoryId_idx" ON "Product"("categoryId");

-- CreateIndex
CREATE INDEX "Product_name_idx" ON "Product"("name");

-- CreateIndex
CREATE INDEX "PlatformListing_platform_availability_idx" ON "PlatformListing"("platform", "availability");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformListing_productId_platform_key" ON "PlatformListing"("productId", "platform");

-- CreateIndex
CREATE INDEX "PriceObservation_platform_observedAt_idx" ON "PriceObservation"("platform", "observedAt");

-- CreateIndex
CREATE INDEX "PriceObservation_productId_platform_idx" ON "PriceObservation"("productId", "platform");

-- CreateIndex
CREATE INDEX "PlatformFeeRule_platform_locationKey_idx" ON "PlatformFeeRule"("platform", "locationKey");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformFeeRule_platform_locationKey_key" ON "PlatformFeeRule"("platform", "locationKey");

-- CreateIndex
CREATE INDEX "GroceryList_pincode_idx" ON "GroceryList"("pincode");

-- CreateIndex
CREATE INDEX "GroceryListItem_listId_idx" ON "GroceryListItem"("listId");

-- CreateIndex
CREATE INDEX "OptimizationResult_locationId_createdAt_idx" ON "OptimizationResult"("locationId", "createdAt");

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformListing" ADD CONSTRAINT "PlatformListing_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceObservation" ADD CONSTRAINT "PriceObservation_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroceryListItem" ADD CONSTRAINT "GroceryListItem_listId_fkey" FOREIGN KEY ("listId") REFERENCES "GroceryList"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OptimizationResult" ADD CONSTRAINT "OptimizationResult_listId_fkey" FOREIGN KEY ("listId") REFERENCES "GroceryList"("id") ON DELETE SET NULL ON UPDATE CASCADE;

