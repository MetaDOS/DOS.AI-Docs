# Threat Intelligence Data Pipeline — Design Document

**Date**: 2026-03-04
**Status**: Approved
**Goal**: Aggregate multiple threat data sources into a unified Supabase DB for fast scam/phishing checks + build a proprietary data moat through user reports and on-chain attestations.

## Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│                   DATA INGESTION                     │
│                                                      │
│  pg_cron (every 6h) → Edge Function: sync-threats    │
│                        ├── MetaMask eth-phishing      │
│                        ├── URLhaus (abuse.ch)         │
│                        ├── OpenPhish community        │
│                        └── DOS Chain on-chain sync    │
│                                    │                  │
│                                    ▼                  │
│                          dosafe.threat_intel          │
│                          (unified table)              │
│                                    ▲                  │
│  Telegram bot ─→ /report ─────────┘                  │
│  Web app      ─→ /report                             │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│                   CHECK FLOW (Hybrid)                │
│                                                      │
│  User sends URL/phone/wallet/etc.                    │
│           │                                          │
│           ▼                                          │
│  1. DB lookup (dosafe.threat_intel) — instant         │
│           │                                          │
│      Found? ─ Yes ─→ Aggregate signals + LLM explain │
│           │                                          │
│          No                                          │
│           │                                          │
│           ▼                                          │
│  2. Runtime checks (parallel)                        │
│     ├── Google Safe Browsing                         │
│     ├── WHOIS/RDAP                                   │
│     └── DOS Chain on-chain                           │
│           │                                          │
│           ▼                                          │
│  3. Cache result → INSERT into threat_intel          │
│           │                                          │
│           ▼                                          │
│  4. LLM synthesizes all signals → user response      │
└─────────────────────────────────────────────────────┘
```

DB provides raw evidence/signals. LLM is the analysis brain that synthesizes evidence into natural language explanations and recommendations.

## Database Schema

### Table: `dosafe.threat_intel`

Unified table for all threat entries from all sources.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid (PK) | Auto-generated |
| entity_type | text | domain, url, phone, wallet, email, telegram, bank_account, national_id, facebook, zalo, ... |
| entity_value | text | Normalized value |
| entity_hash | text | SHA-256 hex of entity_value (indexed for fast lookup) |
| source | text | metamask, urlhaus, openphish, onchain, user_report, runtime_cache |
| category | text | phishing, malware, scam, legitimate, unknown |
| risk_score | smallint | 0-100 |
| raw_data | jsonb | Source-specific metadata |
| cluster_id | uuid (FK, nullable) | Links to threat_clusters |
| first_seen_at | timestamptz | When first ingested |
| last_seen_at | timestamptz | Last time this entry was refreshed |
| expires_at | timestamptz (nullable) | Auto-expire for runtime_cache entries (e.g. 7 days) |
| status | text | active, expired, disputed |

**Constraints**:
- `UNIQUE (entity_hash, source)` — same entity can appear from multiple sources, one row per source
- Index on `entity_hash` for O(1) lookups
- Index on `source` for per-source queries
- Index on `cluster_id` for cluster member lookups

**Notes**:
- `entity_type` is a free text field, NOT an enum — new types can be added without migration
- `raw_data` preserves source-specific metadata (PhishTank target brand, URLhaus tags, etc.)

### Table: `dosafe.threat_clusters`

Groups related entities belonging to the same scammer/group.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid (PK) | Auto-generated |
| name | text | Human-readable label, e.g. "Binance VN scam group" |
| description | text (nullable) | Additional context |
| total_reports | int | Denormalized count of linked entries |
| max_risk_score | smallint | Highest risk_score across all members |
| created_at | timestamptz | |
| updated_at | timestamptz | |

**Usage**: When checking a phone number → find its cluster_id → query all entries in that cluster → return linked entities (bank accounts, other phones, IDs, etc.).

### Table: `dosafe.sync_log`

Monitoring table for sync health.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid (PK) | Auto-generated |
| source | text | Which source was synced |
| started_at | timestamptz | |
| finished_at | timestamptz | |
| entries_processed | int | Total entries from source |
| entries_added | int | New entries inserted |
| status | text | success, partial, failed |
| error | text (nullable) | Error message if failed |

## Data Sources — Phase 1

### MetaMask eth-phishing-detect
- **URL**: `https://raw.githubusercontent.com/MetaMask/eth-phishing-detect/main/src/config.json`
- **Format**: JSON — `{ blacklist: string[], whitelist: string[], fuzzylist: string[] }`
- **Size**: ~15k domains
- **Auth**: None
- **Sync strategy**: Full replace every 6h
- **Mapping**:
  - `blacklist` → entity_type: domain, category: phishing, risk_score: 90
  - `whitelist` → entity_type: domain, category: legitimate, risk_score: 0
  - `fuzzylist` → stored in raw_data for future fuzzy matching

### URLhaus (abuse.ch)
- **URL**: `https://urlhaus-api.abuse.ch/v1/urls/recent/`
- **Format**: JSON — `{ urls: [{ url, url_status, threat, tags }] }`
- **Size**: ~1k new URLs/day, ~100k total
- **Auth**: None
- **Sync strategy**: Upsert by URL every 6h
- **Mapping**: entity_type: url, category: malware, risk_score: 85, tags in raw_data

### OpenPhish Community Feed
- **URL**: `https://openphish.com/feed.txt`
- **Format**: Plain text, one URL per line
- **Size**: ~500 active URLs
- **Auth**: None
- **Sync strategy**: Full replace every 6h
- **Mapping**: entity_type: url, category: phishing, risk_score: 80

### DOS Chain On-Chain
- **Source**: EAS attestations (Schema 6: dos.entity.flag)
- **Chain**: DOS Testnet (3939)
- **Existing code**: `findEntityFlags()` in doschain.ts
- **Sync strategy**: Incremental — scan new attestations since last sync
- **Mapping**: Direct from attestation data — entity_type, category, risk_score

### User Reports (from bot/web)
- **Trigger**: Realtime — user sends /report or bot detects report intent via LLM
- **Flow**: LLM extracts entity_type + entity_value from free text → insert with source: user_report
- **Initial risk_score**: 50 (requires manual review to increase)
- **Moderation**: Reports start at moderate risk, admin/LLM escalation needed

### Future Sources (Phase 2+)
- **PhishTank**: Registration currently disabled, add when available
- **PhishStats**: ~5k URLs/day, CSV API, free, no key
- **Chainalysis/Elliptic**: Wallet risk scoring (paid)
- **Vietnamese-specific**: chongluadao.vn, canh bao lua dao groups

## Sync Infrastructure

### Edge Function: `sync-threats`

```
sync-threats/
├── index.ts          -- orchestrator, pg_cron entry point
├── sources/
│   ├── metamask.ts   -- fetch + transform MetaMask config
│   ├── urlhaus.ts    -- fetch + transform URLhaus
│   ├── openphish.ts  -- fetch + transform OpenPhish
│   └── doschain.ts   -- sync on-chain attestations
└── shared/
    └── upsert.ts     -- batch upsert into threat_intel
```

Each source module: `fetch → transform → return ThreatEntry[]`. Orchestrator calls all in parallel, batch upserts into DB. If one source fails, log error, don't block others.

### pg_cron Schedule

```sql
SELECT cron.schedule(
  'sync-threats',
  '0 */6 * * *',  -- every 6 hours
  $$SELECT net.http_post(
    url := '<supabase-function-url>/sync-threats',
    headers := '{"Authorization": "Bearer <service-role-key>"}'::jsonb
  )$$
);
```

## Check Flow Changes

### `/api/url-check` (modified)

1. **NEW**: DB lookup first — query `threat_intel` by entity_hash
2. If DB has entries → aggregate signals from all sources, combine with runtime if needed
3. If DB miss → run existing runtime checks (Google SB, WHOIS, on-chain)
4. **NEW**: Cache runtime results → INSERT into threat_intel (source: runtime_cache, expires: 7 days)
5. All signals → LLM explanation (existing)

### `/api/entity-check` (modified)

1. **NEW**: DB lookup first — query by entity_type + entity_hash
2. **NEW**: Cluster lookup — if entry has cluster_id, fetch all cluster members
3. If DB miss → fallback to on-chain query (existing)
4. Return all signals including linked entities

### Bot handlers

No changes needed — bot calls same API endpoints. Richer data flows through automatically.

## Error Handling

| Scenario | Resolution |
|----------|-----------|
| Sync source fails | Log to sync_log, skip source, others continue |
| Sync fully fails | pg_cron retries next cycle (6h), stale data still usable |
| DB lookup fails | Fallback to runtime checks (current behavior) |
| User report spam | Initial risk_score: 50, manual review needed to escalate |
| Duplicate entries | UNIQUE(entity_hash, source) — ON CONFLICT UPDATE last_seen_at |
| Expired cache | WHERE expires_at IS NULL OR expires_at > now() |

## Key Design Decisions

1. **Single unified table** over per-source tables — simpler queries, easier to add sources, adequate for 100k-200k rows
2. **Cluster table** over graph edges — simpler, Postgres-native, sufficient for current entity linking needs. Graph can be added later if needed.
3. **Supabase Edge Function + pg_cron** over Vercel Cron or GitHub Actions — zero new infra, familiar tooling for solo founder
4. **Hybrid check flow** — DB-first for speed, runtime fallback for coverage, cache for learning
5. **entity_type as text** not enum — extensible without migration for new entity types
6. **DB as evidence store, LLM as analyst** — adding new data sources doesn't require LLM logic changes
