# DOSafe Scraper Pipeline Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add `raw_imports` staging table, local bulk scrapers for admin.vn and checkscam.vn, an Edge Function for daily incremental sync, and a processing pipeline that normalizes scraped data into `threat_intel` + `threat_clusters`.

**Architecture:** 3-layer ELT — scrapers write raw JSON to `raw_imports`, a SQL function extracts entities into `threat_intel` and groups them into `threat_clusters` via `cluster_id` FK. Rule-based scoring (no LLM).

**Tech Stack:** Deno (scripts + Edge Functions), Supabase PostgreSQL 17 (pgcrypto), Supabase REST API

**Design Doc:** `docs/DOSafe-Scraper-Pipeline-Design.md`

---

## Task 1: Database Migration — `raw_imports` Table + Processing Functions

**Files:**
- Create: `supabase/migrations/20260305000000_raw_imports.sql`

**Step 1: Write the migration SQL**

```sql
-- supabase/migrations/20260305000000_raw_imports.sql
-- Staging table for scraped data (ELT pattern)

create table if not exists dosafe.raw_imports (
  id            uuid primary key default gen_random_uuid(),
  source        text not null,
  source_id     text,
  raw_data      jsonb not null,
  status        text not null default 'pending'
                  check (status in ('pending', 'processed', 'failed', 'skipped')),
  error         text,
  scraped_at    timestamptz not null default now(),
  processed_at  timestamptz,
  created_at    timestamptz not null default now()
);

-- Dedup: one row per source + source_id
create unique index if not exists idx_raw_imports_source_id
  on dosafe.raw_imports (source, source_id)
  where source_id is not null;

create index if not exists idx_raw_imports_status
  on dosafe.raw_imports (status)
  where status = 'pending';

create index if not exists idx_raw_imports_source
  on dosafe.raw_imports (source);

-- RLS: service_role only (scrapers run with service key)
alter table dosafe.raw_imports enable row level security;

drop policy if exists "service manage raw_imports" on dosafe.raw_imports;
create policy "service manage raw_imports" on dosafe.raw_imports
  for all to service_role using (true) with check (true);

grant all on dosafe.raw_imports to service_role;

-- ─── Bulk upsert raw imports ───
-- Inserts or updates raw scraped data, returns count of rows affected

create or replace function dosafe.bulk_upsert_raw_imports(p_entries jsonb)
returns int
language plpgsql
as $$
declare
  v_count int;
begin
  with input as (
    select
      elem->>'source' as source,
      elem->>'source_id' as source_id,
      elem->'raw_data' as raw_data,
      coalesce((elem->>'scraped_at')::timestamptz, now()) as scraped_at
    from jsonb_array_elements(p_entries) as elem
  )
  insert into dosafe.raw_imports (source, source_id, raw_data, scraped_at)
  select source, source_id, raw_data, scraped_at
  from input
  on conflict (source, source_id)
  do update set
    raw_data = excluded.raw_data,
    scraped_at = excluded.scraped_at,
    status = 'pending',
    processed_at = null,
    error = null;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function dosafe.bulk_upsert_raw_imports(jsonb) to service_role;

-- ─── Process pending imports ───
-- Extracts entities from raw_imports into threat_intel + threat_clusters
-- Returns number of raw_imports rows processed

create or replace function dosafe.process_pending_imports(p_limit int default 1000)
returns int
language plpgsql
as $$
declare
  v_row record;
  v_count int := 0;
  v_cluster_id uuid;
  v_entity_hash text;
  v_existing_cluster_id uuid;
  v_phone text;
  v_bank_account text;
  v_name text;
  v_description text;
  v_risk_score smallint;
  v_report_count int;
begin
  for v_row in
    select * from dosafe.raw_imports
    where status = 'pending'
    order by created_at
    limit p_limit
    for update skip locked
  loop
    begin
      v_name := v_row.raw_data->>'name';
      v_phone := v_row.raw_data->>'phone';
      v_bank_account := v_row.raw_data->>'bank_account';

      -- Try to find existing cluster by matching phone or bank_account
      v_existing_cluster_id := null;

      if v_phone is not null and v_phone != '' then
        v_entity_hash := '0x' || encode(digest(lower(v_phone), 'sha256'), 'hex');
        select cluster_id into v_existing_cluster_id
        from dosafe.threat_intel
        where entity_hash = v_entity_hash and cluster_id is not null
        limit 1;
      end if;

      if v_existing_cluster_id is null and v_bank_account is not null and v_bank_account != '' then
        v_entity_hash := '0x' || encode(digest(lower(v_bank_account), 'sha256'), 'hex');
        select cluster_id into v_existing_cluster_id
        from dosafe.threat_intel
        where entity_hash = v_entity_hash and cluster_id is not null
        limit 1;
      end if;

      -- Use existing cluster or create new one
      if v_existing_cluster_id is not null then
        v_cluster_id := v_existing_cluster_id;
        update dosafe.threat_clusters
        set total_reports = total_reports + 1,
            updated_at = now()
        where id = v_cluster_id;
      else
        v_description := coalesce(v_row.raw_data->>'category', '') || ' | ' ||
                         coalesce(v_row.raw_data->>'bank_name', '') || ' | ' ||
                         coalesce(v_row.raw_data->>'amount', '');
        insert into dosafe.threat_clusters (name, description, total_reports)
        values (coalesce(v_name, 'Unknown'), v_description, 1)
        returning id into v_cluster_id;
      end if;

      -- Calculate risk_score based on cluster report count
      select total_reports into v_report_count from dosafe.threat_clusters where id = v_cluster_id;
      v_risk_score := case
        when v_report_count >= 5 then 80
        when v_report_count >= 3 then 75
        when v_report_count >= 2 then 70
        else 60
      end;

      -- Insert phone entity
      if v_phone is not null and v_phone != '' then
        insert into dosafe.threat_intel
          (entity_type, entity_value, entity_hash, source, category, risk_score, raw_data, cluster_id)
        values (
          'phone', v_phone,
          '0x' || encode(digest(lower(v_phone), 'sha256'), 'hex'),
          v_row.source,
          coalesce(v_row.raw_data->>'category', 'scam'),
          v_risk_score,
          jsonb_build_object('raw_import_id', v_row.id, 'name', v_name),
          v_cluster_id
        )
        on conflict (entity_hash, source) do update set
          last_seen_at = now(),
          risk_score = greatest(dosafe.threat_intel.risk_score, excluded.risk_score),
          cluster_id = coalesce(dosafe.threat_intel.cluster_id, excluded.cluster_id);
      end if;

      -- Insert bank_account entity
      if v_bank_account is not null and v_bank_account != '' then
        insert into dosafe.threat_intel
          (entity_type, entity_value, entity_hash, source, category, risk_score, raw_data, cluster_id)
        values (
          'bank_account', v_bank_account,
          '0x' || encode(digest(lower(v_bank_account), 'sha256'), 'hex'),
          v_row.source,
          coalesce(v_row.raw_data->>'category', 'scam'),
          v_risk_score,
          jsonb_build_object('raw_import_id', v_row.id, 'name', v_name, 'bank_name', v_row.raw_data->>'bank_name'),
          v_cluster_id
        )
        on conflict (entity_hash, source) do update set
          last_seen_at = now(),
          risk_score = greatest(dosafe.threat_intel.risk_score, excluded.risk_score),
          cluster_id = coalesce(dosafe.threat_intel.cluster_id, excluded.cluster_id);
      end if;

      -- Insert facebook entity (if present)
      if v_row.raw_data->>'facebook' is not null and v_row.raw_data->>'facebook' != '' then
        insert into dosafe.threat_intel
          (entity_type, entity_value, entity_hash, source, category, risk_score, raw_data, cluster_id)
        values (
          'facebook', v_row.raw_data->>'facebook',
          '0x' || encode(digest(lower(v_row.raw_data->>'facebook'), 'sha256'), 'hex'),
          v_row.source,
          coalesce(v_row.raw_data->>'category', 'scam'),
          v_risk_score,
          jsonb_build_object('raw_import_id', v_row.id, 'name', v_name),
          v_cluster_id
        )
        on conflict (entity_hash, source) do update set
          last_seen_at = now(),
          risk_score = greatest(dosafe.threat_intel.risk_score, excluded.risk_score),
          cluster_id = coalesce(dosafe.threat_intel.cluster_id, excluded.cluster_id);
      end if;

      -- Update max_risk_score on cluster
      update dosafe.threat_clusters
      set max_risk_score = greatest(max_risk_score, v_risk_score)
      where id = v_cluster_id;

      -- Mark raw_import as processed
      update dosafe.raw_imports
      set status = 'processed', processed_at = now()
      where id = v_row.id;

      v_count := v_count + 1;

    exception when others then
      update dosafe.raw_imports
      set status = 'failed', error = sqlerrm
      where id = v_row.id;
    end;
  end loop;

  return v_count;
end;
$$;

grant execute on function dosafe.process_pending_imports(int) to service_role;
```

**Step 2: Apply migration to remote Supabase**

Run:
```bash
cd d:/Projects/DOSafe
npx supabase db push --project-ref gulptwduchsjcsbndmua
```
Expected: Migration applied, `raw_imports` table created, 2 new functions available.

**Step 3: Verify tables and functions exist**

Run SQL via Supabase dashboard:
```sql
select count(*) from dosafe.raw_imports;
select dosafe.process_pending_imports(0);
```
Expected: 0 rows, function returns 0.

**Step 4: Commit**

```bash
cd d:/Projects/DOSafe
git add supabase/migrations/20260305000000_raw_imports.sql
git commit -m "feat: add raw_imports staging table and processing functions"
```

---

## Task 2: admin.vn Bulk Scraper Script

**Files:**
- Create: `scripts/scrape-admin-vn.ts`

**Step 1: Write the scraper**

Deno script that:
1. Fetches all pages from `https://admin.vn/scams?page=N` (81 pages)
2. Parses HTML table rows via regex (name, phone, STK, bank, amount, date, slug)
3. Upserts each row into `raw_imports` via `bulk_upsert_raw_imports()` RPC
4. Calls `process_pending_imports()` at the end
5. 1.5s polite delay between page requests (Cloudflare)

Key implementation details:
- `source` = `'admin_vn'`
- `source_id` = slug from `/scams/{slug}.html` link
- `raw_data` = `{ name, phone, bank_account, bank_name, amount, category: 'scam', views, date }`
- HTML parsing: `<tr>` → `<td>` cells, strip tags, extract `/scams/{slug}.html` link
- Chunks of entries per page (~500 per page) upserted in one RPC call

Usage:
```bash
deno run --allow-net --allow-env scripts/scrape-admin-vn.ts
```

Env vars required: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`

**Step 2: Test with first 2 pages**

Modify script to limit `totalPages` to 2 for testing. Run and verify:
- `raw_imports` has entries with source='admin_vn'
- `threat_intel` has phone + bank_account entities
- `threat_clusters` has scammer profiles

**Step 3: Run full scrape (81 pages)**

Remove page limit, run full scrape. Expected: ~35k raw_imports → ~50-70k threat_intel rows (phone + STK per report).

**Step 4: Commit**

```bash
git add scripts/scrape-admin-vn.ts
git commit -m "feat: add admin.vn bulk scraper script"
```

---

## Task 3: checkscam.vn Bulk Scraper Script

**Files:**
- Create: `scripts/scrape-checkscam-vn.ts`

**Step 1: Write the scraper**

Deno script that:
1. Paginates WP REST API: `GET /wp-json/wp/v2/posts?per_page=100&page=N&_fields=id,slug,title,date,link`
2. Uses `X-WP-TotalPages` header for total page count
3. Extracts phone/bank_account from post titles via regex (`0\d{9,10}` for phones, `\d{8,19}` for bank accounts)
4. Upserts into `raw_imports` with `source='checkscam_vn'`, `source_id=post.id`
5. Calls `process_pending_imports()` at the end
6. 500ms delay between API requests

Key differences from admin.vn:
- Data quality is lower (phone/STK extracted from free-text titles, not structured table)
- WP API is fast and doesn't need Cloudflare bypass
- ~62k posts but many may lack extractable entities

Usage:
```bash
deno run --allow-net --allow-env scripts/scrape-checkscam-vn.ts
```

**Step 2: Test and verify**

Run, check DB counts, verify entity extraction quality.

**Step 3: Commit**

```bash
git add scripts/scrape-checkscam-vn.ts
git commit -m "feat: add checkscam.vn bulk scraper script"
```

---

## Task 4: Incremental Sync Edge Function

**Files:**
- Create: `supabase/functions/sync-scraped-sources/index.ts`

**Step 1: Write the Edge Function**

Deno Edge Function that runs daily:
1. **admin.vn incremental**: Scrape page 1 only, upsert into `raw_imports` (ON CONFLICT skips known slugs)
2. **checkscam.vn incremental**: Fetch WP API posts with `after=` param (last successful sync timestamp from `sync_log`)
3. Process all pending imports via `process_pending_imports()` RPC
4. Log each source run to `sync_log`

Same HTTP handler pattern as existing `sync-threats` function.

**Step 2: Deploy**

```bash
npx supabase functions deploy sync-scraped-sources --no-verify-jwt --project-ref gulptwduchsjcsbndmua
```

**Step 3: Test**

```bash
curl -X POST "https://gulptwduchsjcsbndmua.supabase.co/functions/v1/sync-scraped-sources" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_KEY"
```

**Step 4: Commit**

```bash
git add supabase/functions/sync-scraped-sources/
git commit -m "feat: add incremental sync Edge Function for scraped sources"
```

---

## Task 5: Run Bulk Imports

**Step 1: Run admin.vn scraper**

```bash
SUPABASE_URL=https://gulptwduchsjcsbndmua.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=$SUPABASE_SERVICE_KEY \
deno run --allow-net --allow-env scripts/scrape-admin-vn.ts
```

**Step 2: Run checkscam.vn scraper**

```bash
SUPABASE_URL=https://gulptwduchsjcsbndmua.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=$SUPABASE_SERVICE_KEY \
deno run --allow-net --allow-env scripts/scrape-checkscam-vn.ts
```

**Step 3: Verify final DB state**

```sql
-- Raw imports by source
select source, status, count(*) from dosafe.raw_imports group by source, status;

-- Threat intel by source and type
select source, entity_type, count(*) from dosafe.threat_intel group by source, entity_type order by count desc;

-- Cluster stats
select count(*) as total_clusters,
       avg(total_reports) as avg_reports,
       max(total_reports) as max_reports
from dosafe.threat_clusters;

-- Cross-source matches (scammers appearing in multiple sources)
select tc.name, tc.total_reports, count(distinct ti.source) as sources
from dosafe.threat_clusters tc
join dosafe.threat_intel ti on ti.cluster_id = tc.id
group by tc.id
having count(distinct ti.source) > 1
order by tc.total_reports desc
limit 20;
```

---

## Task 6: Setup pg_cron Daily Schedule

**Step 1: Add cron job**

Run via Supabase SQL editor:
```sql
select cron.schedule(
  'sync-scraped-sources-daily',
  '0 6 * * *',
  $$
  select net.http_post(
    url := 'https://gulptwduchsjcsbndmua.supabase.co/functions/v1/sync-scraped-sources',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);
```

**Step 2: Verify**

```sql
select * from cron.job where jobname = 'sync-scraped-sources-daily';
```

---

## Task 7: Update Documentation

**Files:**
- Modify: `docs/threat-intel.md`
- Modify: `docs/DOSafe-Architecture.md`

**Step 1: Update threat-intel.md**

Add admin.vn and checkscam.vn to active sources table. Update total entry count.

**Step 2: Update architecture doc**

Add 3-layer scraper pipeline section, `raw_imports` table, processing flow.

**Step 3: Add Rate integration note to design doc**

Note in `docs/DOSafe-Scraper-Pipeline-Design.md` that DOSafe threat_intel + threat_clusters can serve as data foundation for Rate (RateBox) — scammer profiles map to Rate Items, reports map to Rate Reviews.

**Step 4: Commit**

```bash
git add docs/
git commit -m "docs: update threat intel and architecture docs with scraper pipeline"
```

---

## Execution Order

```
Task 1 (migration) ─── must be first
  │
  ├── Task 2 (admin.vn scraper)    ─┐
  ├── Task 3 (checkscam.vn scraper) ├── can run in parallel
  └── Task 4 (Edge Function)       ─┘
          │
          └── Task 5 (run bulk imports) ─── depends on 1+2+3
                  │
                  ├── Task 6 (pg_cron) ─── depends on 4
                  └── Task 7 (docs)    ─── depends on 5 for stats
```
