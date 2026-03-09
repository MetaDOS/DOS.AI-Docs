# DOSafe API

> **Base URL:** `https://app.dosafe.io/api/v1`
>
> **Auth:** All endpoints require `X-Api-Key` header. Contact DOSafe team to get a key.

---

## Overview

The DOSafe API is the unified safety gateway for the DOS ecosystem. It aggregates threat intelligence from multiple independent sources and returns a weighted risk verdict for any entity.

### Data Sources

| Source | Weight | Description |
|--------|--------|-------------|
| DOSafe DB | Highest | 1.2M+ entries from 11 scrapers (phishing, scam, malware, wallets) |
| DOS Chain | High | Immutable on-chain attestations via EAS |
| DOS.Me Identity | Moderate | Member trust score, verified providers, flagged status |

**Architecture:** DOSafe is the safety engine and public gateway. DOS.Me is an identity data provider — partners call DOSafe, not DOS.Me.

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

### Scopes

| Scope | Endpoints |
|-------|-----------|
| `check` | `POST /check` |
| `bulk` | `POST /check/bulk` |
| `report` | `POST /report` |

Contact DOSafe team to provision a key with required scopes.

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

## Endpoints

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
const res = await fetch('https://app.dosafe.io/api/v1/check', {
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

Batch entity check. Max 50 entities per request. Results are returned in the same order as input.

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
| `POST api.dos.me/trust/check` | `POST app.dosafe.io/api/v1/check/bulk` |
| `GET api.dos.me/trust/member` | Included in `/v1/check` response as `member` field |
| `POST api.dos.me/trust/flags` | `POST app.dosafe.io/api/v1/report` |

The DOS.Me Trust API endpoints are deprecated and will be removed on **2026-11-01**.

---

## Getting API Keys

Contact the DOSafe team with:
1. Your product name
2. Required scopes (`check`, `bulk`, `report`)
3. Expected daily volume
