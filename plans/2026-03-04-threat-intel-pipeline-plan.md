# Threat Intelligence Pipeline — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Aggregate threat data from MetaMask, URLhaus, OpenPhish, DOS Chain, and user reports into a unified Supabase DB for instant scam/phishing checks with runtime fallback.

**Architecture:** Unified `dosafe.threat_intel` table + `threat_clusters` for entity linking + `sync_log` for monitoring. Supabase Edge Function `sync-threats` runs via pg_cron every 6h. Existing API routes (`url-check`, `entity-check`) gain DB-first lookup with runtime fallback and result caching.

**Tech Stack:** Supabase (Postgres 17, Edge Functions/Deno 2, pg_cron), Next.js 16 API routes, viem 2.46.3, @supabase/supabase-js 2.98.0

**Design doc:** `docs/plans/2026-03-04-threat-intel-pipeline-design.md`
**DOS Chain spec:** `\\wsl.localhost\Ubuntu\home\joy\Projects\DOS-Chain\docs\integration\dosafe-entity-flag-integration.md`

---

## Task 1: Database Schema Migration

**Files:**
- Create: `supabase/migrations/20260304000000_threat_intel.sql`

**Step 1: Write the migration**

```sql
-- Threat intelligence unified table
create table if not exists dosafe.threat_intel (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,         -- domain, url, phone, wallet, email, telegram, bank_account, national_id, ...
  entity_value text not null,        -- normalized value
  entity_hash text not null,         -- SHA-256 hex for fast lookup
  source text not null,              -- metamask, urlhaus, openphish, onchain, user_report, runtime_cache
  category text not null default 'unknown', -- phishing, malware, scam, legitimate, unknown
  risk_score smallint not null default 50 check (risk_score >= 0 and risk_score <= 100),
  raw_data jsonb default '{}',       -- source-specific metadata
  cluster_id uuid,                   -- FK to threat_clusters (nullable)
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz,            -- for runtime_cache entries (e.g. 7 days)
  status text not null default 'active' check (status in ('active', 'expired', 'disputed'))
);

-- Same entity can appear from multiple sources, one row per source
create unique index if not exists idx_threat_intel_hash_source
  on dosafe.threat_intel (entity_hash, source);

-- Fast lookup by hash (main query path)
create index if not exists idx_threat_intel_hash
  on dosafe.threat_intel (entity_hash);

-- Cluster member lookup
create index if not exists idx_threat_intel_cluster
  on dosafe.threat_intel (cluster_id) where cluster_id is not null;

-- Source-specific queries
create index if not exists idx_threat_intel_source
  on dosafe.threat_intel (source);

-- Expire stale entries
create index if not exists idx_threat_intel_expires
  on dosafe.threat_intel (expires_at) where expires_at is not null;

-- Entity clustering table
create table if not exists dosafe.threat_clusters (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  total_reports int not null default 0,
  max_risk_score smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table dosafe.threat_intel
  add constraint fk_threat_intel_cluster
  foreign key (cluster_id) references dosafe.threat_clusters(id)
  on delete set null;

-- Sync monitoring log
create table if not exists dosafe.sync_log (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  entries_processed int default 0,
  entries_added int default 0,
  status text not null default 'running' check (status in ('running', 'success', 'partial', 'failed')),
  error text
);

-- RLS: anon can read threat_intel (bot + web queries), service_role can write
alter table dosafe.threat_intel enable row level security;
alter table dosafe.threat_clusters enable row level security;
alter table dosafe.sync_log enable row level security;

drop policy if exists "anon read threat_intel" on dosafe.threat_intel;
create policy "anon read threat_intel" on dosafe.threat_intel
  for select to anon using (true);

drop policy if exists "service write threat_intel" on dosafe.threat_intel;
create policy "service write threat_intel" on dosafe.threat_intel
  for all to service_role using (true) with check (true);

drop policy if exists "anon read clusters" on dosafe.threat_clusters;
create policy "anon read clusters" on dosafe.threat_clusters
  for select to anon using (true);

drop policy if exists "service write clusters" on dosafe.threat_clusters;
create policy "service write clusters" on dosafe.threat_clusters
  for all to service_role using (true) with check (true);

drop policy if exists "service manage sync_log" on dosafe.sync_log;
create policy "service manage sync_log" on dosafe.sync_log
  for all to service_role using (true) with check (true);

-- Grants
grant usage on schema dosafe to anon;
grant select on dosafe.threat_intel to anon;
grant select on dosafe.threat_clusters to anon;
grant all on dosafe.threat_intel to service_role;
grant all on dosafe.threat_clusters to service_role;
grant all on dosafe.sync_log to service_role;

-- Helper: lookup threats by entity hash (used by API routes)
create or replace function dosafe.lookup_threats(p_entity_hash text)
returns setof dosafe.threat_intel
language sql stable
as $$
  select * from dosafe.threat_intel
  where entity_hash = p_entity_hash
    and status = 'active'
    and (expires_at is null or expires_at > now())
  order by risk_score desc;
$$;

-- Helper: lookup cluster members
create or replace function dosafe.lookup_cluster_members(p_cluster_id uuid)
returns setof dosafe.threat_intel
language sql stable
as $$
  select * from dosafe.threat_intel
  where cluster_id = p_cluster_id
    and status = 'active'
  order by risk_score desc;
$$;

-- Grant execute on functions
grant execute on function dosafe.lookup_threats(text) to anon;
grant execute on function dosafe.lookup_cluster_members(uuid) to anon;
```

**Step 2: Apply migration**

Run: `cd d:/Projects/DOSafe && npx supabase db push`
Expected: Migration applies successfully, tables created in `dosafe` schema.

**Step 3: Verify tables exist**

Run: `cd d:/Projects/DOSafe && npx supabase db reset --linked` (if needed) or verify via Supabase Dashboard > Table Editor > dosafe schema.

**Step 4: Commit**

```bash
cd d:/Projects/DOSafe
git add supabase/migrations/20260304000000_threat_intel.sql
git commit -m "feat: add threat_intel, threat_clusters, sync_log schema"
```

---

## Task 2: Threat Intel Library (shared lookup + upsert)

**Files:**
- Create: `apps/web/src/lib/threat-intel.ts`

This module is used by both API routes (Next.js) and will be the single source of truth for DB interactions.

**Step 1: Create the library**

```typescript
// apps/web/src/lib/threat-intel.ts
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? ''
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

let _client: ReturnType<typeof createClient> | null = null
function getClient() {
  if (!_client) {
    _client = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  }
  return _client
}

// ─── Types ───

export interface ThreatEntry {
  id?: string
  entity_type: string
  entity_value: string
  entity_hash: string
  source: string
  category: string
  risk_score: number
  raw_data?: Record<string, unknown>
  cluster_id?: string | null
  first_seen_at?: string
  last_seen_at?: string
  expires_at?: string | null
  status?: string
}

export interface ThreatLookupResult {
  entries: ThreatEntry[]
  maxRiskScore: number
  sources: string[]
  categories: string[]
  cluster?: {
    id: string
    name: string
    members: ThreatEntry[]
  }
}

// ─── Hash ───

export async function hashEntity(value: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(value.toLowerCase())
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = new Uint8Array(hashBuffer)
  return '0x' + Array.from(hashArray).map(b => b.toString(16).padStart(2, '0')).join('')
}

// ─── Lookup ───

export async function lookupThreats(entityValue: string): Promise<ThreatLookupResult | null> {
  const hash = await hashEntity(entityValue)
  const client = getClient()

  const { data: entries, error } = await client
    .schema('dosafe')
    .rpc('lookup_threats', { p_entity_hash: hash })

  if (error || !entries || entries.length === 0) return null

  const result: ThreatLookupResult = {
    entries,
    maxRiskScore: Math.max(...entries.map((e: ThreatEntry) => e.risk_score)),
    sources: [...new Set(entries.map((e: ThreatEntry) => e.source))],
    categories: [...new Set(entries.map((e: ThreatEntry) => e.category))],
  }

  // Check for cluster
  const clustered = entries.find((e: ThreatEntry) => e.cluster_id)
  if (clustered?.cluster_id) {
    const { data: members } = await client
      .schema('dosafe')
      .rpc('lookup_cluster_members', { p_cluster_id: clustered.cluster_id })

    const { data: clusterInfo } = await client
      .schema('dosafe')
      .from('threat_clusters')
      .select('id, name')
      .eq('id', clustered.cluster_id)
      .single()

    if (clusterInfo && members) {
      result.cluster = {
        id: clusterInfo.id,
        name: clusterInfo.name,
        members: members.filter((m: ThreatEntry) => m.entity_hash !== hash),
      }
    }
  }

  return result
}

// ─── Upsert ───

export async function upsertThreats(entries: ThreatEntry[]): Promise<{ added: number; updated: number }> {
  if (entries.length === 0) return { added: 0, updated: 0 }

  const client = getClient()
  let added = 0
  let updated = 0

  // Batch upsert in chunks of 500
  const CHUNK_SIZE = 500
  for (let i = 0; i < entries.length; i += CHUNK_SIZE) {
    const chunk = entries.slice(i, i + CHUNK_SIZE).map(e => ({
      ...e,
      last_seen_at: new Date().toISOString(),
    }))

    const { data, error } = await client
      .schema('dosafe')
      .from('threat_intel')
      .upsert(chunk, {
        onConflict: 'entity_hash,source',
        ignoreDuplicates: false,
      })
      .select('id')

    if (error) {
      console.error('Upsert error:', error)
      continue
    }
    // Rough estimate: upsert doesn't distinguish insert vs update
    added += data?.length ?? 0
  }

  return { added, updated }
}

// ─── Cache runtime results ───

export async function cacheRuntimeResult(
  entityType: string,
  entityValue: string,
  category: string,
  riskScore: number,
  rawData: Record<string, unknown>
): Promise<void> {
  const hash = await hashEntity(entityValue)
  const expires = new Date()
  expires.setDate(expires.getDate() + 7) // 7-day cache

  await upsertThreats([{
    entity_type: entityType,
    entity_value: entityValue,
    entity_hash: hash,
    source: 'runtime_cache',
    category,
    risk_score: riskScore,
    raw_data: rawData,
    expires_at: expires.toISOString(),
  }])
}

// ─── Sync log ───

export async function logSync(
  source: string,
  status: 'running' | 'success' | 'partial' | 'failed',
  entriesProcessed?: number,
  entriesAdded?: number,
  error?: string
): Promise<string> {
  const client = getClient()
  const { data } = await client
    .schema('dosafe')
    .from('sync_log')
    .insert({
      source,
      status,
      entries_processed: entriesProcessed ?? 0,
      entries_added: entriesAdded ?? 0,
      error,
      finished_at: status !== 'running' ? new Date().toISOString() : null,
    })
    .select('id')
    .single()

  return data?.id ?? ''
}

export async function updateSyncLog(
  id: string,
  status: 'success' | 'partial' | 'failed',
  entriesProcessed: number,
  entriesAdded: number,
  error?: string
): Promise<void> {
  const client = getClient()
  await client
    .schema('dosafe')
    .from('sync_log')
    .update({
      status,
      entries_processed: entriesProcessed,
      entries_added: entriesAdded,
      error,
      finished_at: new Date().toISOString(),
    })
    .eq('id', id)
}
```

**Step 2: Commit**

```bash
git add apps/web/src/lib/threat-intel.ts
git commit -m "feat: add threat-intel library for DB lookup and upsert"
```

---

## Task 3: Sync Edge Function — Source Modules

**Files:**
- Create: `supabase/functions/sync-threats/index.ts`

The sync function fetches from all sources, transforms to ThreatEntry format, and upserts into DB.

**Step 1: Create the sync function**

```typescript
// supabase/functions/sync-threats/index.ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

interface ThreatEntry {
  entity_type: string
  entity_value: string
  entity_hash: string
  source: string
  category: string
  risk_score: number
  raw_data: Record<string, unknown>
}

// ─── Hash (Deno Web Crypto) ───

async function hashEntity(value: string): Promise<string> {
  const data = new TextEncoder().encode(value.toLowerCase())
  const buf = await crypto.subtle.digest('SHA-256', data)
  return '0x' + [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('')
}

// ─── Source: MetaMask eth-phishing-detect ───

async function syncMetaMask(): Promise<ThreatEntry[]> {
  const res = await fetch(
    'https://raw.githubusercontent.com/MetaMask/eth-phishing-detect/main/src/config.json',
    { signal: AbortSignal.timeout(30000) }
  )
  if (!res.ok) throw new Error(`MetaMask fetch failed: ${res.status}`)
  const config = await res.json()
  const entries: ThreatEntry[] = []

  // Blacklist → phishing domains
  for (const domain of (config.blacklist ?? [])) {
    entries.push({
      entity_type: 'domain',
      entity_value: domain.toLowerCase(),
      entity_hash: await hashEntity(domain),
      source: 'metamask',
      category: 'phishing',
      risk_score: 90,
      raw_data: { list: 'blacklist' },
    })
  }

  // Whitelist → legitimate domains
  for (const domain of (config.whitelist ?? [])) {
    entries.push({
      entity_type: 'domain',
      entity_value: domain.toLowerCase(),
      entity_hash: await hashEntity(domain),
      source: 'metamask',
      category: 'legitimate',
      risk_score: 0,
      raw_data: { list: 'whitelist' },
    })
  }

  // Fuzzylist → stored for future fuzzy matching
  for (const domain of (config.fuzzylist ?? [])) {
    entries.push({
      entity_type: 'domain',
      entity_value: domain.toLowerCase(),
      entity_hash: await hashEntity(domain),
      source: 'metamask',
      category: 'legitimate',
      risk_score: 0,
      raw_data: { list: 'fuzzylist' },
    })
  }

  return entries
}

// ─── Source: URLhaus (abuse.ch) ───

async function syncURLhaus(): Promise<ThreatEntry[]> {
  const res = await fetch('https://urlhaus-api.abuse.ch/v1/urls/recent/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    signal: AbortSignal.timeout(30000),
  })
  if (!res.ok) throw new Error(`URLhaus fetch failed: ${res.status}`)
  const data = await res.json()
  const entries: ThreatEntry[] = []

  for (const item of (data.urls ?? [])) {
    if (!item.url) continue
    entries.push({
      entity_type: 'url',
      entity_value: item.url,
      entity_hash: await hashEntity(item.url),
      source: 'urlhaus',
      category: 'malware',
      risk_score: item.url_status === 'online' ? 90 : 70,
      raw_data: {
        threat: item.threat ?? null,
        tags: item.tags ?? [],
        url_status: item.url_status ?? null,
        host: item.host ?? null,
        date_added: item.date_added ?? null,
      },
    })
  }

  return entries
}

// ─── Source: OpenPhish Community ───

async function syncOpenPhish(): Promise<ThreatEntry[]> {
  const res = await fetch('https://openphish.com/feed.txt', {
    signal: AbortSignal.timeout(15000),
  })
  if (!res.ok) throw new Error(`OpenPhish fetch failed: ${res.status}`)
  const text = await res.text()
  const entries: ThreatEntry[] = []

  for (const line of text.split('\n')) {
    const url = line.trim()
    if (!url || !url.startsWith('http')) continue
    entries.push({
      entity_type: 'url',
      entity_value: url,
      entity_hash: await hashEntity(url),
      source: 'openphish',
      category: 'phishing',
      risk_score: 80,
      raw_data: {},
    })
  }

  return entries
}

// ─── Batch upsert ───

async function batchUpsert(entries: ThreatEntry[]): Promise<{ added: number }> {
  let added = 0
  const CHUNK = 500

  for (let i = 0; i < entries.length; i += CHUNK) {
    const chunk = entries.slice(i, i + CHUNK).map(e => ({
      ...e,
      last_seen_at: new Date().toISOString(),
      first_seen_at: new Date().toISOString(),
      status: 'active',
    }))

    const { data, error } = await supabase
      .schema('dosafe')
      .from('threat_intel')
      .upsert(chunk, { onConflict: 'entity_hash,source', ignoreDuplicates: false })
      .select('id')

    if (error) {
      console.error(`Upsert chunk error:`, error.message)
      continue
    }
    added += data?.length ?? 0
  }

  return { added }
}

// ─── Sync log helpers ───

async function logStart(source: string): Promise<string> {
  const { data } = await supabase
    .schema('dosafe')
    .from('sync_log')
    .insert({ source, status: 'running' })
    .select('id')
    .single()
  return data?.id ?? ''
}

async function logFinish(
  id: string,
  status: 'success' | 'partial' | 'failed',
  processed: number,
  added: number,
  error?: string
) {
  await supabase.schema('dosafe').from('sync_log').update({
    status,
    entries_processed: processed,
    entries_added: added,
    error,
    finished_at: new Date().toISOString(),
  }).eq('id', id)
}

// ─── Orchestrator ───

interface SourceResult {
  name: string
  entries: ThreatEntry[]
  error?: string
}

async function runSync(): Promise<void> {
  console.log('Sync started at', new Date().toISOString())

  const sources: { name: string; fn: () => Promise<ThreatEntry[]> }[] = [
    { name: 'metamask', fn: syncMetaMask },
    { name: 'urlhaus', fn: syncURLhaus },
    { name: 'openphish', fn: syncOpenPhish },
  ]

  // Run all sources in parallel
  const results: SourceResult[] = await Promise.all(
    sources.map(async (s) => {
      try {
        const entries = await s.fn()
        return { name: s.name, entries }
      } catch (err: any) {
        console.error(`Source ${s.name} failed:`, err.message)
        return { name: s.name, entries: [], error: err.message }
      }
    })
  )

  // Upsert and log each source
  for (const result of results) {
    const logId = await logStart(result.name)

    if (result.error) {
      await logFinish(logId, 'failed', 0, 0, result.error)
      continue
    }

    try {
      const { added } = await batchUpsert(result.entries)
      await logFinish(logId, 'success', result.entries.length, added)
      console.log(`${result.name}: ${result.entries.length} processed, ${added} upserted`)
    } catch (err: any) {
      await logFinish(logId, 'failed', result.entries.length, 0, err.message)
    }
  }

  console.log('Sync finished at', new Date().toISOString())
}

// ─── HTTP Handler ───

Deno.serve(async (req: Request) => {
  // Verify request is from pg_cron or admin (check Authorization header)
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response('Unauthorized', { status: 401 })
  }

  // @ts-ignore — EdgeRuntime.waitUntil for background processing
  EdgeRuntime.waitUntil(runSync())

  return new Response(JSON.stringify({ status: 'sync started' }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
```

**Step 2: Commit**

```bash
git add supabase/functions/sync-threats/index.ts
git commit -m "feat: add sync-threats edge function for threat data ingestion"
```

---

## Task 4: Integrate DB Lookup into `/api/url-check`

**Files:**
- Modify: `apps/web/src/app/api/url-check/route.ts`
- Reference: `apps/web/src/lib/threat-intel.ts`

**Step 1: Add DB lookup + cache to url-check**

At the top of `route.ts`, add import:
```typescript
import { lookupThreats, cacheRuntimeResult } from '@/lib/threat-intel'
```

In the `POST` handler, after URL normalization and before `Promise.all` runtime checks, add DB lookup:

```typescript
// 1. DB lookup first (instant)
const dbResult = await lookupThreats(normalized.normalized).catch(() => null)
// Also check by domain
const dbDomainResult = await lookupThreats(domain).catch(() => null)
```

Merge DB signals into `assessRisk`. After runtime checks complete, cache the result:

```typescript
// 3. Cache runtime result for future lookups
if (!dbResult && !dbDomainResult) {
  cacheRuntimeResult('domain', domain, level === 'safe' ? 'legitimate' : 'unknown',
    level === 'critical' ? 95 : level === 'high' ? 80 : level === 'medium' ? 50 : 20,
    { safeBrowsing: safeBrowsing.threats, whoisAge: whois.ageDays }
  ).catch(() => {}) // fire-and-forget
}
```

Add DB signals to the response:
```typescript
const response: UrlCheckResponse = {
  // ... existing fields
  threatIntel: dbResult ?? dbDomainResult ?? null, // NEW
}
```

**NOTE:** This task modifies an existing route. Read the full current file before editing. Preserve all existing logic — this is additive. The DB lookup is a performance enhancement, not a replacement.

**Step 2: Commit**

```bash
git add apps/web/src/app/api/url-check/route.ts
git commit -m "feat: add DB-first threat intel lookup to url-check with runtime cache"
```

---

## Task 5: Integrate DB Lookup into `/api/entity-check`

**Files:**
- Modify: `apps/web/src/app/api/entity-check/route.ts`

**Step 1: Add DB lookup to entity-check**

Import threat-intel library and add DB lookup before on-chain fallback:

```typescript
import { lookupThreats } from '@/lib/threat-intel'

// In POST handler, before on-chain query:
// 1. DB lookup first
const dbResult = await lookupThreats(entityId).catch(() => null)

// 2. If DB has data, combine with on-chain
// 3. If DB miss, fall back to on-chain query (existing behavior)
```

Add cluster data to response if found.

**Step 2: Commit**

```bash
git add apps/web/src/app/api/entity-check/route.ts
git commit -m "feat: add DB-first lookup to entity-check with cluster support"
```

---

## Task 6: Update Bot Scam/Phone Formatters for Threat Intel Data

**Files:**
- Modify: `supabase/functions/dosafe-telegram/index.ts`

**Step 1: Update formatScamResult to show threat intel sources**

When the API response includes `threatIntel` data, show which databases flagged the entity:

```typescript
// In formatScamResult(), add after existing sections:
if (data.threatIntel?.entries?.length > 0) {
  msg += `━━━━━━━━━━━━━━━━\n`
  msg += `🗄️ ${lang === 'vi' ? 'Cơ sở dữ liệu' : 'Databases'}:\n`
  for (const entry of data.threatIntel.entries.slice(0, 3)) {
    const srcLabel = { metamask: 'MetaMask', urlhaus: 'URLhaus', openphish: 'OpenPhish', onchain: 'DOS Chain', user_report: 'User Report' }[entry.source] ?? entry.source
    msg += `• ${srcLabel}: ${entry.category} (${entry.risk_score}/100)\n`
  }
}

// Show cluster members if found
if (data.threatIntel?.cluster?.members?.length > 0) {
  msg += `━━━━━━━━━━━━━━━━\n`
  msg += `🔗 ${lang === 'vi' ? 'Liên quan' : 'Related'}:\n`
  for (const m of data.threatIntel.cluster.members.slice(0, 3)) {
    msg += `• ${m.entity_type}: ${m.entity_value}\n`
  }
}
```

**Step 2: Commit**

```bash
git add supabase/functions/dosafe-telegram/index.ts
git commit -m "feat: show threat intel sources and clusters in bot responses"
```

---

## Task 7: Deploy Sync Function + Set Up pg_cron

**Step 1: Deploy the sync-threats function**

```bash
cd d:/Projects/DOSafe
npx supabase functions deploy sync-threats
```

**Step 2: Run first sync manually**

```bash
curl -X POST https://gulptwduchsjcsbndmua.supabase.co/functions/v1/sync-threats \
  -H "Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>"
```

**Step 3: Verify data in DB**

Check via Supabase Dashboard > Table Editor > dosafe.threat_intel. Should see MetaMask (~15k), URLhaus (~1k), OpenPhish (~500) entries.

**Step 4: Enable pg_cron extension**

In Supabase Dashboard > Database > Extensions, enable `pg_cron`.

Then run SQL in Supabase SQL Editor:

```sql
-- Schedule sync every 6 hours
select cron.schedule(
  'sync-threats-every-6h',
  '0 */6 * * *',
  $$
  select net.http_post(
    url := 'https://gulptwduchsjcsbndmua.supabase.co/functions/v1/sync-threats',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    )
  );
  $$
);
```

**NOTE:** The `net.http_post` function requires the `pg_net` extension (usually enabled by default on Supabase). If not available, use `supabase_functions.http_request` instead. Check Supabase docs for the current recommended approach.

**Step 5: Commit any config changes**

```bash
git commit -m "chore: deploy sync-threats function and configure pg_cron schedule"
```

---

## Task 8: User Report Command in Bot

**Files:**
- Modify: `supabase/functions/dosafe-telegram/index.ts`

**Step 1: Add /report command and handler**

Add i18n strings for report command. Add `handleReport()` function that:
1. Takes user free-text input
2. Calls LLM to extract entity_type + entity_value
3. Inserts into threat_intel via `DOSAFE_API_URL/api/entity-report` (new route)
4. Responds with confirmation

**Step 2: Create `/api/entity-report` route**

```
apps/web/src/app/api/entity-report/route.ts
```

Accepts `{ entity_type, entity_value, reported_by, description }`, normalizes, hashes, inserts with source: 'user_report', risk_score: 50.

**Step 3: Add report routing to bot**

In `processMessage()`, add `/report` command handling.

**Step 4: Commit**

```bash
git add supabase/functions/dosafe-telegram/index.ts apps/web/src/app/api/entity-report/route.ts
git commit -m "feat: add user report command to bot with entity-report API"
```

---

## Task 9: Push and Deploy Everything

**Step 1: Push all commits**

```bash
cd d:/Projects/DOSafe
git push
```

**Step 2: Deploy updated bot**

```bash
npx supabase functions deploy dosafe-telegram --no-verify-jwt
```

**Step 3: Verify Vercel deployment**

Wait for Vercel build to complete. Test:
- `POST /api/url-check` with `{"url": "evil-phishing-example.com"}` — should show MetaMask blacklist hit
- `POST /api/entity-check` with `{"entityType": "domain", "entityId": "metamask.xyz"}` — should show DB data

**Step 4: Test bot end-to-end**

In Telegram:
1. Send `evil-phishing-example.com` → should show MetaMask phishing flag from DB
2. Send `0989777701` → should show "no info" (no data yet)
3. Send `/report` → test report flow

---

## Execution Order Summary

| Task | Component | Dependencies |
|------|-----------|-------------|
| 1 | DB Schema Migration | None |
| 2 | Threat Intel Library | Task 1 |
| 3 | Sync Edge Function | Task 1 |
| 4 | url-check DB Integration | Tasks 1, 2 |
| 5 | entity-check DB Integration | Tasks 1, 2 |
| 6 | Bot Formatter Updates | Tasks 4, 5 |
| 7 | Deploy Sync + pg_cron | Tasks 1, 3 |
| 8 | User Report Command | Tasks 1, 2 |
| 9 | Push + Deploy + Test | All above |

**Parallelizable:** Tasks 3, 4, 5 can run in parallel after Task 2. Tasks 6 and 8 can run in parallel after Tasks 4/5.
