import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { SUPPORTED_PLATFORMS, PlatformId, PriceObservationSchema } from "@groqai/shared";
import { MockConnector } from "../connectors/mockConnector.js";
import { AuthorizedApiConnector } from "../connectors/authorizedApiConnector.js";
import { ManualPriceConnector } from "../connectors/manualPriceConnector.js";
import { LinksChecklistConnector } from "../connectors/linksChecklistConnector.js";
import { PlaywrightAssistedConnector } from "../connectors/playwrightAssistedConnector.js";
import { LicensedProviderConnector } from "../connectors/licensedProviderConnector.js";
import { FallbackPlatformConnector } from "../connectors/fallbackHierarchy.js";

describe("Phase 3 Connector Contract Tests", () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    prisma = new PrismaClient();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe("Non-Negotiable Legal & Capability Contracts", () => {
    it("every connector strictly reports createCart: false (automated cart creation is never falsely claimed)", () => {
      for (const pid of SUPPORTED_PLATFORMS) {
        const mock = new MockConnector(pid, prisma);
        const auth = new AuthorizedApiConnector(pid);
        const manual = new ManualPriceConnector(pid, prisma);
        const links = new LinksChecklistConnector(pid);
        const pw = new PlaywrightAssistedConnector(pid);
        const lic = new LicensedProviderConnector(pid);
        const fallback = new FallbackPlatformConnector(pid, prisma);

        expect(mock.getCapabilities().createCart).toBe(false);
        expect(auth.getCapabilities().createCart).toBe(false);
        expect(manual.getCapabilities().createCart).toBe(false);
        expect(links.getCapabilities().createCart).toBe(false);
        expect(pw.getCapabilities().createCart).toBe(false);
        expect(lic.getCapabilities().createCart).toBe(false);
        expect(fallback.getCapabilities().createCart).toBe(false);
      }
    });

    it("PlaywrightAssistedConnector is OFF by default and requires explicit opt-in", () => {
      for (const pid of SUPPORTED_PLATFORMS) {
        const pw = new PlaywrightAssistedConnector(pid);
        expect(pw.isEnabled()).toBe(false);
        expect(pw.getCapabilities().searchProducts).toBe(false);
      }
    });

    it("LicensedProviderConnector starts in stub status with governance metadata", () => {
      for (const pid of SUPPORTED_PLATFORMS) {
        const lic = new LicensedProviderConnector(pid);
        expect(lic.agreement.contractStatus).toBe("stub");
        expect(lic.agreement.dataRetentionMaxDays).toBeGreaterThan(0);
        expect(lic.agreement.attributionNotice).toContain("rights reserved");
      }
    });
  });

  describe("Data Contract & Schema Validation", () => {
    it("MockConnector returns validated PriceObservation objects conforming to shared Zod contract", async () => {
      for (const pid of SUPPORTED_PLATFORMS) {
        const conn = new MockConnector(pid, prisma);
        const results = await conn.searchProducts("Milk", "delhi_110001");
        expect(Array.isArray(results)).toBe(true);

        for (const item of results) {
          const validated = PriceObservationSchema.safeParse(item);
          expect(validated.success).toBe(true);
          expect(item.platform).toBe(pid);
          expect(item.currency).toBe("INR");
          expect(item.sourceType).toBe("mock");
          expect(typeof item.observedAt).toBe("string");
          expect(item.confidence).toBeGreaterThanOrEqual(0);
        }
      }
    });

    it("ManualPriceConnector marks observations with sourceType: 'manual' and indicative notices", async () => {
      for (const pid of SUPPORTED_PLATFORMS) {
        const conn = new ManualPriceConnector(pid, prisma);
        const results = await conn.searchProducts("Milk", "delhi_110001");
        for (const item of results) {
          const validated = PriceObservationSchema.safeParse(item);
          expect(validated.success).toBe(true);
          expect(item.sourceType).toBe("manual");
          expect(item.notes?.some((n) => n.includes("Indicative"))).toBe(true);
        }
      }
    });

    it("LinksChecklistConnector operates with zero API access and generates search/deep links", async () => {
      for (const pid of SUPPORTED_PLATFORMS) {
        const conn = new LinksChecklistConnector(pid);
        const searchLink = conn.buildSearchLink("fortune oil");
        expect(searchLink).toContain("fortune%20oil");

        const deepLink = conn.buildProductDeepLink("item123", "fortune oil");
        expect(deepLink.url.length).toBeGreaterThan(0);

        const checklist = conn.generateChecklist([
          { title: "Amul Milk", quantity: 2, unit: "L", estimatedPriceRupees: 60 },
        ]);
        expect(checklist).toContain("Amul Milk x 2 L (~₹60)");
        expect(checklist).toContain("GroqAI is not affiliated");
      }
    });
  });
});
