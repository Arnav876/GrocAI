# Verified Platform Capabilities Matrix

**Audit Date:** 2026-10-13  
**Auditor:** Autonomous Systems Engineer, GroqAI  
**Status:** Product Vision / Zero Live API Access Confirmed  

> [!CRITICAL]
> **LEGAL & TECHNICAL STATUS STATEMENT**  
> As of October 2026, **NO platform (Blinkit, Zepto, Swiggy Instamart, BigBasket) has verified live authorized API access or automated cart creation rights** granted to GroqAI.  
> GroqAI operates strictly on mock catalogs, indicative manual observations, and direct merchant deep/search links. Cart creation is disabled across all connectors via `NullCartAdapter`. Under no circumstances may an automated bot, headless scraper, or reverse-engineered endpoint be engaged without executed bilateral commercial agreements.

---

## 1. Platform Capability Verification Matrix

| Platform | searchProducts | getPrices | getAvailability | getFees | createCart | supportsDeepLinks | Verified Method | Date Audited | Verification Evidence |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :--- | :--- | :--- |
| **Blinkit** | ❌ (Unverified) | ❌ (Unverified) | ❌ (Unverified) | ❌ (Unverified) | ❌ (Unsupported) | ⚠️ (Search Links Only) | `MockConnector` / Search Query | 2026-10-13 | No public developer API documented; terms prohibit automated catalog harvesting. |
| **Zepto** | ❌ (Unverified) | ❌ (Unverified) | ❌ (Unverified) | ❌ (Unverified) | ❌ (Unsupported) | ⚠️ (Search Links Only) | `MockConnector` / Search Query | 2026-10-13 | No public developer API documented; Cloudflare anti-bot active on consumer endpoints. |
| **Swiggy Instamart**| ❌ (Unverified) | ❌ (Unverified) | ❌ (Unverified) | ❌ (Unverified) | ❌ (Unsupported) | ⚠️ (Search Links Only) | `MockConnector` / Search Query | 2026-10-13 | Consumer mobile API requires session token and device fingerprint; botting strictly prohibited. |
| **BigBasket** | ❌ (Unverified) | ❌ (Unverified) | ❌ (Unverified) | ❌ (Unverified) | ❌ (Unsupported) | ⚠️ (Search Links Only) | `MockConnector` / Search Query | 2026-10-13 | Enterprise B2B Tata Digital portal requires commercial SLA; handling fee varies dynamically. |

---

## 2. Capabilities Breakdown

### A. Product Search & Price Reading (`searchProducts`, `getPrices`, `getAvailability`)
- **Current Production Mode:** `mock` (reading local seeded PostgreSQL database records explicitly stamped `sourceType: "mock"`).
- **Secondary Safe Mode:** `manual` (reading community or operator entered price records stamped `sourceType: "manual"` and labelled "Indicative").
- **Live Automated Scraping:** **STRICTLY PROHIBITED**. GroqAI refuses to bypass Cloudflare, DataDome, Akamai, CAPTCHAs, or rate limits.

### B. Dynamic Fee Structure (`getFees`)
- **Blinkit:** ₹15 delivery, ₹4 handling, ₹3 platform fee, free delivery above ₹199, min order ₹99.
- **Zepto:** ₹25 delivery, ₹5 handling, ₹2 platform fee, free delivery above ₹149, min order ₹99.
- **Swiggy Instamart:** ₹30 delivery, ₹5 surge/handling, ₹4 platform fee, free delivery above ₹199, min order ₹100.
- **BigBasket:** ₹30 delivery, **UNKNOWN handling fee** (modelled deterministically as ₹5 – ₹15 range, NEVER defaulted to ₹0), ₹3 platform fee, free delivery above ₹250, min order ₹150.

### C. Cart Creation & Handoff (`createCart`)
- **Capability:** `false` across all 4 platforms.
- **Adapter Active:** `NullCartAdapter`.
- **Handoff Mechanism:** GroqAI generates a formatted merchant shopping checklist and official web/app search URLs. The user reviews items, confirms address, and pays directly within the merchant's checkout.

---

## 3. Immediate Kill-Switch Architecture
Every platform connector is equipped with an isolated circuit breaker and emergency administrative kill switch accessible via:
- Admin API: `POST /api/admin/platforms/:id/kill-switch`
- Environment Variable: `<PLATFORM>_INTEGRATION_MODE=links_only`
- Execution: Immediate cutoff without application restarts.
