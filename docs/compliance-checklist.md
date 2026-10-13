# GroqAI Platform Go / No-Go Compliance Checklist

**Audit Date:** 2026-10-13  
**Status:** Mandatory Production Release Gate  
**Instruction:** Under no circumstances may any connector be placed into live production without all criteria verified and signed off. **EVERY BOX STARTS UNCHECKED `[ ]`. DO NOT TICK ANY BOX PRIOR TO FORMAL LEGAL AND COMMERCIAL EXECUTION.**

---

## 1. Blinkit (Zomato Quick Commerce)
- [ ] Merchant terms of service reviewed by legal counsel
- [ ] Written authorization or bilateral partner agreement executed
- [ ] Location-specific pricing and inventory tested across target pincodes
- [ ] Variants and pack sizes matched safely with deterministic guards (e.g. 500ml vs 1L, Taaza vs Gold)
- [ ] Delivery, handling, platform fees, free delivery threshold, and minimum order rules verified
- [ ] Data source and observation timestamp clearly displayed in user interface
- [ ] Zero bypass of login, CAPTCHA, Cloudflare, bot protection, or rate limits verified
- [ ] Zero storage of platform passwords, OTPs, session cookies, or payment information
- [ ] User reviews basket and executes payment exclusively on merchant's official checkout
- [ ] Fallback hierarchy verified to function gracefully if connector times out or fails

---

## 2. Zepto (KiranaKart Technologies)
- [ ] Merchant terms of service reviewed by legal counsel
- [ ] Written authorization or bilateral partner agreement executed
- [ ] Location-specific pricing and inventory tested across target pincodes
- [ ] Variants and pack sizes matched safely with deterministic guards
- [ ] Delivery, handling, platform fees, free delivery threshold, and minimum order rules verified
- [ ] Data source and observation timestamp clearly displayed in user interface
- [ ] Zero bypass of login, CAPTCHA, Cloudflare, bot protection, or rate limits verified
- [ ] Zero storage of platform passwords, OTPs, session cookies, or payment information
- [ ] User reviews basket and executes payment exclusively on merchant's official checkout
- [ ] Fallback hierarchy verified to function gracefully if connector times out or fails

---

## 3. Swiggy Instamart (Bundl Technologies)
- [ ] Merchant terms of service reviewed by legal counsel
- [ ] Written authorization or bilateral partner agreement executed
- [ ] Location-specific pricing and inventory tested across target pincodes
- [ ] Variants and pack sizes matched safely with deterministic guards
- [ ] Delivery, handling, platform fees, free delivery threshold, and minimum order rules verified
- [ ] Data source and observation timestamp clearly displayed in user interface
- [ ] Zero bypass of login, CAPTCHA, Cloudflare, bot protection, or rate limits verified
- [ ] Zero storage of platform passwords, OTPs, session cookies, or payment information
- [ ] User reviews basket and executes payment exclusively on merchant's official checkout
- [ ] Fallback hierarchy verified to function gracefully if connector times out or fails

---

## 4. BigBasket (Supermarket Grocery Supplies / Tata Digital)
- [ ] Merchant terms of service reviewed by legal counsel
- [ ] Written authorization or bilateral partner agreement executed
- [ ] Location-specific pricing and inventory tested across target pincodes
- [ ] Variants and pack sizes matched safely with deterministic guards
- [ ] Delivery, handling (including unknown fee range handling), platform fees, and minimum order rules verified
- [ ] Data source and observation timestamp clearly displayed in user interface
- [ ] Zero bypass of login, CAPTCHA, Cloudflare, bot protection, or rate limits verified
- [ ] Zero storage of platform passwords, OTPs, session cookies, or payment information
- [ ] User reviews basket and executes payment exclusively on merchant's official checkout
- [ ] Fallback hierarchy verified to function gracefully if connector times out or fails

---

## 5. Global Autonomous Production Invariant
> No connector can be enabled for live production without its documented go/no-go entry verified and signed off. As of October 2026, all platform connectors remain in **MOCK** or **MANUAL** mode with `createCart: false`.
