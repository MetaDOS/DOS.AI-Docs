# DOSafe API

> **Base URL:** `https://app.dosafe.io/api`
>
> **Auth:** All endpoints require `X-Api-Key` header. One key covers all DOSafe services.

---

## Overview

The DOSafe API is the unified safety gateway for the DOS ecosystem. A single API key grants access to all DOSafe services — entity/URL safety checks, AI text/image/video/audio detection, face and voice verification, and community reporting — with scopes controlling which capabilities are available.

### Data Sources (Safety Check)

| Source | Weight | Description |
|--------|--------|-------------|
| DOSafe DB | Highest | 3.93M+ entries from 19 scrapers (phishing, scam, malware, wallets) |
| DOS Chain | High | Immutable on-chain attestations via EAS |
| DOS.Me Identity | Moderate | Member trust score, verified providers, flagged status |
| Web Analysis | Moderate | Real-time web search + LLM-powered risk analysis |

**Architecture:** DOSafe is the safety engine and public gateway. DOS.Me is an identity data provider — external services call DOSafe, not DOS.Me.

### Risk Score → Level

| Score | Level |
|-------|-------|
| 0–19 | `safe` |
| 20–49 | `low` |
| 50–74 | `medium` |
| 75–89 | `high` |
| 90–100 | `critical` |

Scores are computed by weighted aggregation of signals — no single source determines the verdict alone.

---

## Authentication

```
X-Api-Key: dsk_xxxx...
```

Keys are stored as SHA-256 hashes in `dosafe.api_keys`. Plaintext is never persisted after provisioning.

### Scopes

| Scope | Endpoints |
|-------|-----------|
| `check` | `POST /check` |
| `bulk` | `POST /check/bulk` |
| `report` | `POST /report` |
| `detect` | `POST /detect`, `POST /detect-image`, `POST /detect-video`, `POST /detect-audio` |
| `url-check` | `POST /url-check` |
| `entity-check` | `POST /entity-check` |
| `face` | `POST /face/enroll`, `POST /face/verify` |
| `voice` | `POST /voice/enroll`, `POST /voice/verify` |

A key can have multiple scopes. Contact the DOSafe team to provision a key with required scopes.

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

**Example — Bexly: check wallet before transaction:**
```typescript
const res = await fetch('https://app.dosafe.io/api/check', {
  method: 'POST',
  headers: {
    'X-Api-Key': process.env.DOSAFE_API_KEY,
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
| `riskScore` | ✓ | Integer 0–100 |
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

---

### `POST /detect-audio`

**Scope:** `detect`

AI audio/voice detection. BEATs + mHuBERT ensemble for detecting AI-generated speech and voice clones.

**Request:** `multipart/form-data` with `audio` field (WAV/MP3/OGG/FLAC, max 50MB), or JSON `{ "url": "..." }`.

**Response:**
```json
{
  "aiProbability": 91,
  "verdict": "AI",
  "confidence": "high",
  "signals": {
    "beats": 0.93,
    "mhubert": 0.89,
    "ensemble": 0.91
  },
  "hasSpeech": true,
  "duration": 8.5
}
```

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
| `onchain_medium_risk` | On-chain risk score 50–79 | +35 |
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
| `401 Unauthorized` | Missing or invalid `X-Api-Key` |
| `403 Forbidden` | Key valid but lacks required scope |
| `400 Bad Request` | Validation error |
| `500 Internal Server Error` | Lookup failed |

---

## Migration from DOS.Me Trust API

If you were previously using `api.dos.me/trust/check`, migrate to DOSafe:

| Old | New |
|-----|-----|
| `POST api.dos.me/trust/check` | `POST app.dosafe.io/api/check/bulk` |
| `GET api.dos.me/trust/member` | Included in `/check` response as `member` field |
| `POST api.dos.me/trust/flags` | `POST app.dosafe.io/api/report` |

The DOS.Me Trust API endpoints are deprecated and will be removed on **2026-11-01**.

---

## Getting API Keys

Contact the DOSafe team with:
1. Your product name
2. Required scopes (`check`, `bulk`, `report`, `detect`, `url-check`, `entity-check`)
3. Expected daily volume
