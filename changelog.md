# Changelog

All notable changes to the DOS.AI platform are documented here.
This file is the source of truth — synced to `dosai.changelog` on deploy.

Format: `- **type** [product] Title — Description`
Types: `feature`, `fix`, `improvement`, `breaking`
Products: `dosclaw`, `dashboard`, `gateway`, `dosafe`, `inference`

---

## 2026-06-16

- **feature** [dosclaw] Multi-Platform Commerce Tools — One agent can now serve more than one storefront at once (e.g. KiotViet POS + WooCommerce); product lookups aggregate across every connected platform with platform-qualified codes (`woocommerce:11`, `kiotviet:DH000002`), and stock/order/create-order tools route to the right platform automatically; single-platform agents are unchanged

## 2026-06-15

- **feature** [gateway] Response Caching — Exact-match response cache for non-streaming requests; identical requests return instantly with no model call and no token charge. On by default for `temperature: 0`; control per request with the `X-DOS-Cache: on|off` header; cache hits return `X-DOS-Cache: hit` / `X-Provider: cache`
- **feature** [gateway] Guardrails (PII) — Opt-in deterministic PII detection via the `X-DOS-Guardrails: block|redact|flag` header; detects email, phone, and Luhn-validated card numbers in chat/completions input
- **feature** [gateway] Batch API — OpenAI-compatible `/v1/files` + `/v1/batches` for async batch processing of `dos-ai` chat completions, processed on idle GPU capacity
- **feature** [dosclaw] Commerce Connectors — Connect commerce platforms (WooCommerce and KiotViet) to an agent directly from the dashboard; the bot gains in-chat tools to search products, check stock, look up order status, and create orders against the live store
- **feature** [dosafe] C2PA Provenance + Integrity Clash — Image AI detection now parses real C2PA manifests; flags an "Integrity Clash" when a manifest claims camera origin but the forensic ensemble independently reports the pixels as AI, instead of being laundered past the detector by forged camera credentials
- **improvement** [dosafe] In-the-Wild Detection Calibration — Recalibrated the standalone image `is_ai_generated` threshold against an in-the-wild benchmark to catch more real-world AI images

## 2026-06-13

- **feature** [dosclaw] Scope Guard — Business-bounded bots (customer-service, shop, sales, real-estate, finance) now politely decline off-topic general-AI requests (coding, homework, essays, translation, chit-chat) with one short redirect instead of acting as a free ChatGPT; education-tutor and content-creator templates are exempt
- **fix** [dosclaw] Reasoning Leak on Bank Reset — Serial-less device-reset requests in bank-officer groups no longer leak the model's raw chain-of-thought into the customer reply; the bot now asks for the serial in one short line

## 2026-06-12

- **feature** [dashboard] Agents Funding Summary — Billing Overview now shows an Agents card: total agents, how many are included in the plan vs billed from credits (~$1/day each), per-agent status, and a "deleted in Xd" countdown for suspended agents
- **feature** [dashboard] Subscription Cancel Flow — Billing overview shows the current plan and adds a cancel flow; pay-by-credits wording clarified
- **fix** [dosclaw] Device Reset Messaging — Tingee loa reset now correctly tells the customer the unlink is immediate (no restart, no waiting) and that the device must be re-linked to use again; actionable failure reasons are relayed instead of a generic system error
- **fix** [dosafe] QR Decode Accuracy — Swapped the QR decoder (goqr → gozxing/ZXing) after the old library silently mis-decoded a real device QR into the wrong serial

## 2026-06-11

- **feature** [dosafe] Image Source-URL Analysis — Image AI detection now classifies the source URL (domain reputation + filename/path AI markers like `ai-generated`, `midjourney`, `dall-e`) and feeds it to the meta-judge, catching AI images that the pixel ensemble alone scores as borderline
- **feature** [dosclaw] No Invented Links — KB grounding now forbids agents from fabricating third-party links in answers
- **feature** [gateway] Billing Drift Alerts — Real-time DOSiren alert when a paid webhook fails to grant credit, plus a config-drift canary on `/system/health` to catch silent billing-config mismatches

## 2026-06-10

- **feature** [dosclaw] Cleaner Web-to-KB Ingestion — Ingesting a web URL into an agent's knowledge base now packs chunks, strips markup noise and empty heading-anchor links, and understands GitBook `llms-full.txt` for higher-quality retrieval

## 2026-06-09

- **feature** [dashboard] Pricing v2 — New plan tiers (Plus $9 / Pro $19) with a 1-day free trial plus a 4-hour countdown, per-billing-cycle plan credits, and free `dos-ai` model usage; existing trials are grandfathered so the shorter trial is not applied retroactively
- **fix** [gateway] Stripe Subscription Reference — Read the subscription reference from `invoice.parent` to match Stripe's API so subscription credit grants resolve correctly

## 2026-06-08

- **feature** [dosclaw] Free dos-ai for Agents — DOSClaw agent traffic now runs the `dos-ai` model for free, with per-tier rate limits and a request queue (10s timeout) when the concurrency limit is hit
- **feature** [dosclaw] Web-Link Knowledge Sources — Agents can ingest web URLs into their knowledge base (with a refresh cron) and manage those web sources from a new dashboard UI
- **feature** [dosclaw] KB-Only Mode — Per-agent `kb_only` flag denies `web_fetch`/`web_search` so a bot answers strictly from its own knowledge base

## 2026-06-06

- **feature** [gateway] Provider Marketplace (Phase A/B) — Catalog of upstream providers and a registry-based routing layer (flag-gated, default off) toward a multi-provider LLM marketplace
- **feature** [dashboard] OIDC Login (app.dos.ai) — Migrated app sign-in to an OIDC authorization-code + PKCE flow; logout now ends the IdP session via SLO so the next sign-in shows the login form instead of silently re-authenticating
- **fix** [dosclaw] Workspace-Only File Tools — OpenClaw template now enforces `tools.fs.workspaceOnly=true`, restricting agent file operations to the workspace
- **fix** [gateway] PII Masking in Memory — Vietnamese phone numbers are masked before being written to durable agent memory

## 2026-06-04

- **feature** [dosclaw] DOS Grounding Plugin — New first-party OpenClaw plugin injects KB context before the prompt is built, giving deterministic knowledge-base grounding across all gateway channels (not just Zalo); blocks fabricated order lookups

## 2026-06-03

- **feature** [dosclaw] Self-Serve Zalo Personal (zalouser) — Connect a personal Zalo account to an agent via QR code from the dashboard
- **feature** [dosclaw] Cross-Channel Customer Identity — Per-customer memory is now keyed by phone number across channels, with Telegram `request_contact` to link a customer's identity across Zalo/Telegram
- **feature** [dosclaw] Device Reset Tool — `reset_device` MCP tool for Tingee loa reset, wired per-agent and gated to designated groups
- **fix** [dosclaw] Stronger Knowledge Grounding — `search_knowledge` now returns an explicit instruction to answer only from results (curbs hallucination) with a broader-triggering tool description

## 2026-06-02

- **feature** [dashboard] User Timezone + Zalo OA Schedule — User timezone setting with timezone-aware Zalo OA auto-active scheduling
- **feature** [dosclaw] Zalo OA Profile Context — Injects the Zalo OA follower's profile into the agent context and strips OA-incompatible markdown; server-side per-customer memory auto-capture and recall on Zalo personal, gated to 1:1 DMs to prevent group leakage
- **fix** [dosclaw] Zalo OA Reply Hygiene — Hard-strips CJK characters from Zalo OA replies and unwraps code-wrapped replies

## 2026-06-01

- **feature** [dosclaw] Per-Customer Memory (All Channels) — Agents gain per-customer memory across every channel via MCP tools (`search_memory` + `remember`), so a bot remembers a customer's stated facts between conversations
- **feature** [dashboard] Self-Service Zalo OA — Connect and manage a Zalo Official Account integration, including an auto-active schedule editor, from the dashboard
- **improvement** [gateway] Reasoning-Aware Timeouts — Non-streaming timeout now accounts for reasoning tokens (ported from DOSRouter) so long reasoning turns are not cut off

## 2026-05-31

- **feature** [dosclaw] Zalo OA Scheduled Auto-Active — Zalo OA bots can open on a scheduled window with no `/start` needed
- **fix** [dosclaw] Memory Capture Accuracy — Memory now captures only customer-stated facts, never the assistant's own claims
- **fix** [dosclaw] Version Floor — Enforces an OpenClaw image version floor (currently 2026.5.12) so agents can't be pinned to an image version that crash-loops

## 2026-05-30

- **feature** [dosclaw] Multi-OA Zalo Official Account Channel — Multi-tenant Zalo OA channel with stateless OAuth, webhook verification, activation gating, and a 24h idle sliding-window expiry
- **feature** [gateway] 3-Tier Detector Fallback — Detection requests fall back across Lambda → local → Cloud Run for resilience
- **improvement** [gateway] Self-Host-Primary Embeddings — Embeddings serve from self-hosted vLLM first with a cloud fallback

## 2026-05-27

- **feature** [dosclaw] Google Sheet → Knowledge Base Sync — Sync a Google Sheet into an agent's knowledge base, resolving FAQ columns by header name (diacritic-insensitive) on a recurring cron
- **improvement** [gateway] On-Demand Detector GPU — Pre-warms the GPU detector only while the primary detector is down, avoiding idle GPU billing

## 2026-05-25

- **feature** [dosclaw] Agent Location Selection — Choose an agent's hosting location on create, with project-scoped grants/RBAC and a per-backend agent cap
- **feature** [dosclaw] Human Handoff (Multi-Target) — `handoff_to_human` MCP tool hands a conversation off to a human, fanning out to multiple targets (Zalo + Telegram) and attaching the customer's Zalo group invite link
- **feature** [dosclaw] Chat-Save to Knowledge — Endpoint to save knowledge from chat with peer-owner auth; SOUL/IDENTITY/AGENTS.md and knowledge files persist across the container lifecycle
- **fix** [dosclaw] Agents Run 24/7 — Local agents stay running by default; idle-sleep is now opt-in

## 2026-05-24

- **feature** [gateway] Unified DOSafe API Key — DOSafe routes now accept the unified `dos_sk_` key
- **feature** [dashboard] DOSafe Usage in Dashboard — View DOSafe API usage from the dashboard

## 2026-05-23

- **feature** [dosclaw] Custom SOUL/Identity + Knowledge — Per-agent custom SOUL/identity with hybrid-by-size knowledge (small knowledge inlined, larger sets via RAG search)
- **feature** [dosclaw] Image Anti-Fabrication Rule — All agent SOUL templates get an image anti-fabrication rule so bots don't invent image contents

## 2026-05-22

- **feature** [dosclaw] RAG Knowledge Base (Phase 1) — Knowledge base with chunking, embedding, and kNN search; uploads replace files in place on re-upload
- **feature** [dosafe] Partner Server Deployment Package — On-prem/partner server deployment package and backend config for running the stack at a partner site

## 2026-05-20

- **feature** [dosclaw] Bring-Your-Own-Subscription Plugins — Per-agent plugin slots plus a model-auth status endpoint for agents using their own provider subscription
- **feature** [gateway] Billing Reconciliation — Billing reconciliation cron with an unbilled-usage status and Telegram alerting on unbilled fallback

## 2026-05-19

- **feature** [dashboard] Connect ChatGPT (BYOS) — Connect your own ChatGPT/OpenAI account to an agent via device-code OAuth, with a per-agent Model Auth status card
- **fix** [gateway] Emergency Paid Fallback — Falls back to a paid provider with a TTFB timeout when self-hosted vLLM is down

## 2026-05-16

- **feature** [dosclaw] FinOne Merchant Pairing — Bind and verify a merchant's FinOne userId during agent provisioning; the pairing survives container rebuild/upgrade
- **feature** [dosafe] BlazeFace Liveness Pipeline — Face verifier swaps to MediaPipe BlazeFace (Apache 2.0) for detection and the CVPR 2024-winning Swin-V2 liveness model

## 2026-05-14

- **feature** [dosclaw] VN Merchant Accounting Agent — New `finance-assistant` template and a public FinOne skill giving VN merchants a bot with accounting MCP tools (transactions, budgets, goals, recurring, insights, education)

## 2026-05-13

- **feature** [dosclaw] Google Workspace OAuth in Agents — Bundles Google Workspace OAuth into agent containers so bots can act on Gmail/Calendar/Drive/Sheets
- **feature** [dosafe] Plagiarism Detection — `/detect-plagiarism` wires corpus search + upsert for plagiarism checking
- **feature** [dosafe] Vietnamese AI-Text Detector (Pilot) — Pilots a Vietnamese AI-text detector (mE5-VN, CC BY 4.0)
- **feature** [dosafe] Partner Webhooks — Risk assessments fire events to B2B partner webhooks

## 2026-05-12

- **improvement** [dosafe] Speaker Verification Upgrade — Swaps the speaker-verification ensemble to ERes2NetV2 (Apache 2.0)

## 2026-05-10

- **feature** [dosafe] MamBo-3 Voice Antispoof — New MamBo-3 voice anti-spoof backend (MIT license), replacing the prior in-house model
- **fix** [gateway] Encrypt Slack Tokens — Slack workspace bot tokens are now encrypted at rest

## 2026-05-08

- **feature** [gateway] Prometheus Metrics — `/metrics` endpoint with hot-path counters and a structured-logging foundation for the gateway

## 2026-05-04

- **fix** [gateway] Streaming Billing Hardening — Paid streaming requests hold against the actual provider, use a bounded SSE reader, and split PayOS/VNPay pending-vs-settled idempotency keys to prevent double-charges
- **fix** [gateway] Webhook PII Redaction — Webhook body logs are redacted to stop leaking PII, and webhook-secret defaults are removed (fail-closed on missing secret)

## 2026-05-03

- **feature** [gateway] Per-User JWT Rate Limit — Per-user token-bucket rate limiting on the JWT auth path

## 2026-04-30

- **feature** [gateway] Fleet Upgrade Safety — Post-incident upgrade safety controls and a `/system/agents/fleet-upgrade` admin endpoint with a job-level mutex to prevent simultaneous fleet upgrades

## 2026-04-29

- **feature** [gateway] Multi-Tenant Gateway (Phase 1.5) — Consolidates per-product routing and quota into the gateway

## 2026-04-27

- **feature** [gateway] Supabase JWT Auth + Per-Product Quota — Supabase JWT auth (ES256/JWKS verified) with per-product monthly quota, a `/v1/p/<product>/` route prefix, and per-product audit logging

## 2026-04-26

- **feature** [dosafe] Document Forgery Detection — `/v1/dosafe/detect-doc-forgery` route backed by a multi-layer ensemble (Qwen3.6 + classical forensics + rules)
- **feature** [dosafe] Multimodal Identity Verify — `/v1/dosafe/identity/verify-multimodal` endpoint with active-liveness challenge nonce, plus a multi-frame anti-spoof voting endpoint
- **feature** [dosclaw] Skills Installed State — `/v1/agents/:id/skills/installed` endpoint with cross-device hydrate and an Installed tab in the dashboard
- **improvement** [dosclaw] OpenClaw Changelog Auto-Sync — OpenClaw GitHub releases auto-sync into the changelog every 6h

## 2026-04-24

- **fix** [dashboard] Cross-Subdomain Logout — Session cookie set on `.dos.ai` for all subdomains, with duplicate `Set-Cookie` clears and a logout layout-race fix

## 2026-04-22

- **feature** [inference] dos-ai → Qwen3.6-35B-A3B (NVFP4) — Upgraded the self-hosted `dos-ai` model to Qwen3.6-35B-A3B in NVFP4 on vLLM
- **feature** [dosafe] Detector v2 Consolidation — Merged image-detector, face anti-spoof, and voice anti-spoof into one consolidated detector service

## 2026-04-21

- **feature** [dashboard] Onboarding Email Drip — Wires a 5-email onboarding drip sequence via Brevo templates

## 2026-04-20

- **feature** [dosafe] 1:N Speaker Identification — Voice ID gains a 1:N speaker-identification endpoint returning top-K candidates

## 2026-04-18

- **feature** [dosafe] Face Anti-Spoof v2 — New face anti-spoof v2 service (beta flag)
- **feature** [gateway] Agent Suspension Lifecycle — Flag-gated agent suspension + purge lifecycle; closes a self-credit exploit with atomic credit RPCs
- **feature** [dashboard] Playground — Interactive playground chat UI with streaming

## 2026-04-17

- **feature** [dosafe] Compliance Call Streaming — SSE streaming for progressive call-compliance results, with speaker diarization producing a dialogue-formatted transcript and anti-spoof running independently of enrollment

## 2026-04-15

- **feature** [dashboard] Transactional Email (Brevo) — Brevo integration for transactional emails
- **fix** [dashboard] SSO Login Reliability — Reworked the SSO handler (hash-based token flow, direct JWT decode, redirect-loop break, login-spinner timeouts) to fix sign-in

## 2026-04-14

- **feature** [dashboard] Agent Skills Catalog — New OpenClaw skills catalog tab in the agent dashboard with skill detail views (SKILL.md content, stats, Install button) and a redesigned card-grid agents list

## 2026-04-13

- **feature** [dosafe] Alibaba Cloud eKYC Fallback — Adds an Alibaba Cloud eKYC fallback for face verification

## 2026-04-12

- **feature** [gateway] Cache-Aware Sticky Routing -- DOSRouter pins model to session when context exceeds 3K tokens (single message) or 5K tokens (cumulative) to maximize provider-side prefix cache hits; sticky TTL is per-provider (5min for API providers, 10min for self-hosted vLLM)
- **feature** [gateway] Per-Provider Cache TTL -- Sticky routing TTL matches each provider's prefix cache lifetime: Anthropic/OpenAI/DeepSeek (5 min), vLLM/self-hosted (10 min); configurable via `providerCacheTTLMs` map
- **fix** [dashboard] Cross-Account Logout Loop -- Logout now passes `prompt=login` to id.dos.me to force login form display instead of auto-SSO, preventing cross-account session loops

## 2026-04-11

- **feature** [gateway] DOSRouter Upstream Sync to v0.12.146 -- 17/19 ClawRouter releases ported; includes usage cost breakdown, eco/premium tier fallback, session pinning, agentic 3-state, model roster updates
- **feature** [gateway] DOSRouter Full Port Expansion -- Wallet module (EVM + Solana), payment module (x402 protocol), image generation endpoint, full CLI (serve, classify, models, stats, logs, cache, report, wallet, chain, doctor)
- **feature** [gateway] DOSRouter Open-Sourced -- Standalone Go LLM router at github.com/DOS/DOSRouter with 15-dimension scoring, tier-based routing, structured fallback chains

## 2026-04-08

- **feature** [dosclaw] OpenClaw v2026.4.5 — Major engine upgrade with video/music generation, enhanced memory, and improved channel experience
- **feature** [dosclaw] Video Generation — Agents can create videos using the built-in `video_generate` tool with xAI Grok, Alibaba Wan, and Runway providers
- **feature** [dosclaw] Music Generation — Built-in `music_generate` tool with Google Lyria and MiniMax providers; async task tracking and follow-up delivery
- **feature** [dosclaw] ClawHub Skill Store — Search, browse, and install skills directly from the Control UI Skills panel
- **feature** [dosclaw] Memory Dreaming — Agents automatically distill important conversations into long-term memory via background dreaming phases; Dream Diary surface in the UI
- **feature** [dosclaw] Thinking Level Control — Per-session thinking depth picker in chat header; choose how much reasoning the agent applies per conversation
- **feature** [dosclaw] Structured Progress — Long-running agent tasks now show step-by-step progress updates in compatible UIs
- **improvement** [dosclaw] Multilingual Control UI — Added 12 new locales: Chinese (Simplified/Traditional), Portuguese, German, Spanish, Japanese, Korean, French, Turkish, Indonesian, Polish, and Ukrainian
- **improvement** [dosclaw] Prompt Caching — Smarter cache reuse across follow-up messages for faster and more cost-efficient conversations
- **improvement** [dosclaw] Cleaner Replies — Internal tool tags and planning text no longer leak into user-visible messages
- **improvement** [dosclaw] Discord Media Limit — Inbound/outbound media cap raised to 100MB, matching Telegram
- **fix** [dosclaw] Telegram — Voice note transcription restored in DMs; model picker fixed; topic replies; reaction persistence across restarts; better image handling
- **fix** [dosclaw] Discord — Image generation replies now include actual images; reply threading fixed; voice auto-join more reliable
- **fix** [dosclaw] WhatsApp — Reconnect loop fixed for quiet chats
- **fix** [dosclaw] Group Chat — Replies now use natural chat-style formatting instead of document-style spacing
- **breaking** [dosclaw] Config Cleanup — Legacy config aliases removed; existing configs auto-migrate via `openclaw doctor --fix`

## 2026-04-07

- **feature** [gateway] Streaming Pre-Deduct - Paid provider streaming requests now hold estimated cost before streaming via atomic `hold_credits()` RPC; reconciled on completion or kept on interruption
- **feature** [dosclaw] Agent Metrics Rewrite - Metrics tab shows billing-based usage (spend, requests, tokens, daily charts) instead of slow openclaw exec; load time reduced from ~10s to ~2s
- **feature** [dashboard] Usage Cost Tracking - Total Spend, Daily Spend chart, and Avg Cost/Request added to the Usage page
- **feature** [dosclaw] Agent Usage Self-Lookup - New `GET /v1/agents/:id/usage/summary` endpoint; bots can answer "how much did I cost?" via SOUL.md curl instruction
- **improvement** [gateway] Atomic Hold RPCs - `hold_credits()` and `release_hold()` PostgreSQL functions for race-free balance holds during streaming
- **improvement** [dosclaw] Container Env Vars - `AGENT_ID` and `AGENT_SLUG` now injected into all agent containers for self-identification

## 2026-04-04

- **feature** [dosclaw] Shared Bot Multi-Agent Routing — Messages from shared Telegram/Discord bots now route through the correct agent's OpenClaw container based on chat ID; agent name/ID injected for personality routing
- **improvement** [gateway] Alert Backend Labels — All container and Status API alerts now include source (LOCAL/AZURE); vLLM health monitoring every 3 minutes via Cloudflare tunnel URLs; recovery alerts bypass dedup cooldown
- **fix** [dosclaw] Agent Version Display — Agent settings now always show current running version with fallback to "latest" instead of blank

## 2026-04-03

- **feature** [dosclaw] OpenClaw v2026.4.2 — Agents pinned to v2026.4.2 with SearXNG web search plugin enabled; version selector filters to multi-arch tags only
- **feature** [dosclaw] Agent Usage Billing — Per-agent usage billing endpoints; agents now track and report token consumption
- **feature** [dashboard] Crypto Payment — Stripe crypto checkout alongside cards; Google Pay, Apple Pay, and Link payment methods supported
- **fix** [gateway] Billing & Provider Routing — Retail pricing uses customer-requested model identity; cloud-only models fail honestly instead of falling back to vLLM; promo pricing cost floor during upstream billing
- **fix** [dashboard] Billing Page — SVG brand icons for payment methods, Link display fix, success toast; fixed fetchBillingData crash from missing brand/last4 fields
- **fix** [gateway] vLLM Health Check URLs — Cloud Run health checks use configured Cloudflare tunnel URLs instead of localhost (unreachable from Cloud Run)

## 2026-04-02

- **feature** [dosclaw] Agent Memory Search — Shared Qwen3-Embedding-4B AWQ embedding service; agents now perform semantic memory search via local vLLM instead of keyword-only recall
- **feature** [dosclaw] SearXNG Web Search — Self-hosted SearXNG enabled for `web_search` tool in agent containers; no external API key required
- **fix** [dosafe] Audio Speech Detection — Replaced spectral band analysis (too many false positives on music) with energy CoV + pause ratio; music-only clips now excluded from AI probability blend
- **fix** [dosafe] Video Frame Extraction — LLM visual analysis now sends extracted frames as base64 images instead of raw video URL; text-only fallback on HTTP 500

## 2026-04-01

- **feature** [gateway] LLM API Marketplace — `GET /v1/catalog` retail endpoint with DB-driven pricing; DeepSeek V3 + Qwen 397B / 122B / 27B now live via DashScope / Alibaba Cloud
- **fix** [gateway] Billing Race Condition — Replaced race-prone async deduction with atomic `deduct_usage()` PostgreSQL RPC; pre-flight balance gate blocks requests before proxying; streaming billing fixed (was charging 0 tokens on SSE responses)
- **feature** [gateway] Multi-Backend Agent Routing — `BackendRouter` dispatches agent ops to local or Azure backend per agent; Azure VM CPU/memory/disk monitored via `/metrics`, alerts on 3 consecutive threshold breaches
- **feature** [gateway] Embeddings Endpoint — `/v1/embeddings` routes to dedicated pooling backend, falls back to DashScope `text-embedding-v4` when local vLLM unavailable
- **feature** [dashboard] dos-ai Launch Promo — $0.01 / 1M tokens (down from $0.10); promo badge with strikethrough original price on models page and model detail
- **feature** [dashboard] SEO — JSON-LD structured data, Open Graph, robots.txt, sitemap.xml, `llms.txt`, `ai.txt` for AI crawlers
- **feature** [dosclaw] Lite Agent Tier — New 2 GB / 0.5 vCPU instance size for free tier users
- **feature** [dosafe] RDAP + URL Path Detection — RDAP domain registration data and URL path heuristics added to entity risk assessment
- **fix** [dosclaw] Pairing & Channels — Shared bot auto-approves pairing; Discord Gateway WebSocket reconnect fixed; slug→UUID deep link resolution fixed
- **fix** [dashboard] Signup Bonus — Fixed $5 credit not granted on Google OAuth login

## 2026-03-31

- **feature** [gateway] Enriched Entity Check — `firstSeenAt`, `reportCount`, `relatedEntities` added to `/v1/dosafe/check` response
- **feature** [dosclaw] Custom Bot Token Validation — Token validated against Telegram API before saving; Disconnect button for shared/custom bot links; clear existing webhook on new custom token connect
- **feature** [dosclaw] Channel Linked State UI — Discord/Telegram channel cards show live connection state (shared bot vs custom token)
- **feature** [dashboard] i18n Agent Detail — 200+ hardcoded strings translated; agent detail page fully internationalized across all 7 supported languages
- **improvement** [dashboard] Language Switcher Redesign — Globe icon + locale code dropdown with checkmark, matching DOSafe design
- **fix** [dosclaw] Agent Stability — Fixed OOM crash loops, memory persistence on restart, deep link slug→UUID resolution

## 2026-03-30

- **feature** [dashboard] Comprehensive i18n — All dashboard pages internationalized (agents list, agent detail, plans, billing, settings)
- **feature** [dashboard] Support Banner — Announcement banner in topbar with Telegram and Discord community links
- **feature** [dashboard] AI Detector Redirect — AI Detector page redirects to dosafe.io (DOSafe owns detection features)
- **fix** [dosclaw] Agent Deep Links — Slug→UUID resolution fixed in DeepLink handler; pairing code shown explicitly in Telegram connect UI
- **fix** [gateway] Image Upload Size — nginx `client_max_body_size` increased to 50 MB for image detection uploads
- **perf** [dashboard] Agent Detail Load — Parallel data fetching reduces agent detail page load time

## 2026-03-29

- **feature** [dosclaw] Instance ID Badge — Each agent now shows a short instance ID (e.g. #568bc2) in the header for quick identification when reporting issues
- **fix** [dosclaw] Open Console Instant Load — Console button now appears immediately on page load instead of after a 4–5s delay
- **fix** [dosclaw] Provisioning Progress Bar — Redeploy now shows the same step-by-step progress bar as initial deploy
- **fix** [dosclaw] Agent Health Stability — Gateway marked healthy only after 3 consecutive successful health checks, preventing premature "Open Console" during boot
- **feature** [dashboard] Language Switcher — Added support for Chinese, Japanese, Korean, Thai, and Indonesian in addition to Vietnamese and English

## 2026-03-28

- **feature** [dosclaw] WhatsApp Dual-Mode — Support both shared bot and native QR code connection for WhatsApp
- **feature** [dosclaw] Discord Connect UI — New Discord integration panel with bot invite flow and connection status
- **fix** [dosclaw] Shared Bot Status — Channel cards now correctly show shared bot connection state for all supported platforms
- **fix** [dosclaw] WhatsApp QR Generation — Fixed CLI flags and stream header parsing for reliable QR code display
- **fix** [dosclaw] Container Lifecycle — Confirm dialogs for stop/restart; fixed upgrade race condition and lxcfs mount errors on restart
- **fix** [dosclaw] Agent Entrypoint — Phased background installs to prevent OOM during boot; pinned dependency versions for reproducibility
- **improvement** [dosclaw] Agent Identity — Agent name and persona now managed via IDENTITY.md for cleaner runtime separation

## 2026-03-26

- **feature** [dosclaw] Instance Sizing — Choose Standard (1 vCPU, 2 GB, $5) or Plus (2 vCPU, 4 GB, $10) when creating agents
- **fix** [dosclaw] Version Selector Filter — Hide architecture-specific tags (-arm64, -amd64), show only multi-arch versions
- **fix** [dosclaw] Token Preservation — Fixed bug where disabling/enabling channels erased encrypted bot tokens

## 2026-03-25

- **feature** [dashboard] Alert Notifications — Telegram alerts for provisioning failures and container resource limits
- **feature** [dosclaw] Auto-capture Owner Chat ID — Bot automatically captures owner's Telegram chat ID on first message for alert delivery

## 2026-03-24

- **feature** [dosclaw] Version Pinning — Pin agents to a specific OpenClaw version or follow latest
- **feature** [dosclaw] Agent Upgrade — One-click upgrade to latest OpenClaw image with graceful container recreation
- **feature** [dosclaw] Brave Search Integration — Connect Brave Search API key to enable web_search tool
- **feature** [dosclaw] GitHub Integration — Connect GitHub token for code-related agent skills

## 2026-03-23

- **feature** [dosclaw] Standalone Agent Containers — No HiClaw Manager dependency, agents run independently with trusted-proxy auth
- **feature** [dosclaw] Bot Personality System — First-run onboarding: name, creature, vibe, emoji
- **feature** [dosclaw] Agent Templates — 5 templates (Personal Assistant, Sales TikTok, CS Shopee, Content Creator, Custom)
- **feature** [dosclaw] Credit-based Pricing — Free=1 trial bot 7d, Plus=1 free, Pro=3 free, extra bots charged from credits
- **feature** [dosclaw] Console Proxy — Trusted-proxy auth for browser-based agent console
- **improvement** [dashboard] Agent Creation Flow — 2-step UI: template selection then configure screen
- **breaking** [dosclaw] Removed CoPaw Runtime — All agents now use OpenClaw runtime only

## 2026-03-21

- **feature** [gateway] Go API Gateway on Cloud Run — Replaced Cloudflare Worker with full Go backend at api.dos.ai
- **feature** [gateway] LLM Inference Proxy — vLLM primary + fallback providers, SSE streaming
- **feature** [gateway] API Key Auth — dos_sk_* format, SHA-256 hash lookup, sliding window rate limiting
- **feature** [gateway] Credit Billing — Balance check, token-based deduction, credit management

## 2026-03-20

- **feature** [dosclaw] Agent Knowledge Base — File upload with RAG indexing for agent context
- **feature** [dosclaw] Agent Backup/Restore — Export and import agent configurations
- **feature** [dosclaw] Default Permissions — Allow-all or ask-permission modes per agent

## 2026-03-15

- **feature** [dosafe] SPAI Detector — Spectral analysis for modern AI image detection (CVPR 2025)
- **feature** [dosafe] Context-Aware Ensemble — Dynamic model weights based on image metadata (editor, compression, beauty app)
- **feature** [dosafe] Exact Match Safety Cap — Reverse search exact matches cap AI score (3+ matches -> 45%)
- **improvement** [gateway] LLM Prompt V3 — Calibrated for DINOv3 + SPAI + CommFor ensemble

## 2026-03-10

- **feature** [dosafe] Web Search + LLM Analysis — 4th data source for entity risk assessment (Serper/SerpApi + vLLM)
- **feature** [dosafe] Partner API — Public API at dosafe.io/api/v1 with API key auth and scoped permissions

## 2026-03-08

- **feature** [dosclaw] Onboarding Wizard — Full CLI setup: security, model, channels, skills, hooks, hatching
- **feature** [dosclaw] Plan Enforcement — Soft warning for plan limits instead of hard block
- **feature** [dashboard] Channel Selector — Telegram, Discord, WhatsApp (coming soon) for agent creation

## 2026-03-01

- **feature** [gateway] DOSafe Integration — Entity check, bulk check, URL check, text/image AI detection endpoints
- **feature** [gateway] Agent Management API — Full CRUD + lifecycle (start, stop, upgrade, restart)
- **feature** [gateway] Anonymous IP Quota — 20 checks/day for DOSafe public endpoints
- **improvement** [gateway] User Quota Persistence — Moved from in-memory to Supabase

## 2026-02-15

- **feature** [dashboard] Organization Management — Create and manage organizations
- **feature** [dashboard] API Key Management — Create, list, revoke keys with usage tracking
- **improvement** [dashboard] Dark Mode — Fixed flash on select dropdowns
- **fix** [dashboard] Token Refresh — Fixed billing precision issues

## 2026-02-01

- **feature** [dashboard] Supabase Auth Migration — OAuth, password login, logout, identity management
- **feature** [dashboard] Avatar Upload — Profile photo upload with organization support
- **feature** [dashboard] Billing System — Credit-based billing with Stripe integration
- **improvement** [dashboard] Server-side OAuth — Redirect to avoid /login flash
