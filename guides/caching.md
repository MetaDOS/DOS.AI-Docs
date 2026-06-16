# Response Caching

DOS AI caches non-streaming responses so that an identical request can be served instantly from memory, with **no upstream model call and no token charge**. Caching is **on by default for deterministic requests** (`temperature: 0`) and is fully under your control with a single header.

## How it works

For an eligible request, DOS AI builds an exact-match key from the endpoint and the request body. If an unexpired response with the same key exists, it is returned immediately:

- The response is **free** - no tokens are billed.
- It returns in sub-millisecond time, with no model call.
- The response carries `X-DOS-Cache: hit` and `X-Provider: cache`.

If there is no match, the request runs normally, the response is returned with `X-DOS-Cache: miss`, and it is stored for next time. Cached entries live for up to **24 hours**.

## When a request is cached

| `X-DOS-Cache` request header | Behavior |
| ---------------------------- | -------- |
| *(omitted)* | Cached only when the request is **deterministic** (`temperature: 0`). This is the default. |
| `on` | Force caching on, even for `temperature > 0`. Use this when you are happy to receive a stored response for repeated identical requests. |
| `off` | Disable caching for this request - always call the model. |

Only **non-streaming** [Chat Completions](chat-completions.md) / Completions are cached. Streaming responses (`stream: true`) are never cached.

## What counts as "the same request"

The cache key is a hash of the endpoint path plus the request body in canonical form. Two requests hit the same entry when their JSON bodies are identical after:

- sorting object keys (field order does not matter), and
- ignoring the non-output fields `stream`, `stream_options`, `user`, and `metadata`.

Everything else - `model`, `messages`, `temperature`, `max_tokens`, `tools`, and so on - is part of the key, so any change produces a different entry.

The exact-match cache is **global but cross-user safe**: a hit requires a byte-identical request that the caller already has, and the response is a pure function of that public input, so nothing private is shared between accounts.

## Response headers

| Header | Meaning |
| ------ | ------- |
| `X-DOS-Cache: hit` | Served from cache - free, no model call. |
| `X-DOS-Cache: miss` | Not in cache (or first time) - served by the model. |
| `X-Provider: cache` | Present on a hit, in place of the usual provider name. |

## Examples

A deterministic request is cached automatically. Run this twice - the first call is a `miss`, the second is a `hit` (instant and free):

```bash
curl -i https://api.dos.ai/v1/chat/completions \
  -H "Authorization: Bearer dos_sk_your_key" \
  -H "Content-Type: application/json" \
  -d '{"model": "dos-ai", "temperature": 0, "messages": [{"role": "user", "content": "Capital of Vietnam?"}]}'
```

To cache a non-deterministic request (`temperature > 0`), opt in with the header:

```bash
curl -i https://api.dos.ai/v1/chat/completions \
  -H "Authorization: Bearer dos_sk_your_key" \
  -H "X-DOS-Cache: on" \
  -H "Content-Type: application/json" \
  -d '{"model": "dos-ai", "temperature": 0.7, "messages": [{"role": "user", "content": "Capital of Vietnam?"}]}'
```

To always bypass the cache, send `X-DOS-Cache: off`.

## Notes

- **Free hits.** A cache hit never consumes tokens or credits.
- **Disable per request** with `X-DOS-Cache: off` when you always need a fresh generation.
- **Today's cache is exact-match.** Semantic (similar-but-not-identical) caching and a shared cross-instance layer are planned follow-ups.
