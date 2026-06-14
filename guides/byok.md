# Bring Your Own Key (BYOK)

BYOK lets you use your **own** upstream provider API keys through DOS AI. When you add a provider key, any request that DOS AI routes to that provider is authenticated with your key and billed to **your account with that provider** - DOS AI does not deduct credits for it. You keep DOS AI's unified OpenAI-compatible API, routing, and usage tracking while paying the provider directly.

## How it works

1. Add your provider API key in the [dashboard](https://app.dos.ai).
2. When a request is routed to a model served by that provider, DOS AI uses your key for the upstream call.
3. DOS AI charges **$0 credits** for that request. The response includes the header `X-BYOK: true` so you can confirm your key was used.

You still authenticate to DOS AI with your `dos_sk_*` key as usual. BYOK only changes which key is used for the upstream provider call, and how the request is billed.

## Supported providers

| Provider | Identifier |
| -------- | ---------- |
| OpenAI | `openai` |
| Anthropic | `anthropic` |
| Google (Gemini) | `google` |
| Mistral | `mistral` |
| xAI (Grok) | `xai` |
| DeepInfra | `deepinfra` |

You can store one key per provider (per account, or per project if you use projects).

## Security

- Keys are encrypted at rest with AES-256-GCM.
- The dashboard only ever shows a masked hint (the last 4 characters); the full key is never returned after you save it.
- Removing a key in the dashboard takes effect immediately - requests to that provider revert to DOS AI credit billing.

## Notes

- BYOK applies to chat/completions that are routed to a **supported external provider**.
- It does **not** apply to self-hosted models (such as `dos-ai`) or to [embeddings](../api-reference/embeddings.md) - those are served on DOS AI's own infrastructure and billed as usual.
