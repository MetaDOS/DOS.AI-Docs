# DOSafe Threat Intelligence System

**Updated:** 2026-03-04
**Status:** Phase 1 COMPLETE (DB + Sync + Check Flow). Phase 2 (User Reports + Clustering) TODO.

## Overview

DOSafe aggregates threat data from multiple external sources into a unified Supabase database (`dosafe.threat_intel`), enabling instant DB-first lookups for URL/phone/entity scam checks with runtime fallback and automatic caching.

**Key stats:**
- **255,000+ entries** from 3 sources (MetaMask, URLhaus, OpenPhish)
- **Sync cadence:** Every 6 hours via pg_cron → Edge Function
- **Lookup speed:** <10ms (SHA-256 hash index)

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    DATA INGESTION                            │
│                                                              │
│  pg_cron (every 6h) → Edge Function: sync-threats            │
│                        ├── MetaMask eth-phishing (233k)      │
│                        ├── URLhaus abuse.ch (22k)            │
│                        ├── OpenPhish community (300)         │
│                        └── [Future: DOS Chain on-chain sync] │
│                                    │                         │
│                                    ▼                         │
│                        dosafe.threat_intel                    │
│                        (unified table, dosafe schema)         │
│                                    ▲                         │
│  Telegram bot ─→ /report ─────────┘ [Phase 2]               │
│  Web app      ─→ /report            [Phase 2]               │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                    CHECK FLOW (Hybrid)                        │
│                                                              │
│  User sends URL/phone/wallet/etc.                            │
│           │                                                  │
│           ▼                                                  │
│  1. DB lookup (dosafe.threat_intel) — <10ms                  │
│           │                                                  │
│      Found? ─ Yes ─→ Aggregate signals + LLM explain         │
│           │                                                  │
│          No                                                  │
│           │                                                  │
│           ▼                                                  │
│  2. Runtime checks (parallel)                                │
│     ├── Google Safe Browsing                                 │
│     ├── WHOIS/RDAP                                           │
│     └── DOS Chain on-chain                                   │
│           │                                                  │
│           ▼                                                  │
│  3. Cache result → INSERT into threat_intel (7-day TTL)      │
│           │                                                  │
│           ▼                                                  │
│  4. LLM synthesizes all signals → user response              │
└─────────────────────────────────────────────────────────────┘
```

## Database Schema

All tables live in the **`dosafe` schema** (custom Supabase schema, separate from `public`).

### `dosafe.threat_intel`

Unified table for all threat entries from all sources. One row per `(entity, source)` pair.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid (PK) | Auto-generated |
| entity_type | text | `domain`, `url`, `phone`, `wallet`, `email`, `telegram`, `bank_account`, `national_id`, ... (free text, extensible) |
| entity_value | text | Normalized value (lowercase, E.164 for phone, etc.) |
| entity_hash | text | `0x` + SHA-256 hex of `lower(entity_value)` — primary lookup key |
| source | text | `metamask`, `urlhaus`, `openphish`, `onchain`, `user_report`, `runtime_cache` |
| category | text | `phishing`, `malware`, `scam`, `legitimate`, `unknown` |
| risk_score | smallint | 0–100 |
| raw_data | jsonb | Source-specific metadata (e.g. `{"list":"blacklist"}` for MetaMask) |
| cluster_id | uuid (FK, nullable) | Links to `threat_clusters` |
| first_seen_at | timestamptz | When first ingested |
| last_seen_at | timestamptz | Last time this entry was refreshed |
| expires_at | timestamptz (nullable) | Auto-expire for `runtime_cache` entries (7 days) |
| status | text | `active`, `expired`, `disputed` |

**Constraints:**
- `UNIQUE (entity_hash, source)` — same entity can have multiple rows (one per source)
- Index on `entity_hash` for O(1) lookups
- Index on `source`, `cluster_id`, `expires_at`

**Key design decisions:**
- `entity_type` is **free text, not enum** — new types added without migration
- `entity_hash` uses SHA-256 (not the entity_value directly) — consistent hashing between app code (`crypto.subtle.digest`) and DB (`pgcrypto digest()`)
- Same entity from N sources = N rows — aggregated at query time via `lookup_threats(hash)`

### `dosafe.threat_clusters`

Groups related entities belonging to the same scammer/group.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid (PK) | Auto-generated |
| name | text | Human-readable label, e.g. "Binance VN scam group" |
| description | text (nullable) | Additional context |
| total_reports | int | Denormalized count of linked entries |
| max_risk_score | smallint | Highest risk_score across all members |
| created_at / updated_at | timestamptz | Timestamps |

**Usage:** When checking a phone number → find its `cluster_id` → query all cluster members → return linked entities (bank accounts, other phones, IDs, etc.).

### `dosafe.sync_log`

Monitoring table for sync health.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid (PK) | Auto-generated |
| source | text | Which source was synced |
| started_at / finished_at | timestamptz | Duration tracking |
| entries_processed | int | Total entries from source |
| entries_added | int | New entries inserted/updated |
| status | text | `running`, `success`, `partial`, `failed` |
| error | text (nullable) | Error message if failed |

### RLS Policies

| Table | anon | service_role |
|-------|------|--------------|
| threat_intel | SELECT | ALL |
| threat_clusters | SELECT | ALL |
| sync_log | — | ALL |

### SQL Functions

| Function | Purpose | Access |
|----------|---------|--------|
| `dosafe.lookup_threats(p_entity_hash text)` | Query active, non-expired threats by hash | anon + service_role |
| `dosafe.lookup_cluster_members(p_cluster_id uuid)` | Query active members of a cluster | anon + service_role |
| `dosafe.bulk_upsert_threats(p_entries jsonb)` | Batch upsert with DB-side SHA-256 hashing (pgcrypto) | service_role only |

**Migration file:** `supabase/migrations/20260304000000_threat_intel.sql`

## Data Sources

### Phase 1 (Active)

| Source | Type | Size | Sync | Mapping |
|--------|------|------|------|---------|
| MetaMask eth-phishing-detect | GitHub JSON | 233k domains | Full replace / 6h | `domain`, `phishing`, risk 90 |
| URLhaus (abuse.ch) | Text feed | 22k URLs | Upsert / 6h | `url`, `malware`, risk 85 |
| OpenPhish community | Text feed | 300 URLs | Full replace / 6h | `url`, `phishing`, risk 80 |
| Runtime cache | Auto-generated | Growing | On each check | Various, risk varies, 7-day TTL |

### Phase 2 (Planned)

| Source | Type | Notes |
|--------|------|-------|
| DOS Chain on-chain | EAS attestations | Incremental sync of Schema 6 attestations |
| User reports | Telegram bot / Web | `/report` command, LLM entity extraction, initial risk 50 |
| PhishStats | CSV API | ~5k URLs/day, free |
| chongluadao.vn | Vietnamese-specific | Community scam reports |

## Sync Infrastructure

### Edge Function: `sync-threats`

**Location:** `supabase/functions/sync-threats/index.ts`

Runs on Supabase Edge Runtime (Deno 2). Uses **raw `fetch()`** instead of `supabase-js` client for reliable schema routing (`Content-Profile: dosafe` header).

Key design: Sources are processed **sequentially** (not parallel) to reduce peak memory in Edge Function. Each source's data is passed to `dosafe.bulk_upsert_threats()` SQL function which does **DB-side SHA-256 hashing** via pgcrypto — avoids Edge Function resource limits when processing 233k+ entries.

```
sync-threats flow:
  1. Fetch source data (HTTP)
  2. Transform to { entity_type, entity_value, source, category, risk_score, raw_data }
  3. Chunk into 500-entry batches
  4. Call RPC bulk_upsert_threats(chunk) — DB does the hashing
  5. Log result to sync_log
  6. Repeat for next source
```

### pg_cron Schedule

```sql
SELECT cron.schedule(
  'sync-threats-6h',
  '0 */6 * * *',
  $$SELECT net.http_post(
    url := '<supabase-url>/functions/v1/sync-threats',
    headers := '{"Authorization":"Bearer cron-trigger"}'::jsonb
  )$$
);
```

The Edge Function is deployed with `--no-verify-jwt`, so any Bearer token works for the cron trigger.

### Performance

| Source | Entries | Sync Time |
|--------|---------|-----------|
| OpenPhish | 300 | ~1s |
| URLhaus | 22k | ~5s |
| MetaMask | 233k | ~37s |
| **Total** | **255k** | **~43s** |

## Check Flow Integration

### `/api/url-check` (URL/Domain Scam Check)

```
POST /api/url-check { "url": "https://evil.com" }

1. Normalize URL → extract domain
2. DB lookup (parallel):
   ├── lookupThreats(normalized_url)   → URL-level matches
   └── lookupThreats(domain)           → domain-level matches
3. Merge threat intel results (URL takes priority, domain supplements)
4. Runtime checks (parallel):
   ├── Google Safe Browsing
   ├── WHOIS/RDAP domain age
   └── DOS Chain on-chain attestations
5. assessRisk(trusted, safeBrowsing, whois, onChain, threatIntel)
6. Cache runtime result → fire-and-forget INSERT (7-day TTL)
7. Return: riskLevel, riskSignals, checks, threatIntel, onChain
```

**Risk level determination:**
| Condition | Level |
|-----------|-------|
| DB flagged phishing / on-chain phishing / Safe Browsing threat | `critical` |
| DB flagged malware/scam / on-chain high risk | `high` |
| Trusted domain / on-chain legitimate / DB legitimate | `safe` |
| New domain (<30 days) / on-chain medium risk | `medium` |
| Default | `low` |

### `/api/entity-check` (Phone/Email/Wallet/etc.)

```
POST /api/entity-check { "entityType": "phone", "entityId": "+84123456789" }

1. Parallel:
   ├── lookupThreats(entityId)          → DB match
   └── queryEntityFlags(entityId)       → on-chain match (15s timeout)
2. Combine signals from both sources
3. Risk assessment (DB categories + on-chain risk + cluster linking)
4. Cache on-chain result if no DB entry exists
5. Return: threatIntel, onChain, riskLevel, riskSignals
```

**Supported entity types:** `phone`, `email`, `wallet`, `url`, `domain`, `bank_account`, `national_id`, `telegram`

### Telegram Bot Integration

The bot calls the same API endpoints. Formatters display threat intel data:
- **URL check:** Shows DB sources, categories, cluster info, on-chain flags
- **Phone check:** Shows risk level from combined DB + on-chain assessment
- **LLM explainer:** Receives threat intel context for richer explanations

## Cross-Product Integration (DOS.Me Trust API)

DOSafe's `dosafe.threat_intel` is the **detailed evidence store**. DOS.Me's `public.safety_flags` is the **lightweight summary gateway** for other products.

```
DOSafe (dosafe.threat_intel)          DOS.Me (public.safety_flags)
┌───────────────────────┐             ┌───────────────────────┐
│ 255k+ rows            │  sync via   │ 1 row/entity          │
│ Multi-source evidence │ ──────────→ │ Confirmed flags only  │
│ Raw data, clusters    │  Trust API  │ M2M key auth          │
│ Auto-ingested         │             │ On-chain attestation  │
└───────────────────────┘             └───────────────────────┘
```

**Sync flow:** DOSafe reviews + confirms threat → calls `POST api.dos.me/trust/flags`:
```json
{
  "entityType": "domain",
  "entityId": "evil.com",
  "category": "phishing",
  "riskScore": 90,
  "sourceSystem": "dosafe",
  "evidenceHash": "0x6ff3...",
  "externalId": "uuid-of-threat-intel-row"
}
```

**Key differences:**

| | `dosafe.threat_intel` | `public.safety_flags` |
|---|---|---|
| Schema | `dosafe` | `public` |
| Purpose | Evidence store (raw signals) | Summary gateway (confirmed flags) |
| Size | 255k+ rows, N rows/entity | 1 row/entity |
| Lookup key | `entity_hash` (SHA-256) | `entity_id` (plaintext normalized) |
| Sources | Auto-ingested (MetaMask, URLhaus, ...) | Manual/reviewed (dosafe, rate_box, ...) |
| Status lifecycle | active → expired → disputed | pending → confirmed → revoked |
| On-chain | Reads from DOS Chain | Writes to DOS Chain (attests) |

## Library Reference

### `apps/web/src/lib/threat-intel.ts`

| Export | Purpose |
|--------|---------|
| `hashEntity(value)` | SHA-256 hash → `0x`-prefixed hex string |
| `lookupThreats(entityValue)` | Hash + RPC `dosafe.lookup_threats()` → `ThreatLookupResult \| null` |
| `upsertThreats(entries)` | Chunked upsert into `dosafe.threat_intel` (500/batch) |
| `cacheRuntimeResult(type, value, category, score, rawData)` | Insert runtime check result with 7-day TTL |

**Supabase client:** Uses service_role key + `.schema('dosafe')` for all DB access.

### `apps/web/src/lib/doschain.ts`

| Export | Purpose |
|--------|---------|
| `findEntityFlags(entityType, entityId)` | Query EAS attestations on DOS Chain |
| `queryEntityFlags(normalizedUrl, domain)` | Combined URL + domain on-chain lookup with 15s timeout |

## Environment Variables

```env
# Supabase (required for threat intel)
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# DOS Chain (optional, defaults to testnet)
DOS_TESTNET_RPC=https://test.doschain.com/...

# Google Safe Browsing (optional, degrades gracefully)
GOOGLE_SAFE_BROWSING_API_KEY=...

# Edge Function env (auto-provided by Supabase runtime)
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
```

## Error Handling

| Scenario | Resolution |
|----------|-----------|
| Sync source fails | Log to `sync_log`, skip source, others continue |
| Sync fully fails | pg_cron retries next cycle (6h), stale data still usable |
| DB lookup fails | Fallback to runtime checks (current behavior preserved) |
| DB key invalid | Service role key rotated → update Vercel env + redeploy |
| Duplicate entries | `UNIQUE(entity_hash, source)` — `ON CONFLICT UPDATE last_seen_at` |
| Expired cache | `WHERE expires_at IS NULL OR expires_at > now()` filter in `lookup_threats()` |

## Phase 2 Roadmap

- [ ] User report command (`/report`) — LLM entity extraction from free text
- [ ] Entity clustering — auto-link related entities (same scammer group)
- [ ] DOS Chain on-chain sync — incremental attestation ingestion
- [ ] PhishStats integration (~5k URLs/day)
- [ ] Vietnamese-specific sources (chongluadao.vn)
- [ ] Sync to DOS.Me Trust API (confirmed flags → `public.safety_flags`)
