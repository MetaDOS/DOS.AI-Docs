# Changelog

All notable changes to the DOS.AI platform are documented here.
This file is the source of truth — synced to `dosai.changelog` on deploy.

Format: `- **type** [product] Title — Description`
Types: `feature`, `fix`, `improvement`, `breaking`
Products: `dosclaw`, `dashboard`, `gateway`, `dosafe`, `inference`

---

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
