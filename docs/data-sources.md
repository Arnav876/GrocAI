# GroqAI Data Sources Taxonomy & Governance Policy

This document defines the technical and regulatory classification of data sources permitted within GroqAI.

---

## 1. Data Source Taxonomy

| Source Type | Description | Confidence Score | Freshness TTL | Legal Basis | UI Label |
| :--- | :--- | :---: | :---: | :--- | :--- |
| `mock` | Local synthetic fixture catalog representing common grocery staples and tricky test cases. | 1.0 (internal test) | Indefinite / 6h alert | Development sandbox | `Estimate - MOCK` |
| `manual` | Operator-audited or community submitted price observations for local pincodes. | 0.80 (<24h)<br>0.40 (>24h) | 24 Hours | User-submitted fair use; non-commercial crowd intelligence | `Indicative` |
| `permitted_page` | Supervised, user-controlled browser session where the user explicitly navigates and views merchant page. | 0.90 | 4 Hours | User-supervised fair dealing; zero headless botting | `User Verified` |
| `partner_feed` | Direct JSON/CSV catalog feed provided under bilateral enterprise partner agreement. | 1.00 | Per SLA (typically 2-4h) | Executed Commercial Partner Agreement | `Partner Feed` |
| `authorized_api` | Authenticated REST API endpoint provided under merchant developer terms. | 1.00 | Real-time / 1h cache | Developer API License | `Live Verified` |

---

## 2. Integrity & Financial Rules

### 1. Integer Paise Standard
- Every price, fee, subtotal, and discount is calculated in integer paise ($1\text{ INR} = 100\text{ paise}$).
- No floating-point operations are permitted in price calculation or aggregation.

### 2. Unknown Fees Are Strictly Preserved
- Missing handling, delivery, or surge fees are **NEVER converted to 0**.
- If a merchant charges an unpublished or dynamic fee, it is recorded as `null` or an estimated `{ minPaise, maxPaise }` range with `hasUnknownFees: true`.

### 3. Price Staleness TTL
- All observations older than **6 hours** are flagged as `isStale: true` and surfaced in the UI with a clock icon.
- Background maintenance jobs monitor stale records and raise observability alerts.

### 4. Zero Credential / Zero Payment Policy
- GroqAI never requests, stores, or transmits merchant usernames, passwords, OTPs, session tokens, or payment credentials.
- All transactions execute on the platform's official checkout.
