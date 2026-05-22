# DOSafe API

> **Base URL:** `https://api.dos.ai/v1/dosafe`
>
> **Auth:** `Authorization: Bearer dos_sk_...` - a single dos.ai platform key (create one at [app.dos.ai/api-keys](https://app.dos.ai/api-keys)) covers all DOSafe services.

---

## Overview

The DOSafe API is the unified safety gateway for the DOS ecosystem. A single dos.ai platform key grants access to all DOSafe services - entity/URL safety checks, AI text/image/video detection, face and voice verification, and community reporting.

### Data Sources (Safety Check)

| Source | Weight | Description |
|--------|--------|-------------|
| DOSafe DB | Highest | 3.93M+ entries from 19 scrapers (phishing, scam, malware, wallets) |
| DOS Chain | High | Immutable on-chain attestations via EAS |
| DOS.Me Identity | Moderate | Member trust score, verified providers, flagged status |
| Web Analysis | Moderate | Real-time web search + LLM-powered risk analysis |

**Architecture:** DOSafe is the safety engine and public gateway. DOS.Me is an identity data provider - external services call DOSafe, not DOS.Me.

### Risk Score → Level

| Score | Level |
|-------|-------|
| 0-19 | `safe` |
| 20-49 | `low` |
| 50-74 | `medium` |
| 75-89 | `high` |
| 90-100 | `critical` |

Scores are computed by weighted aggregation of signals - no single source determines the verdict alone.

---

## Authentication

```
Authorization: Bearer dos_sk_xxxx...
```

Use a dos.ai platform key, created self-serve at [app.dos.ai/api-keys](https://app.dos.ai/api-keys). The same key works across the whole dos.ai platform (LLM inference, embeddings) and every DOSafe route - no separate provisioning step. Keys are stored as SHA-256 hashes; plaintext is shown once at creation and never persisted.

> **Migrating from `dsk_` partner keys?** The legacy `X-Api-Key: dsk_...` scheme (DOSafe-only partner keys) is being phased out in favour of the unified `dos_sk_` Bearer key. Existing `dsk_` keys keep working during the transition; new integrations should use `dos_sk_`.

A `dos_sk_` key has full access to every DOSafe route. There is no per-scope provisioning - issue a key and call any endpoint below.

---

## Entity Types

| Type | Example |
|------|---------|
| `wallet` | `0xdeadbeef...` |
| `domain` | `evil.com` |
| `url` | `https://evil.com/phish` |
| `email` | `scammer@evil.com` |
| `phone` | `+84901234567` |
| `bank_account` | `VCB:1234567890` |
| `telegram` / `telegram_user` / `telegram_group` / `telegram_bot` | `scammerbot` |
| `facebook` / `facebook_profile` / `facebook_page` | `fakeshop.vn` |
| `national_id` | `079123456789` |
| `organization` | Company name |

---

## Safety Check API

Structured developer API. Cleaner response format optimized for machine consumption.

### `POST /check`

**Scope:** `check`

Single entity safety check. Runs DB lookup + on-chain query + DOS.Me identity in parallel.

**Request:**
```json
{
  "entityType": "wallet",
  "entityId": "0xdeadbeef..."
}
```

**Response:**
```json
{
  "entityType": "wallet",
  "entityId": "0xdeadbeef...",
  "riskScore": 85,
  "riskLevel": "critical",
  "flagged": true,
  "signals": ["db_flagged_phishing", "onchain_high_risk"],
  "categories": ["phishing"],
  "sources": ["phishing_database", "scamsniffer"],
  "clusterLinked": true,
  "member": {
    "found": false
  },
  "onChain": {
    "attestationCount": 2,
    "latestRiskScore": 88
  },
  "checkedAt": "2026-03-09T10:00:00.000Z"
}
```

**Example - Bexly: check wallet before transaction:**
```typescript
const res = await fetch('https://api.dos.ai/v1/dosafe/check', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${process.env.DOS_API_KEY}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ entityType: 'wallet', entityId: recipientAddress }),
})

const result = await res.json()

if (result.flagged && result.riskLevel === 'critical') {
  throw new Error(`Recipient flagged as ${result.categories.join(', ')}`)
}
```

---

### `POST /check/bulk`

**Scope:** `bulk`

Batch entity check. Max 50 entities per request. Results are returned in the same order as input. Individual errors do not fail the whole batch.

**Request:**
```json
{
  "entities": [
    { "entityType": "wallet", "entityId": "0xdeadbeef..." },
    { "entityType": "domain", "entityId": "evil.com" },
    { "entityType": "phone", "entityId": "+84901234567" }
  ]
}
```

**Response:**
```json
{
  "results": [
    {
      "entityType": "wallet",
      "entityId": "0xdeadbeef...",
      "riskScore": 85,
      "riskLevel": "critical",
      "flagged": true,
      "categories": ["phishing"],
      "signals": ["db_flagged_phishing"]
    },
    {
      "entityType": "domain",
      "entityId": "evil.com",
      "riskScore": 20,
      "riskLevel": "low",
      "flagged": false,
      "categories": [],
      "signals": []
    }
  ],
  "checkedAt": "2026-03-09T10:00:00.000Z"
}
```

---

### `POST /report`

**Scope:** `report`

Submit a safety report for an entity. Reports are staged in `raw_imports` for review. High-confidence reports (`riskScore >= 70`) are promoted to threat intel within 24h.

**Request:**
```json
{
  "entityType": "wallet",
  "entityId": "0xdeadbeef...",
  "category": "scam",
  "riskScore": 75,
  "description": "User reported as pig butchering scam"
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `entityType` | ✓ | See entity types table |
| `entityId` | ✓ | Raw value |
| `category` | ✓ | `phishing`, `scam`, `malware`, `fraud`, `spam`, `impersonation`, `other` |
| `riskScore` | ✓ | Integer 0-100 |
| `description` | ✗ | Human-readable context |

**Response (201):**
```json
{
  "reportId": "uuid-here",
  "status": "pending",
  "message": "Report received. High-confidence reports (risk_score >= 70) are reviewed and promoted within 24h."
}
```

---

## AI Detection API

### `POST /detect`

**Scope:** `detect`

AI text detection. Returns probability that the input was AI-generated.

**Request:**
```json
{
  "text": "The quick brown fox..."
}
```

**Response:**
```json
{
  "aiProbability": 87,
  "verdict": "AI",
  "confidence": "high",
  "signals": {
    "perplexity": 42.1,
    "burstiness": 0.12,
    "binoculars": 0.93,
    "rubricScore": 81
  }
}
```

---

### `POST /detect-image`

**Scope:** `detect`

AI image detection. Combines C2PA, EXIF/DCT metadata, reverse image search, and LLM visual analysis.

**Request:** `multipart/form-data` with `image` field (JPEG/PNG/WEBP/GIF, ≤10MB), or JSON `{ "url": "..." }`.

**Response:**
```json
{
  "aiProbability": 92,
  "verdict": "AI",
  "confidence": "high",
  "signals": {
    "c2pa": "ai_generated",
    "exif": "no_camera_metadata",
    "reverseSearch": "not_found"
  }
}
```

---

### `POST /detect-video`

**Scope:** `detect`

AI video detection. Uses a 7-layer pipeline: frame-level AI detection, temporal consistency analysis, audio-visual synchronization, and LLM visual reasoning.

**Request:** `multipart/form-data` with `video` field (MP4/MOV/WEBM, max 100MB), or JSON `{ "url": "..." }`.

**Response:**
```json
{
  "aiProbability": 78,
  "verdict": "AI",
  "confidence": "medium",
  "signals": {
    "frameAnalysis": 0.82,
    "temporalConsistency": 0.71,
    "audioSync": 0.65,
    "llmVisual": 0.85
  },
  "framesAnalyzed": 24,
  "duration": 15.2
}
```

> **Audio / voice-clone detection** is served by the Call ID voice anti-spoof analyzer under the `/voice` group (`POST /voice/analyze`), powered by the MamBo-3 (XLSR-MamBo Hydra-N3) model, not a standalone `/detect-audio` endpoint. See the Voice Verification section.

---

### `POST /url-check`

**Scope:** `url-check`

URL/domain safety check. DB lookup + runtime checks (Google Safe Browsing, WHOIS, on-chain).

**Request:**
```json
{ "url": "https://evil.com/phish" }
```

**Response:**
```json
{
  "url": "https://evil.com/phish",
  "domain": "evil.com",
  "riskLevel": "critical",
  "riskScore": 95,
  "signals": ["db_flagged_phishing", "domain_new_7d"],
  "sources": ["phishing_database"]
}
```

---

### `POST /entity-check`

**Scope:** `entity-check`

Full entity risk check with raw DB entries and member data. Used internally by DOSafe clients (Telegram, mobile, extension).

**Request:**
```json
{ "entityType": "phone", "entityId": "+84901234567" }
```

**Response:**
```json
{
  "riskLevel": "high",
  "riskScore": 78,
  "riskSignals": ["db_flagged_scam", "db_source_checkscam_vn"],
  "threatIntel": { "entries": [...] },
  "onChain": { "attestationCount": 1, "latestRiskScore": 80 },
  "trustedMember": { "found": true, "member": { "trustScore": 45, "isFlagged": false, "passingThreshold": false } }
}
```

---

## Signal Reference

Signals are the raw evidence contributing to a risk score. Returned in `signals[]` for transparency.

### Threat DB Signals
| Signal | Description | Weight |
|--------|-------------|--------|
| `db_flagged_phishing` | In DOSafe DB as phishing | +90 |
| `db_flagged_malware` | In DOSafe DB as malware | +85 |
| `db_flagged_scam` | In DOSafe DB as scam | +75 |
| `db_verified_legitimate` | Verified legitimate in DOSafe DB | −45 |
| `cluster_linked` | Linked to a known scammer cluster | +15 |
| `db_source_*` | Which scraper source flagged it (informational, no weight) | 0 |

### On-Chain Signals
| Signal | Description | Weight |
|--------|-------------|--------|
| `onchain_flagged_phishing` | On-chain attestation: phishing | +85 |
| `onchain_flagged_scam` | On-chain attestation: scam | +70 |
| `onchain_high_risk` | On-chain risk score ≥ 80 | +60 |
| `onchain_medium_risk` | On-chain risk score 50-79 | +35 |
| `onchain_verified_legitimate` | On-chain: verified legitimate | −40 |
| `onchain_trusted` | On-chain risk score < 20 | −30 |

### DOS.Me Identity Signals
| Signal | Description | Weight |
|--------|-------------|--------|
| `dosme_member_flagged` | Flagged on DOS.Me | +40 |
| `dosme_trust_passing` | Meets DOS.Me trust threshold | −20 |
| `dosme_high_trust` | Trust score ≥ 70 | −15 |
| `dosme_multi_verified` | 3+ verified identity providers | −10 |
| `dosme_medium_trust` | Trust score ≥ 40 | −5 |
| `dosme_has_dosid` | Has custom DOS.me username | −5 |

---

## Error Responses

| Status | Reason |
|--------|--------|
| `400 Bad Request` | Validation error |
| `401 Unauthorized` | Missing, invalid, or revoked API key |
| `402 Payment Required` | Free tier exhausted and credit balance empty - top up at app.dos.ai/billing |
| `403 Forbidden` | Key lacks the required scope (applies to legacy `dsk_` keys only; `dos_sk_` keys have full access) |
| `429 Too Many Requests` | Daily free-tier limit reached and overage billing temporarily unavailable - retry shortly |
| `500 Internal Server Error` | Lookup failed |

---

## Migration from DOS.Me Trust API

If you were previously using `api.dos.me/trust/check`, migrate to DOSafe:

| Old | New |
|-----|-----|
| `POST api.dos.me/trust/check` | `POST api.dos.ai/v1/dosafe/check/bulk` |
| `GET api.dos.me/trust/member` | Included in `/check` response as `member` field |
| `POST api.dos.me/trust/flags` | `POST api.dos.ai/v1/dosafe/report` |

The DOS.Me Trust API endpoints are deprecated and will be removed on **2026-11-01**.

---

## Pricing & Quota

- **Free tier:** 100 calls/day per key.
- **Over the free tier:** calls are billed per-call from your dos.ai credit balance (no hard cutoff once you have credits):

  | Group | Endpoints | Price / call |
  |-------|-----------|--------------|
  | Lookup & Threat Intel | `/check`, `/check/bulk`, `/url-check`, `/entity-check`, `/report`, `/webhooks` | $0.0010 |
  | AI Detection | `/detect`, `/detect-image`, `/detect-video`, `/detect-plagiarism`, `/detect-doc-forgery` | $0.0018 |
  | Biometric eKYC | `/voice/*`, `/face/*`, `/identity/*` | $0.0090 |

- Top up and manage your balance at [app.dos.ai/billing](https://app.dos.ai/billing). Larger top-ups get up to 30% more credit.
- Full pricing: [dos.ai/pricing](https://dos.ai/pricing).

When the free tier is exhausted and the balance is empty, calls return `402 Payment Required`.

---

## Getting API Keys

Create a key self-serve at [app.dos.ai/api-keys](https://app.dos.ai/api-keys) - it works immediately across every DOSafe route (and the rest of the dos.ai platform). No scope selection or manual provisioning. For dedicated quota, on-prem eKYC deployment, or enterprise contracts, [contact sales](https://dos.ai/pricing).
