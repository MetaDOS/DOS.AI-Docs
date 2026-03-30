#!/usr/bin/env -S deno run --allow-net --allow-read --allow-env
/**
 * sync-changelog.ts
 *
 * Parses CHANGELOG.md and upserts entries into dosai.changelog table.
 * Also fetches OpenClaw GitHub Releases and merges them in.
 * Optionally rewrites descriptions into user-friendly copy via LLM.
 *
 * Usage:
 *   deno run --allow-net --allow-read --allow-env scripts/sync-changelog.ts
 *
 * Env:
 *   SUPABASE_URL          — Supabase project URL
 *   SUPABASE_SERVICE_KEY  — Service role key (for write access)
 *   GITHUB_TOKEN          — (optional) GitHub PAT for higher rate limits
 *   VLLM_URL              — vLLM endpoint for LLM rewrite (optional)
 *   VLLM_API_KEY          — API key for vLLM
 */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "https://gulptwduchsjcsbndmua.supabase.co";
const SUPABASE_KEY = Deno.env.get("SUPABASE_SERVICE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const GITHUB_TOKEN = Deno.env.get("GITHUB_TOKEN") || "";
const VLLM_URL = Deno.env.get("VLLM_URL") || "https://inference.dos.ai";
const VLLM_API_KEY = Deno.env.get("VLLM_API_KEY") || "";
const OPENCLAW_REPO = "openclaw/openclaw";
const CHANGELOG_PATH = new URL("../CHANGELOG.md", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");

interface ChangelogEntry {
  date: string;
  product: string;
  type: string;
  title: string;
  description: string | null;
  description_user?: string | null;
  source: string;
}

// --- 1. Parse CHANGELOG.md ---

function parseChangelog(content: string): ChangelogEntry[] {
  const entries: ChangelogEntry[] = [];
  let currentDate = "";

  for (const line of content.split("\n")) {
    const dateMatch = line.match(/^## (\d{4}-\d{2}-\d{2})/);
    if (dateMatch) {
      currentDate = dateMatch[1];
      continue;
    }
    if (!currentDate) continue;

    const entryMatch = line.match(
      /^- \*\*(\w+)\*\* \[(\w+)\] (.+?)(?:\s*—\s*(.+))?$/
    );
    if (entryMatch) {
      entries.push({
        date: currentDate,
        type: entryMatch[1],
        product: entryMatch[2],
        title: entryMatch[3].trim(),
        description: entryMatch[4]?.trim() || null,
        source: "platform",
      });
    }
  }

  return entries;
}

// --- 2. Fetch OpenClaw GitHub Releases ---

async function fetchOpenClawReleases(): Promise<ChangelogEntry[]> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "dos-ai-changelog-sync",
  };
  if (GITHUB_TOKEN) headers.Authorization = `Bearer ${GITHUB_TOKEN}`;

  try {
    const res = await fetch(
      `https://api.github.com/repos/${OPENCLAW_REPO}/releases?per_page=30`,
      { headers }
    );
    if (!res.ok) {
      console.error(`GitHub API error: ${res.status} ${res.statusText}`);
      return [];
    }

    const releases = await res.json();
    const entries: ChangelogEntry[] = [];

    for (const release of releases) {
      if (release.draft || release.prerelease) continue;
      const tag: string = release.tag_name || "";
      if (tag.includes("beta") || tag.includes("alpha") || tag.includes("rc")) continue;

      const date = release.published_at?.slice(0, 10);
      if (!date) continue;

      const body: string = release.body || "";
      const hasBreaking = /### Breaking\s*\n\s*[^\n#]/.test(body);
      const hasFixes = /### Fix/.test(body);
      const hasChanges = /### Change/.test(body);
      const type = hasBreaking ? "breaking" : hasFixes && !hasChanges ? "fix" : "feature";

      const bullets = body.match(/^- .+/gm) || [];
      const summary = bullets
        .slice(0, 3)
        .map((b) => b.replace(/^- /, "").replace(/\. Thanks @.+$/, "").trim())
        .join("; ");

      entries.push({
        date,
        product: "dosclaw",
        type,
        title: `OpenClaw ${tag.replace(/^v/, "")}`,
        description: summary.slice(0, 300) || null,
        source: "openclaw",
      });
    }

    return entries;
  } catch (err) {
    console.error("Failed to fetch OpenClaw releases:", err);
    return [];
  }
}

// --- 3. LLM rewrite for user-friendly descriptions ---

const PRODUCT_NAMES: Record<string, string> = {
  dosclaw: "DOSClaw",
  dashboard: "Dashboard",
  gateway: "API Gateway",
  dosafe: "DOSafe",
  inference: "Inference",
};

async function rewriteBatch(entries: ChangelogEntry[]): Promise<ChangelogEntry[]> {
  const items = entries.map((e, i) => {
    const product = PRODUCT_NAMES[e.product] || e.product;
    const raw = e.description ? `${e.title} — ${e.description}` : e.title;
    return `${i + 1}. [${e.type}] ${product}: ${raw}`;
  }).join("\n");

  const prompt = `You are writing release notes for DOS.AI, an AI agent platform.
Rewrite each changelog entry below into a single friendly sentence for end users.
Rules:
- Write from the user's perspective ("You can now...", "We fixed...", "Your agent...")
- No technical jargon, no internal implementation details
- Max 15 words per entry
- Keep the same order and numbering
- Return ONLY the numbered list, nothing else

${items}`;

  const res = await fetch(`${VLLM_URL}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${VLLM_API_KEY}`,
    },
    body: JSON.stringify({
      model: "dos-ai",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 512,
      temperature: 0.3,
      chat_template_kwargs: { enable_thinking: false },
    }),
  });

  if (!res.ok) throw new Error(`LLM error: ${res.status}`);

  const data = await res.json();
  const output: string = data.choices?.[0]?.message?.content || "";
  const lines = output.split("\n").filter((l: string) => /^\d+\./.test(l.trim()));

  if (lines.length !== entries.length) {
    throw new Error(`Expected ${entries.length} lines, got ${lines.length}`);
  }

  return entries.map((e, i) => ({
    ...e,
    description_user: lines[i].replace(/^\d+\.\s*/, "").trim(),
  }));
}

async function rewriteEntries(entries: ChangelogEntry[]): Promise<ChangelogEntry[]> {
  if (!VLLM_API_KEY) {
    console.log("  VLLM_API_KEY not set, skipping LLM rewrite");
    return entries;
  }

  // Only rewrite entries that don't have description_user yet
  const needsRewrite = entries.filter((e) => !e.description_user);
  if (needsRewrite.length === 0) {
    console.log("  All entries already have user descriptions");
    return entries;
  }

  const BATCH_SIZE = 10;
  const results = [...entries];
  let rewrote = 0;

  for (let i = 0; i < needsRewrite.length; i += BATCH_SIZE) {
    const batch = needsRewrite.slice(i, i + BATCH_SIZE);
    try {
      const rewritten = await rewriteBatch(batch);
      // Map back by matching original entries
      for (const r of rewritten) {
        const idx = results.findIndex(
          (e) => e.date === r.date && e.product === r.product && e.title === r.title
        );
        if (idx !== -1) {
          results[idx].description_user = r.description_user;
          rewrote++;
        }
      }
    } catch (err) {
      console.warn(`  Batch ${i / BATCH_SIZE + 1} failed: ${err} — skipping batch`);
    }
  }

  console.log(`  Rewrote ${rewrote}/${needsRewrite.length} entries`);
  return results;
}

// --- 4. Upsert to Supabase ---

async function upsertEntries(entries: ChangelogEntry[]): Promise<number> {
  if (!SUPABASE_KEY) {
    console.error("SUPABASE_SERVICE_KEY not set, skipping DB sync");
    return 0;
  }

  let total = 0;
  for (let i = 0; i < entries.length; i += 50) {
    const batch = entries.slice(i, i + 50);
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/changelog?on_conflict=date,product,title`,
      {
        method: "POST",
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          "Content-Type": "application/json",
          "Content-Profile": "dosai",
          Prefer: "resolution=merge-duplicates,return=minimal",
        },
        body: JSON.stringify(batch),
      }
    );

    if (!res.ok) {
      const err = await res.text();
      console.error(`Supabase upsert error (batch ${i}): ${res.status} ${err}`);
    } else {
      total += batch.length;
    }
  }

  return total;
}

// --- Main ---

async function main() {
  console.log("=== DOS.AI Changelog Sync ===\n");

  // 1. Parse CHANGELOG.md
  console.log(`Reading ${CHANGELOG_PATH}...`);
  const content = await Deno.readTextFile(CHANGELOG_PATH);
  const platformEntries = parseChangelog(content);
  console.log(`  Parsed ${platformEntries.length} platform entries`);

  // 2. Fetch OpenClaw releases
  console.log(`\nFetching OpenClaw releases from ${OPENCLAW_REPO}...`);
  const openclawEntries = await fetchOpenClawReleases();
  console.log(`  Fetched ${openclawEntries.length} OpenClaw entries`);

  // 3. Merge
  const allEntries = [...platformEntries, ...openclawEntries];
  console.log(`\nTotal: ${allEntries.length} entries`);

  // 4. LLM rewrite
  console.log("\nRewriting descriptions via LLM...");
  const rewritten = await rewriteEntries(allEntries);
  const rewriteCount = rewritten.filter((e) => e.description_user).length;
  console.log(`  Rewrote ${rewriteCount} entries`);

  // 5. Upsert to Supabase
  console.log("\nUpserting to Supabase...");
  const upserted = await upsertEntries(rewritten);
  console.log(`  Upserted ${upserted} entries`);

  // 6. Summary
  const products = new Set(allEntries.map((e) => e.product));
  const dates = [...new Set(allEntries.map((e) => e.date))].sort();
  console.log(`\nProducts: ${[...products].join(", ")}`);
  console.log(`Date range: ${dates.at(0)} → ${dates.at(-1)}`);
  console.log("\nDone!");
}

main();
