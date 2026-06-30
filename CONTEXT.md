# ScamShield BD — Project Context & Handoff Document

> **Purpose:** This file is the single source of truth for any AI assistant picking up this project.
> Read this file first before touching any code. It tracks every decision made, every file built, and exactly what comes next.

---

## What Is This Project?

**ScamShield BD** is a zero-cost, crowdsourced + AI-powered scam and fraud verification platform built specifically for Bangladesh's online commerce ecosystem (F-Commerce / E-Commerce).

It solves one core problem: **A Bangladeshi shopper has no way to verify if a Facebook shop, bKash number, or online store is a known scammer before sending money.**

It also solves the reverse: **A seller has no way to check if a buyer's phone number is a repeat delivery-refuser before accepting a COD order.**

### Key Constraint
**Total operational cost must be $0.00/month forever.** No paid tiers. No credit cards. Only permanent free tiers of cloud services.

---

## Technology Stack (Final Decisions — Do Not Change)

| Layer | Technology | Why |
|---|---|---|
| Frontend + SSR | **Astro v7** | Already installed. SSR via Cloudflare adapter. |
| Hosting | **Cloudflare Pages** | Free, global CDN, unlimited bandwidth |
| Backend/API | **Cloudflare Workers** (via Astro API routes) | Astro `src/pages/api/*.ts` files compile to Workers automatically |
| Database | **Cloudflare D1** | SQLite at edge. Free: 5GB, 25M reads/day, 50K writes/day |
| File Storage | **Cloudflare R2** | Evidence screenshots. Free: 10GB, 1M writes/month |
| Primary AI | **Groq API** | Fastest free inference. 14,400 req/day. Llama 3.3 70B |
| Fallback AI | **Google Gemini API** | 1,500 req/day free. Gemini 2.0 Flash |
| Edge AI | **Cloudflare Workers AI** | For embeddings/semantic search. Built into Cloudflare |
| Web Search | **Bing Search API** (F0 free tier) | 1,000 searches/month. For unknown entity scans |
| URL Safety | **Google Safe Browsing API** | 10,000 checks/day free |
| Domain Age | **WHOIS JSON API** | Free. Detects shops under 90 days old |
| Site Scanner | **URLScan.io API** | Free. Full website safety scan |
| CSS Framework | **Tailwind CSS v4** | Installed via `@tailwindcss/vite`. Use `@import "tailwindcss"` syntax |
| UI Components | **React 19** | For interactive islands (search bar, forms). Use `client:load` |
| Scraper | **WXT Framework** (separate project) | Browser extension. Built in Phase 5. |
| Language | **TypeScript** | All files |

### Critical Tailwind v4 Rules (Do Not Break)
- Import: `@import "tailwindcss"` (NOT `@tailwind base/components/utilities`)
- Custom utilities: `@utility name { }` (names must be alphanumeric, lowercase start — **no pseudo-elements like `::before` in utility names**)
- Design tokens: `@theme { }` block (NOT `tailwind.config.js`)
- Important modifier: `bg-red-500!` (NOT `!bg-red-500`)
- Arbitrary CSS vars: `bg-(--my-var)` (NOT `bg-[--my-var]`)

---

## Design System (Defined in `src/styles/global.css`)

### Color Palette
| Token | Value | Use |
|---|---|---|
| `--color-canvas` | `#ffffff` | Page background |
| `--color-surface` | `#eeece7` | Section backgrounds / stone accents |
| `--color-card` | `#ffffff` | Card backgrounds |
| `--color-border` | `#d9d9dd` | Default borders |
| `--color-danger` | `#b30000` | Confirmed scam, high risk, primary CTA |
| `--color-safe` | `#006654` | Safe / no reports found |
| `--color-caution` | `#b37400` | Caution / warning |
| `--color-accent` | `#1863dc` | Seller/business mode, secondary actions |
| `--color-text-primary` | `#17171c` | Main text |
| `--color-text-secondary` | `#616161` | Subtext |
| `--color-text-muted` | `#93939f` | Metadata, labels |

### Fonts
- **Body/UI:** `Inter` (Google Fonts)
- **Mono/Code:** `JetBrains Mono` (for phone numbers, identifiers)

### Risk Level System
| Risk | Color | Label |
|---|---|---|
| `confirmed` | danger red | `CONFIRMED SCAM` |
| `high` | danger red (dimmer) | `HIGH RISK` |
| `caution` | caution yellow | `CAUTION` |
| `safe` | safe green | `SAFE` |

---

## Project File Structure

```
c:\projects\ScamShield\
├── CONTEXT.md                    ← THIS FILE — read first
├── DESIGN.md                     ← Cohere-inspired design system reference
├── AGENTS.md                     ← AI dev rules (use `astro dev` background mode)
├── astro.config.mjs              ← Astro config (output: server, Cloudflare adapter)
├── wrangler.jsonc                ← Cloudflare wrangler config (auto-generated)
├── package.json                  ← Dependencies
├── tsconfig.json                 ← TypeScript config
├── .agents/
│   └── skills/
│       ├── update-context/
│       │   └── SKILL.md          ← Run after every task to keep this file accurate
│       ├── tailwind-4-docs/      ← Tailwind v4 docs reference
│       ├── frontend-design/      ← Frontend design guidelines
│       └── web-design-guidelines/ ← UI/UX review checklist
├── public/
│   └── favicon.svg               ← Red S lettermark favicon
└── src/
    ├── styles/
    │   └── global.css            ← Full design system (Tailwind v4 tokens + utilities)
    ├── layouts/
    │   └── Layout.astro          ← Base layout (nav, footer, SEO meta)
    ├── components/
    │   ├── SearchBar.tsx         ← React island — dual-mode search (buyer/seller tabs)
    │   └── Welcome.astro         ← Default Astro starter (UNUSED — ignore)
    ├── assets/
    │   ├── astro.svg             ← Default Astro asset (UNUSED — ignore)
    │   └── background.svg        ← Default Astro asset (UNUSED — ignore)
    └── pages/
        ├── index.astro           ← Homepage (hero, search, stats, recent reports, seller CTA)
        ├── report.astro          ← Public report page (multi-step React form island)
        ├── search.astro          ← Search results page (found / not-found states)
        └── admin/
            └── index.astro       ← Admin dashboard (review queue, stats, actions)
        └── api/
            ├── report.ts         ← Report submission POST endpoint
            ├── search.ts         ← Search API endpoint (currently mock data)
            ├── scrape-ingest.ts  ← Extension scraped posts ingestion POST endpoint
            └── admin/
                ├── queue.ts      ← Returns filtered pending reports queue
                └── review.ts     ← Approve/reject action endpoint
```

---

## Build Phases — Progress Tracker

### ✅ Phase 1 — Foundation Setup — COMPLETE
- [x] Astro v7 project initialized
- [x] Cloudflare adapter installed (`@astrojs/cloudflare`)
- [x] React 19 installed (`@astrojs/react`)
- [x] Tailwind CSS v4 installed (`@tailwindcss/vite`)
- [x] `astro.config.mjs` set to `output: 'server'` + Cloudflare adapter
- [x] `wrangler.jsonc` auto-generated by astro add
- [x] Design system created in `src/styles/global.css`
- [x] Base layout created in `src/layouts/Layout.astro`

> **NOT YET DONE in Phase 1:** Cloudflare account setup, D1 database creation, R2 bucket creation, and API key collection — these require the user's own Cloudflare account. Do these steps before deploying.

---

### ✅ Phase 2 — Core Search — COMPLETE
- [x] `src/components/SearchBar.tsx` — React island with buyer/seller mode tabs, animated focus states, example chips
- [x] `src/pages/index.astro` — Full homepage: hero section, dual-mode search, stats bar, "How It Works" cards, recent reports list, seller CTA banner
- [x] `src/pages/search.astro` — Results page with:
  - Found state: risk header card, AI fraud flags section, complaint reports list, submit CTA
  - Not-found state: green "no reports" card, AI scan placeholder, search again / report buttons
- [x] `src/pages/api/search.ts` — Search API with mock database (4 entities). Returns structured JSON.
- [x] Dev server tested and working locally at `http://localhost:4321`
- [x] Both buyer mode and seller mode searches working
- [x] Confirmed scam, high risk, and not-found result states all rendering correctly

> **IMPORTANT:** The search API currently uses a **mock in-memory database**. In Phase 3+, this will be replaced with real Cloudflare D1 queries.

---

### ✅ Phase 3 — Reporting System + Admin Dashboard — COMPLETE
- [x] `src/pages/report.astro` — Public report submission page with dual-mode prefilling
- [x] `src/components/ReportForm.tsx` — Multi-step React form with front-end validation, image upload, and state management
- [x] `src/pages/admin/index.astro` — Admin dashboard with password-gate login, queue stats, and action dispatchers
- [x] `src/pages/api/report.ts` — POST endpoint: validates form and processes uploads (uses chunked custom base64 encoder)
- [x] `src/pages/api/admin/queue.ts` — GET endpoint: returns pending reports queue
- [x] `src/pages/api/admin/review.ts` — POST endpoint: approves or rejects a pending report in-memory
- [x] Custom base64 chunked encoder built into report endpoint to prevent call stack size limits in Vite/workerd environments
- [x] Window global bindings added for administrative onclick review and filtering handlers
- [x] Verified complete flow: Report submission -> Admin Queue -> Approve Action -> Queue Status Updates

---

### ✅ Phase 4 — AI Fraud Indicator Analyzer — COMPLETE
- [x] Wire up the "AI Safety Scan" section on the not-found results page (created `AISafetyScan.tsx` React island)
- [x] Call WHOIS/RDAP API → extract domain age → flag if under 90 days
- [x] Call Google Safe Browsing API → flag if URL is on phishing/malware list
- [x] Call URLScan.io API → get safety verdict
- [x] Call Bing Search API → search `"{query} scam complaint Bangladesh"` → collect top snippets
- [x] Send signals to Groq/Gemini fallback inference chain in JSON mode
- [x] Cache result in D1/mock `ai_cache` table for 24 hours (preventing redundant AI queries)
- [x] Implemented dynamic environment bindings via a unified `getEnv` module compatible with Astro v7 Cloudflare Worker virtual environments.
- [x] Implemented unified dual-mode storage wrapper `db.ts` to seamlessly swap between production Cloudflare D1/R2 and development `globalThis` mock storage.

**API keys needed (bound in Cloudflare Pages as Secrets or locally in `.dev.vars` / `.env`):**
- `GROQ_API_KEY` — from groq.com (free)
- `GEMINI_API_KEY` — from aistudio.google.com (free)
### ✅ Phase 5 — Browser Extension — COMPLETE
**Goal:** Chrome extension that scrapes complaint posts from Bangladesh Facebook groups and sends data to `/api/scrape-ingest`.

**Separate project:** Lives at `c:\projects\ScamShieldExtension\` (NOT inside this Astro repo)

**Key notes:**
- [x] Initialized WXT project with React and NPM
- [x] Implemented content script to extract poster name, post text, phone numbers, and page links
- [x] Injected interactive "Send to ScamShield" buttons on Facebook posts
- [x] Created settings popup to configure backend credentials and verify API connection
- [x] Built the ingestion endpoint `/api/scrape-ingest` on the Astro server
- [x] Verified end-to-end ingestion from WXT build outputs to D1 SQLite tables

**Endpoint created:**
- `src/pages/api/scrape-ingest.ts` — POST endpoint authenticated with `X-Scrape-Key` header

---

### ✅ Phase 6 — Seed Data, Polish & Launch — COMPLETE
- [x] Populate `db/seed.sql` with 20+ realistic e-commerce scam records and seed D1 database
- [x] Format long entity URLs as clean links on the admin page
- [x] Create combined About & FAQ page with extension installation guide
- [x] Create dedicated success redirect page `/report-success`
- [x] Enable local R2 bucket simulation binding `EVIDENCE_BUCKET` in `wrangler.jsonc`
- [x] Create secure R2 image delivery API proxy `src/pages/api/evidence.ts`
- [x] Update `scrape-ingest.ts` to download images, upload to simulated R2, and save keys in D1
- [x] Overhaul extension post container selection to target feed child elements (`closest('[role="feed"] > *')`) and prevent comments from matching as top-level posts


---

## D1 Database Schema (Reference — Not Created Yet)

```sql
-- Entities being tracked (shops, phone numbers, Facebook pages, buyer profiles)
CREATE TABLE entities (
  id           TEXT PRIMARY KEY,
  type         TEXT NOT NULL,          -- 'SELLER' or 'BUYER'
  identifier   TEXT NOT NULL,          -- original input (phone, URL, shop name)
  normalized   TEXT NOT NULL,          -- lowercase, stripped for matching
  risk         TEXT DEFAULT 'unknown', -- 'confirmed', 'high', 'caution', 'safe', 'unknown'
  complaint_count INTEGER DEFAULT 0,
  first_seen   TEXT,
  updated_at   TEXT
);
CREATE INDEX idx_entities_normalized ON entities(normalized);

-- Individual complaint reports
CREATE TABLE reports (
  id           TEXT PRIMARY KEY,
  entity_id    TEXT REFERENCES entities(id),
  reporter_type TEXT NOT NULL,         -- 'BUYER' or 'SELLER'
  complaint_text TEXT,
  incident_date TEXT,
  amount_lost  REAL,
  evidence_r2_key TEXT,               -- R2 object key for screenshot
  source       TEXT DEFAULT 'CROWDSOURCED', -- 'CROWDSOURCED' or 'SCRAPED'
  status       TEXT DEFAULT 'PENDING', -- 'PENDING', 'APPROVED', 'REJECTED'
  reviewed_at  TEXT,
  created_at   TEXT
);## Cloudflare Setup Checklist (User Must Do — Requires Their Account)

- [x] Create Cloudflare account at cloudflare.com
- [x] Create D1 database named `scamshield-db`
- [x] Create R2 bucket named `scamshield-evidence`
- [x] Link GitHub repo to Cloudflare Pages
- [x] Add D1 binding in Pages settings: variable name `DB`, database `scamshield-db`
- [x] Add R2 binding in Pages settings: variable name `EVIDENCE_BUCKET`, bucket `scamshield-evidence`
- [x] Add environment secrets in Pages settings:
  - [x] `ADMIN_SECRET_KEY` — any strong random string (for admin dashboard auth)
  - [x] `SCRAPE_INGEST_KEY` — any strong random string (for browser extension auth)
  - [x] `GROQ_API_KEY`
  - [ ] `GEMINI_API_KEY`
  - [ ] `BING_SEARCH_KEY`
  - [ ] `GOOGLE_SAFE_BROWSING_KEY`
  - [ ] `URLSCAN_API_KEY`

---

## Dev Server

```bash
# Start dev server (per AGENTS.md rules — use background flag in this project)
npx astro dev --port 4321

# The dev server runs at: http://localhost:4321
# Takes ~40 seconds on first run (Cloudflare wrangler bundling)
```

---

## Key Decisions Already Made (Don't Revisit)

1. **Astro SSR over static** — Required for dynamic search results and server-side D1 queries
2. **No user accounts/login** — Search is fully public and anonymous. Only admin has a login (simple secret key).
3. **Mandatory evidence upload** — Reports require a screenshot. Hard gate. No exceptions.
4. **Admin review before publish** — No crowdsourced report goes public without manual admin approval.
5. **24-hour AI cache** — Same entity won't trigger AI twice within a day. Saves free tier quota.
6. **Phone number normalization** — Strip spaces, dashes, leading 0, country code (+880) for consistent matching.
7. **Groq → Gemini → Workers AI fallback chain** — Never fail silently; always return something to the user.
8. **Browser extension is a separate project** — Not inside the Astro repo. Communicates only via the `/api/scrape-ingest` HTTP endpoint.
9. **Vite Watcher .wrangler Exclude** — Excluded the `.wrangler` state folder in `astro.config.mjs` to stop SQLite updates from initiating infinite watcher-triggered hot module reloads.
10. **Client-Only React Components** — Forced dynamic React components to load via `client:only="react"` to resolve SSR duplicate package hook resolution bugs in local dev.
11. **Extension CORS Bypass via Message Passing** — Delegated API queries (ingestion and connection validation) from the extension content script and popup script to the background service worker using `browser.runtime.sendMessage`. This bypasses browser-enforced page CORS and Astro dev-server cross-site security checks by utilising extension host permissions.
12. **Comment Duplication & Scraper Refinements** — Overhauled the extension container selection to start from post-specific indicator elements and climb up to the feed item child (`closest('[role="feed"] > *')`). This resolves the issue where comments (which still use `role="article"`) were matched as top-level posts on Facebook Group feeds since Facebook removed `role="article"` from posts.
13. **Dynamic Scraped Photo Extraction** — Configured the admin review card to parse photo links inside scraped complaint text and render them as a thumbnail gallery grid on the fly, using `referrerpolicy="no-referrer"` to bypass Facebook CDN referrer-based hotlinking protection.
14. **Local Cloudflare R2 Bucket Simulation** — Added an `EVIDENCE_BUCKET` binding in `wrangler.jsonc` to automatically spin up a local mock R2 store in `.wrangler/state/v3/r2/` during local development, preventing reliance on hotlinking expiring Facebook CDN links.
15. **Server-Side Ingestion Downloader** — Implemented server-side image downloading in `src/pages/api/scrape-ingest.ts` to download scraped image URLs on the server, upload them to R2, and save their keys in the database.
16. **Private Evidence Delivery Proxy** — Created the `src/pages/api/evidence.ts` proxy endpoint to serve files stored in the private R2 bucket securely with caching.
17. **Admin Lightbox, Image Navigation, and Permanent Delete** — Added a CSS/JS lightbox modal to preview evidence and scraped photos inline on the admin dashboard, preventing disruptive external redirects. Added **image navigation** to the lightbox, enabling next/prev buttons, keyboard arrow key listeners (left/right), and a dynamic counter (e.g., `1 / 4`) to easily cycle through all evidence and scraped photos for each report. Integrated a permanent delete button on all cards that wipes reports and updates the corresponding entities' complaint counts.
18. **Multi-Entity Substring Match** — Upgraded search matching to support dynamic case-insensitive substring checks and multiple matches selectors, preventing single first-row selection errors.

---

*Last updated: Live hosting completed on Cloudflare. Case-insensitive substring matching and multiple-matches selection layout implemented.*ightbox, enabling next/prev buttons, keyboard arrow key listeners (left/right), and a dynamic counter (e.g., `1 / 4`) to easily cycle through all evidence and scraped photos for each report. Integrated a permanent delete button on all cards that wipes reports and updates the corresponding entities' complaint counts.

---

*Last updated: Phase 6 complete. Admin dashboard polished with inline image lightbox, image navigation, and permanent delete functionality.*


