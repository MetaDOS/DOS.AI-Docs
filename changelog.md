# Changelog

All notable changes to the DOS.AI platform are documented here.
This file is the source of truth — synced to `dosai.changelog` on deploy.

Format: `- **type** [product] Title — Description`
Types: `feature`, `fix`, `improvement`, `breaking`
Products: `dosclaw`, `dashboard`, `gateway`, `dosafe`, `inference`

---

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
