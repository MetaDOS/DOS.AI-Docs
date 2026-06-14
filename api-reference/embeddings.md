# Embeddings

Generate vector embeddings for text. The API is compatible with the OpenAI Embeddings format, so you can use existing OpenAI SDKs by changing the base URL.

Embeddings are dense vector representations of text, useful for semantic search, clustering, retrieval-augmented generation (RAG), classification, and similarity comparison.

## Endpoint

```
POST https://api.dos.ai/v1/embeddings
```

## Authentication

Include your API key in the `Authorization` header using the Bearer scheme:

```
Authorization: Bearer dos_sk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

API keys can be created and managed from the [dashboard](https://app.dos.ai).

## Request Headers

| Header | Required | Description |
| ------ | -------- | ----------- |
| `Authorization` | Yes | `Bearer YOUR_API_KEY` |
| `Content-Type` | Yes | `application/json` |

## Request Body

| Parameter | Type | Required | Default | Description |
| --------- | ---- | -------- | ------- | ----------- |
| `model` | string | Yes | - | The embedding model ID. Use `qwen3-embedding-4b`. |
| `input` | string or array | Yes | - | The text to embed. Pass a single string, or an array of strings to embed many at once (batch). |
| `encoding_format` | string | No | `float` | Format of the returned vectors: `float` (array of numbers) or `base64`. |

## Response Body

```json
{
  "object": "list",
  "data": [
    {
      "object": "embedding",
      "index": 0,
      "embedding": [0.0123, -0.0456, 0.0789]
    }
  ],
  "model": "qwen3-embedding-4b",
  "usage": {
    "prompt_tokens": 8,
    "total_tokens": 8
  }
}
```

### Response Fields

| Field | Type | Description |
| ----- | ---- | ----------- |
| `object` | string | Always `"list"`. |
| `data` | array | One embedding object per input. Order matches the `input` array. |
| `data[].index` | integer | Position of this embedding in the input list. |
| `data[].embedding` | array | The embedding vector (2560 dimensions for `qwen3-embedding-4b`). |
| `model` | string | The embedding model used. |
| `usage.prompt_tokens` | integer | Number of input tokens embedded. |
| `usage.total_tokens` | integer | Total tokens billed. |

## Model

| Model | Dimensions | Model ID |
| ----- | ---------- | -------- |
| **Qwen3-Embedding-4B** | 2560 | `qwen3-embedding-4b` |

Served in FP16 on dedicated GPUs in Asia-Southeast, with an automatic cloud fallback for high availability. Embeddings are not affected by smart routing (`dos-auto`) or [BYOK](../guides/byok.md) - they are always served on DOS AI infrastructure.

## Examples

### cURL

```bash
curl https://api.dos.ai/v1/embeddings \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer dos_sk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" \
  -d '{
    "model": "qwen3-embedding-4b",
    "input": "The quick brown fox jumps over the lazy dog."
  }'
```

### Batch (multiple inputs)

```bash
curl https://api.dos.ai/v1/embeddings \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer dos_sk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" \
  -d '{
    "model": "qwen3-embedding-4b",
    "input": ["first document", "second document", "third document"]
  }'
```

### Using the OpenAI Python SDK

```python
from openai import OpenAI

client = OpenAI(
    api_key="dos_sk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    base_url="https://api.dos.ai/v1"
)

resp = client.embeddings.create(
    model="qwen3-embedding-4b",
    input="The quick brown fox jumps over the lazy dog."
)

vector = resp.data[0].embedding   # 2560-dim list of floats
print(len(vector))
```

### Using the OpenAI Node.js SDK

```javascript
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: "dos_sk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  baseURL: "https://api.dos.ai/v1",
});

const resp = await client.embeddings.create({
  model: "qwen3-embedding-4b",
  input: "The quick brown fox jumps over the lazy dog.",
});

console.log(resp.data[0].embedding.length); // 2560
```

## Error Responses

| Status Code | Error | Description |
| ----------- | ----- | ----------- |
| 400 | Bad Request | Invalid request parameters (e.g. missing `input`). |
| 401 | Unauthorized | Invalid or missing API key. |
| 402 | Payment Required | Insufficient credits. |
| 429 | Too Many Requests | Rate limit exceeded. See [Rate Limits](../support/rate-limits.md). |
| 503 | Service Unavailable | Embedding backend temporarily unavailable. |

See [Error Codes](../support/error-codes.md) for detailed troubleshooting.
