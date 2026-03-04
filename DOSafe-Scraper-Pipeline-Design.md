# DOSafe Scraper Pipeline Design

## Goal

Extend the existing threat intel pipeline (636k entries from 5 automated sources) with
a **3-layer scraper architecture** that ingests Vietnamese scam databases (admin.vn,
checkscam.vn) and future manual/crowdsourced sources. Raw data is staged, normalized
into the existing `threat_intel` table, and linked via `threat_clusters` for
cross-entity correlation.

## Context

### What exists today

| Layer | Table | Purpose |
|-------|-------|---------|
| Lookup | `dosafe.threat_intel` | Flat entity lookup (domain, url, wallet) — 636k rows |
| Clustering | `dosafe.threat_clusters` | Group related entities (empty, unused so far) |
| Logging | `dosafe.sync_log` | Per-source sync run tracking |

Current sync flow: `pg_cron` → Edge Function `sync-threats` → `bulk_upsert_threats()` RPC.
Sources are **structured feeds** (JSON arrays, text lists) that map 1:1 to `threat_intel` rows.

### What's new

Vietnamese scam databases have **multi-field reports** (name + phone + bank account +
Facebook + evidence) that don't fit the 1-entity-per-row model. One report produces
**multiple `threat_intel` rows** that need to be linked back to the same scammer.

## Architecture: 3-Layer ELT

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  Scrapers    │────▶│ raw_imports   │────▶│ threat_intel  │
│              │     │ (staging)     │     │ (lookup)      │
│ admin.vn     │     │               │     │               │
│ checkscam.vn │     │ JSON blob per │     │ 1 row per     │
│ future...    │     │ report, as-is │     │ entity+source │
└──────────────┘     └───────┬───────┘     └───────┬───────┘
                             │                     │
                             │    cluster_id FK     │
                             │         ┌───────────┘
                             │         ▼
                             │  ┌──────────────┐
                             └─▶│threat_clusters│
                                │ (grouping)    │
                                │               │
                                │ 1 cluster per │
                                │ scammer/group │
                                └──────────────┘
```

### Layer 1: `dosafe.raw_imports` (NEW table)

Stores the **original scraped data verbatim** as a JSON blob. Enables re-processing
if normalization logic changes. One row = one scraped report/page entry.

```sql
create table dosafe.raw_imports (
  id            uuid primary key default gen_random_uuid(),
  source        text not null,           -- 'admin_vn', 'checkscam_vn'
  source_id     text,                    -- original ID/slug from source (dedup key)
  raw_data      jsonb not null,          -- full scraped JSON
  status        text not null default 'pending'
                  check (status in ('pending', 'processed', 'failed', 'skipped')),
  error         text,
  scraped_at    timestamptz not null default now(),
  processed_at  timestamptz,
  created_at    timestamptz not null default now()
);

create unique index on dosafe.raw_imports (source, source_id)
  where source_id is not null;
```

**Key decisions:**
- `source_id` = slug from admin.vn or post ID from checkscam.vn → natural dedup
- `status` tracks processing state → idempotent re-runs
- UNIQUE index on `(source, source_id)` prevents duplicate imports
- No hash needed here — dedup is by source_id, not content

### Layer 2: `dosafe.threat_intel` (EXISTING — no schema change)

Existing table stays as-is. New entity types added:
- `phone` — Vietnamese phone numbers (0xxx)
- `bank_account` — Bank account numbers (STK)
- `facebook` — Facebook profile URLs/IDs

Each `raw_imports` row produces **multiple** `threat_intel` rows (one per entity
found in the report). All rows from the same report share the same `cluster_id`.

### Layer 3: `dosafe.threat_clusters` (EXISTING — no schema change)

One cluster per scammer report. Fields:
- `name` — Scammer name from report
- `description` — Summary (amount, bank, category)
- `total_reports` — Count of `raw_imports` rows in this cluster
- `max_risk_score` — Highest risk_score among member entities

**Cluster matching logic** (for dedup across sources):
1. Exact match: same phone OR same bank_account across sources → merge into same cluster
2. Future: fuzzy name matching, LLM-assisted entity resolution

## Data Sources

### admin.vn (Priority 1)

| Field | Maps to |
|-------|---------|
| URL pattern | `https://admin.vn/scams?page={N}` (81 pages) |
| Entries | 35,596 STK/SĐT + 4,284 Facebook |
| Tech | Custom PHP, server-rendered HTML, Cloudflare |
| Fields | name, phone, bank_account, bank_name, amount, category, date, evidence |
| Detail page | `/scams/{slug}.html` — complaint text, images, reporter info |
| Update freq | Active, new reports daily |
| Rate limit | Cloudflare-protected, need polite scraping (1-2 req/s) |

**Scrape strategy:**
- **Initial bulk**: Scrape all 81 pages of `/scams?page=N`, extract table rows
- **Incremental**: Scrape page 1 only, stop when hitting known `source_id` (slug)
- **Detail pages**: Optional phase 2 — scrape `/scams/{slug}.html` for evidence/description

**Entity extraction per row:**
```
1 admin.vn row → up to 3 threat_intel rows:
  - entity_type: 'phone',        entity_value: '0943241522'
  - entity_type: 'bank_account', entity_value: '0943241522'
  - entity_type: 'facebook',     entity_value: 'https://fb.com/...'
All 3 rows share the same cluster_id → linked to 1 threat_clusters row
```

### checkscam.vn (Priority 2)

| Field | Maps to |
|-------|---------|
| URL pattern | `https://checkscam.vn/page/{N}` or WP REST API |
| Entries | ~62,000 posts |
| Tech | WordPress, WP REST API exposed |
| Fields | title (scammer name/phone), content (HTML, often empty via API) |
| Update freq | Active |
| Rate limit | Standard WordPress, no Cloudflare |

**Scrape strategy:**
- **WP REST API** for metadata: `GET /wp-json/wp/v2/posts?per_page=100&page=N`
  - Returns title, date, slug, categories — but `content.rendered` is empty
- **HTML scrape** for content: `GET /checkscam/{slug}/` for full post body
- **Initial bulk**: Paginate WP API for all 62k post metadata, then HTML scrape
- **Incremental**: WP API `after=YYYY-MM-DDTHH:mm:ss` for new posts since last sync

**Entity extraction:**
- Parse title for phone numbers (regex `0\d{9,10}`)
- Parse title for bank account numbers
- Parse HTML content for structured scam details
- Less structured than admin.vn → lower confidence, lower risk_score

## Processing Pipeline

### Step 1: Scrape → `raw_imports`

```
scrape_source(source_name)
  for each page/entry:
    INSERT INTO raw_imports (source, source_id, raw_data)
    ON CONFLICT (source, source_id) DO UPDATE raw_data, scraped_at
```

### Step 2: Process `raw_imports` → `threat_intel` + `threat_clusters`

```
process_pending_imports()
  SELECT * FROM raw_imports WHERE status = 'pending'
  for each row:
    1. Extract entities from raw_data (phone, STK, FB, ...)
    2. Find or create threat_cluster:
       - Search existing clusters by phone/STK match
       - If found → reuse cluster_id, increment total_reports
       - If not → create new cluster
    3. Upsert each entity into threat_intel with cluster_id
    4. Calculate risk_score (rule-based):
       - 1 source report → 60
       - 2-3 reports → 70
       - 3+ reports or multi-source → 80
       - Confirmed + on-chain attested → 90
    5. UPDATE raw_imports SET status = 'processed'
```

### Step 3: Sync to DOS.Me (future)

```
POST /trust/flags
  entityId: normalized entity value
  sourceSystem: 'dosafe'
  externalId: raw_imports.id   ← links back to original report
```

## Execution Model

### Initial Bulk Import (one-time)

**Local Deno script** (`scripts/scrape-admin-vn.ts`):
- Runs on dev machine (not Edge Function — too much memory/time for 81 pages)
- Scrapes all pages → writes to `raw_imports` via Supabase REST API
- Then triggers processing via `process_pending_imports()` RPC
- Estimated: ~5-10 minutes for admin.vn, ~30-60 min for checkscam.vn

### Incremental Sync (daily)

**Edge Function** `sync-scraped-sources`:
- Runs via `pg_cron` (daily, offset from existing `sync-threats` schedule)
- Scrapes page 1 of admin.vn, recent WP API posts from checkscam.vn
- Inserts new entries into `raw_imports`
- Calls `process_pending_imports()` to normalize + link

### Why separate from `sync-threats`?

| | `sync-threats` (existing) | `sync-scraped-sources` (new) |
|--|---------------------------|------------------------------|
| Sources | Structured feeds (JSON, text) | HTML scraping |
| Processing | Direct → threat_intel | raw_imports → threat_intel |
| Runtime | ~109s for 636k entries | ~30-60s for incremental |
| Schedule | Every 6h | Daily |
| Failure mode | Source down = skip | Cloudflare block = retry |

## Rule-Based Scoring

No LLM in phase 1. Scoring is deterministic:

| Condition | risk_score |
|-----------|-----------|
| Single report from 1 Vietnamese source | 60 |
| 2-3 reports from same source | 70 |
| Reports from 2+ different sources | 80 |
| Confirmed by on-chain attestation | 90 |
| Multiple on-chain attestations | 95 |

Score stored on `threat_intel.risk_score`. Cluster-level score stored on
`threat_clusters.max_risk_score` (max of all member entities).

## DOS.Me Trust API Integration

When syncing to DOS.Me:
- `externalId` = `raw_imports.id` (not `threat_intel.id`)
- This allows DOS.Me to link back to the **original report**, not individual entities
- One report with 3 entities → 3 `POST /trust/flags` calls, same `externalId`

## Entity ID Normalization

Following DOS Chain EAS Schema 6 conventions:

| Entity Type | Normalization | Example |
|-------------|--------------|---------|
| `phone` | Remove spaces/dashes, keep country format | `0943241522` |
| `bank_account` | Remove spaces, uppercase | `0943241522` |
| `facebook` | Extract numeric ID or username, lowercase | `100012345678` |
| `domain` | Lowercase, strip protocol/path | `evil-site.com` |
| `url` | Lowercase protocol+host, preserve path | `https://evil.com/phish` |
| `wallet` | Lowercase (EVM) or as-is (non-EVM) | `0xabc...def` |

## File Structure

```
d:/Projects/DOSafe/
├── scripts/
│   ├── scrape-admin-vn.ts          # One-time bulk import
│   └── scrape-checkscam-vn.ts      # One-time bulk import
├── supabase/
│   ├── migrations/
│   │   └── 20260304000001_raw_imports.sql  # New migration
│   └── functions/
│       ├── sync-threats/            # Existing (structured feeds)
│       └── sync-scraped-sources/    # New (HTML scraper sources)
│           └── index.ts
└── docs/
    └── plans/
        └── 2026-03-04-scraper-pipeline-design.md  # This doc
```

## Open Questions (resolved)

| Question | Decision |
|----------|----------|
| 1 table vs multi-table for entities? | 1 table (`threat_intel`) + `cluster_id` FK |
| Separate `entity_links` table? | No — use `cluster_id` on `threat_intel` (DOS.Me recommendation) |
| LLM scoring? | Rule-based phase 1, LLM phase 2 |
| Staging table? | Yes — `raw_imports` (ELT pattern) |
| Scraper runtime? | Local scripts for bulk, Edge Function for incremental |
| `externalId` for DOS.Me sync? | `raw_imports.id` |
| admin.vn vs checkscam.vn priority? | admin.vn first (structured data) |
