# DOSafe — System Architecture

**Updated:** 2026-03-04
**Status:** AI Detection (Phase 1–5.5) COMPLETE. Threat Intel Pipeline COMPLETE. Audio/Video TODO.

## What is DOSafe?

DOSafe is a safety platform that detects AI-generated content and identifies online scams. It serves users through three interfaces: a web app (dosafe.io), a Telegram bot, and a Chrome extension.

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         INTERFACES                               │
│                                                                  │
│  dosafe.io (web)     Telegram Bot      Chrome Extension          │
│  Next.js 16          Supabase Edge     Content script            │
│  Vercel              Deno 2            Manifest V3               │
│       │                   │                 │                    │
│       └───────────────────┼─────────────────┘                    │
│                           ▼                                      │
│                    API Routes (Next.js)                           │
│                    dosafe.io/api/*                                │
├──────────────────────────────────────────────────────────────────┤
│                         API LAYER                                │
│                                                                  │
│  /api/detect          AI text detection (multi-tier)             │
│  /api/detect-image    AI image detection (C2PA + EXIF + LLM)    │
│  /api/url-check       URL/domain scam check (DB + runtime)      │
│  /api/entity-check    Phone/wallet/email risk check              │
│  /api/extract-text    Document text extraction (PDF/DOCX)        │
│  /api/quota           Quota status query                         │
├──────────────────────────────────────────────────────────────────┤
│                    DATA & INTELLIGENCE                            │
│                                                                  │
│  Supabase PostgreSQL                                             │
│  ├── dosafe schema: threat_intel, threat_clusters, sync_log      │
│  ├── dosai schema: user usage/quota                              │
│  └── public schema: bot_quota                                    │
│                                                                  │
│  DOS Chain (EAS attestations)                                    │
│  └── Schema 6: dos.entity.flag (on-chain safety flags)           │
│                                                                  │
│  External APIs                                                   │
│  ├── vLLM (api.dos.ai) — Qwen3.5-35B scorer                    │
│  ├── vLLM (inference-ref.dos.ai) — Qwen3-8B observer            │
│  ├── Google Safe Browsing, Cloud Vision                          │
│  ├── Serper / SerpApi (search + reverse image)                   │
│  └── RDAP/WHOIS (domain registration)                            │
└──────────────────────────────────────────────────────────────────┘
```

## Project Structure

```
DOSafe/
├── apps/
│   ├── web/                    # Main web app (dosafe.io) — Next.js 16 + React 19
│   │   └── src/
│   │       ├── app/
│   │       │   ├── api/        # API routes (detect, detect-image, url-check, entity-check, ...)
│   │       │   ├── page.tsx    # Landing page
│   │       │   └── ...         # Static pages (about, pricing, privacy, terms)
│   │       └── lib/            # Shared libraries
│   │           ├── threat-intel.ts    # Threat DB lookup/upsert
│   │           ├── doschain.ts        # DOS Chain EAS queries (viem)
│   │           ├── dosafe-quota.ts    # Quota management
│   │           ├── trusted-domains.ts # Whitelisted domains
│   │           ├── url-normalize.ts   # URL normalization + hashing
│   │           └── dosai-session.ts   # Auth session validation
│   └── extension/              # Chrome extension (Manifest V3)
│       ├── manifest.json
│       ├── popup.js/html/css   # Extension popup UI
│       ├── background.js       # Service worker
│       └── content-facebook.js # Facebook-specific content script
├── supabase/
│   ├── functions/
│   │   ├── dosafe-telegram/    # Telegram bot (Deno 2 Edge Function)
│   │   ├── sync-threats/       # Threat intel sync from external sources
│   │   └── _shared/            # Shared utilities (detect, quota, llm, telegram, language)
│   ├── migrations/             # DB schema migrations
│   └── config.toml             # Supabase CLI config
├── benchmark/raid/             # RAID benchmark submission scripts
└── docs/
    ├── DOSafe-Architecture.md  # This file
    ├── threat-intel.md         # Threat intelligence system (detailed)
    └── plans/                  # Design docs and implementation plans
```

## Core Features

### 1. AI Text Detection (`/api/detect`)

Multi-tier pipeline combining statistical analysis, zero-shot model comparison, and LLM judgment.

```
Input text (50–5000 chars)
  │
  ├── Tier 1: Statistical Analysis (<10ms)
  │   ├── Perplexity (via vLLM logprobs)
  │   └── Burstiness (sentence-level perplexity variance)
  │
  ├── Tier 2: Binoculars — Zero-Shot Model Comparison (~2s)
  │   ├── Scorer: Qwen3.5-35B → compute perplexity
  │   ├── Observer: Qwen3-8B → compute cross-entropy
  │   └── Score = PPL(scorer) / CE(observer)
  │       AI text → both agree → ratio ≈ 1.0
  │       Human text → disagree → ratio >> 1.0
  │
  ├── Tier 3: LLM-as-Judge (~3s)
  │   ├── 19-criteria rubric (A–S)
  │   ├── Vietnamese-specific signals (particles, code-switching)
  │   ├── ESL de-biasing (R, S criteria)
  │   └── Paraphrase defense (P, Q criteria)
  │
  ├── Source Matching (parallel)
  │   └── Serper → SerpApi fallback (verbatim phrase search)
  │
  └── Score blending: 35% statistical + 65% rubric
      → ai_probability (0–100), verdict (AI/Human/Mixed), confidence
```

**Quota:** 10k words/day (anonymous), 50k/month (free), 500k/month (paid). Image = 500 words flat.

### 2. AI Image Detection (`/api/detect-image`)

```
Input image (≤10MB, JPEG/PNG/WEBP/GIF)
  │
  ├── Tier 0: C2PA Content Credentials (<50ms, deterministic)
  │   └── Cryptographic manifest → camera origin OR AI tool (100% accurate)
  │
  ├── Tier 1: Metadata Analysis
  │   ├── EXIF parsing (camera model, GPS, AI tool detection)
  │   ├── JPEG quantization / DCT analysis
  │   └── Reverse image search (Google Cloud Vision → Serper Lens)
  │
  └── Tier 3: LLM Visual Analysis (~3s)
      └── Multimodal analysis (texture, lighting, anatomy, edges)
      → Blend: 30% metadata + 70% visual rubric
      → Trusted source cap (2+ matches → cap ≤ 35%)
```

### 3. URL/Domain Scam Check (`/api/url-check`)

Hybrid DB-first + runtime fallback check. See [threat-intel.md](threat-intel.md) for full details.

```
Input URL
  │
  ├── 1. DB lookup (dosafe.threat_intel) — <10ms
  │   ├── Hash URL → lookup_threats()
  │   └── Hash domain → lookup_threats()
  │
  ├── 2. Runtime checks (parallel)
  │   ├── Trusted domain whitelist
  │   ├── Google Safe Browsing
  │   ├── WHOIS/RDAP domain age
  │   └── DOS Chain on-chain attestations
  │
  ├── 3. Risk assessment (combines all signals)
  │   → critical / high / medium / low / safe
  │
  └── 4. Cache runtime result (fire-and-forget, 7-day TTL)
```

### 4. Entity Risk Check (`/api/entity-check`)

Check risk for phone numbers, wallets, emails, bank accounts, etc.

```
Input: { entityType, entityId }
  │
  ├── DB lookup (dosafe.threat_intel) — parallel
  └── DOS Chain on-chain query — parallel (15s timeout)
      → Combined risk assessment + cluster linking
```

**Supported types:** phone, email, wallet, url, domain, bank_account, national_id, telegram

### 5. Telegram Bot (`supabase/functions/dosafe-telegram`)

Commands: `/detect`, `/scam`, `/phone`, `/quota`, `/help`, `/start`
Auto-detection: URLs, phone numbers, plain text, photos
Bilingual: Vietnamese + English (auto-detected)
Quota: 20 checks/day per chat

### 6. Chrome Extension (`apps/extension`)

- AI text detection on selected text or full page
- URL scam check on current page
- Facebook profile analysis (content script)
- Side panel results display

## Threat Intelligence Pipeline

Detailed in [threat-intel.md](threat-intel.md).

**Summary:**
- **255k+ entries** from MetaMask (233k domains), URLhaus (22k URLs), OpenPhish (300 URLs)
- **Schema:** `dosafe.threat_intel` in `dosafe` schema (separate from `public`)
- **Sync:** Edge Function via pg_cron every 6 hours, DB-side SHA-256 hashing
- **Lookup:** Hash entity value → query `entity_hash` index → aggregate multi-source signals
- **Caching:** Runtime check results auto-cached with 7-day TTL

### Cross-Product Integration

DOSafe's threat intel feeds into DOS.Me's Trust API:
```
dosafe.threat_intel (evidence store) → sync confirmed flags → public.safety_flags (DOS.Me gateway)
```
Other products (Rate.Box, Bexly) call `api.dos.me/trust/check` — they never query DOSafe directly.

## Database Layout

### Supabase Schemas

| Schema | Owner | Tables |
|--------|-------|--------|
| `dosafe` | DOSafe | `threat_intel`, `threat_clusters`, `sync_log` |
| `dosai` | DOS.AI | `dosafe_usage`, `user_settings` |
| `public` | Shared | `bot_quota`, `profiles`, `billing_accounts`, ... |

### Key Tables

| Table | Schema | Purpose |
|-------|--------|---------|
| `threat_intel` | dosafe | Unified threat data (255k+ entries) |
| `threat_clusters` | dosafe | Scammer group linking |
| `sync_log` | dosafe | Sync health monitoring |
| `bot_quota` | public | Telegram bot daily limits |
| `dosafe_usage` | dosai | User quota tracking |

## Infrastructure

### Compute

| Service | Host | Hardware | Purpose |
|---------|------|----------|---------|
| Scorer (Qwen3.5-35B-A3B-FP8) | api.dos.ai | RTX Pro 6000 (97GB) | LLM inference (text + image) |
| Observer (Qwen3-8B base) | inference-ref.dos.ai | RTX 5090 (32GB) | Binoculars cross-entropy |
| Web app | Vercel | Serverless | Next.js API routes + static pages |
| Edge Functions | Supabase | Deno 2 | Telegram bot + threat sync |
| Database | Supabase | PostgreSQL 17 | All data storage |
| DOS Chain | DOS Testnet (3939) | EVM | On-chain safety attestations |

### Key Environment Variables

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# AI Inference
DOS_INFERENCE_API_KEY=...
VLLM_OBSERVER_URL=https://inference-ref.dos.ai

# External APIs (all optional, degrade gracefully)
GOOGLE_SAFE_BROWSING_API_KEY=...
GOOGLE_CLOUD_VISION_API_KEY=...
SERPER_API_KEY=...
SERPAPI_API_KEY=...

# DOS Chain
DOS_TESTNET_RPC=https://test.doschain.com/...

# Telegram
TELEGRAM_BOT_TOKEN=...
DOSAFE_API_URL=https://dosafe.io
```

## AI Detection Research

### Text Detection — 19-Criteria Rubric (A–S)

**AI indicators (+):** Structure (A), Transitions (B), Consistent register (C), Even emotion (D), Generic examples (E), Hedging overuse (F), Uniform complexity (G), Repetitive structures (H), Paraphrase markers (P), Bypasser artifacts (Q)

**Human indicators (−):** Unexpected detail (I), Authentic messiness (J), Natural errors (K), Emotional spikes (L), ESL markers (R), Formulaic academic (S)

**Vietnamese-specific (−):** Particle usage (M), Code-switching (N), Informal markers (O)

### Key Papers

| Method | Paper | Use in DOSafe |
|--------|-------|---------------|
| Binoculars | ICML 2024 | Tier 2 — PPL ratio between scorer/observer |
| Fast-DetectGPT | ICLR 2024 | Alternative Tier 2 (not used) |
| C2PA | c2pa.org v2.1 | Tier 0 — deterministic image provenance |
| DivEye | 2025 | Informed rubric design (surprisal variability) |

### RAID Benchmark

| | |
|---|---|
| **Script** | `benchmark/raid/raid_submit.py` |
| **Total** | 672,000 texts |
| **Train AUROC** | **0.852** (target: 0.80+) |

### Image Detection Methods

- **C2PA:** Cryptographic content credentials (~40% of AI images have C2PA in 2026)
- **EXIF:** Camera metadata + AI tool detection in Software field
- **DCT:** JPEG quantization table analysis (camera-specific vs AI generic)
- **Reverse search:** Google Cloud Vision WEB_DETECTION → Serper Lens fallback
- **LLM visual:** Multimodal rubric analysis (texture, lighting, anatomy, edges)

## Roadmap

### Completed
- [x] Multi-tier text detection (statistical + Binoculars + LLM rubric)
- [x] Image detection (C2PA + EXIF/DCT + reverse search + LLM)
- [x] Paraphrase shield + ESL de-biasing
- [x] URL/domain scam check with on-chain integration
- [x] Telegram bot with bilingual support
- [x] Chrome extension
- [x] Threat intelligence pipeline (255k+ entries, 6h sync)
- [x] Quota system (anonymous + authenticated)

### In Progress
- [ ] RAID benchmark submission (672k texts)
- [ ] Binoculars threshold calibration (Vietnamese + English corpus)

### Planned
- [ ] User report command (/report) with LLM entity extraction
- [ ] Entity clustering (auto-link related scammer identities)
- [ ] Sync confirmed flags to DOS.Me Trust API
- [ ] Audio detection pipeline (TTS/voice cloning)
- [ ] Video detection pipeline (deepfake)
- [ ] Vietnamese-specific threat sources (chongluadao.vn)
