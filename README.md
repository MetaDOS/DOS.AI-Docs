# DOS AI

**Fast, affordable AI inference and agent platform for open-source models.**

DOS AI is an inference platform that lets you run leading open-source language models through a simple, OpenAI-compatible API. Deploy AI agents with DOSClaw, protect your users with DOSafe, and route intelligently with smart model selection -- all from a single platform.

## Why DOS AI?

- **OpenAI-compatible** -- Swap your base URL and you're done. Works with the OpenAI Python SDK, Node.js SDK, LangChain, LlamaIndex, and any HTTP client.
- **Smart routing** -- Use `dos-auto` to let our 15-dimension classifier pick the best model for each request automatically.
- **Low latency** -- Models served on dedicated GPUs with optimized inference (vLLM). No cold starts, no queues.
- **Pay-as-you-go** -- Only pay for the tokens you use. Every new account gets **$5 in free credits** to get started.
- **Open-source models** -- Access the best open-source models without managing your own infrastructure.

## Quick start

Get up and running in under a minute:

```python
from openai import OpenAI

client = OpenAI(
    base_url="https://api.dos.ai/v1",
    api_key="dos_sk_...",  # Get your key at app.dos.ai
)

response = client.chat.completions.create(
    model="dos-auto",  # Smart routing picks the best model
    messages=[
        {"role": "user", "content": "Explain quantum computing in one paragraph."}
    ],
)

print(response.choices[0].message.content)
```

## Platform

### LLM Inference API

OpenAI-compatible API with smart routing, streaming, function calling, and structured outputs.

| Section | Description |
| --- | --- |
| [Quickstart](getting-started/quickstart.md) | Create an account, get an API key, and make your first request |
| [Authentication](getting-started/authentication.md) | API key management, rate limits, and security best practices |
| [Available Models](models/available-models.md) | Full model catalog with pricing |
| [OpenAI Compatibility](getting-started/openai-compatibility.md) | Migration guide and compatibility details |

### DOSClaw Agents

Deploy AI agents powered by [OpenClaw](https://github.com/nicejoy/openclaw) with Telegram, Discord, and WhatsApp integration. Each agent runs in its own container with web search, memory, video/music generation, and 5,000+ installable skills.

- Create agents from the [dashboard](https://app.dos.ai/agents)
- Choose from templates: Personal Assistant, Sales, Customer Support, Content Creator
- Credit-based pricing with a free trial

### DOSafe

Safety and threat intelligence engine with AI detection capabilities.

| Feature | Description |
| --- | --- |
| [Entity/URL Check](dosafe/overview.md) | Risk assessment against 3.93M+ threat intelligence entries |
| [AI Text Detection](dosafe/partner-api.md) | Detect AI-generated text |
| [AI Image Detection](dosafe/partner-api.md) | Detect AI-generated or manipulated images |
| [AI Video Detection](dosafe/partner-api.md) | 7-layer pipeline for AI video detection |
| [AI Audio Detection](dosafe/partner-api.md) | Detect AI-generated speech and voice clones |
| [Face/Voice Verification](dosafe/partner-api.md) | Liveness detection and biometric matching |

## Available models

| Model ID | Base model | Context | Pricing |
| --- | --- | --- | --- |
| `dos-auto` | Smart routing (auto-select) | varies | varies |
| `dos-ai` | Qwen3.5-35B-A3B | 128K | $0.15 / 1M tokens |
| `llama-4-maverick` | Llama 4 Maverick 17B-128E | 1M | $0.17 / 1M input |
| `llama-4-scout` | Llama 4 Scout 17B-16E | 640K | $0.11 / 1M input |
| `deepseek-v3` | DeepSeek V3 | 128K | $0.25 / 1M tokens |
| `llama-3.3-70b` | Llama 3.3 70B | 128K | $0.20 / 1M tokens |
| `llama-3.1-8b` | Llama 3.1 8B | 128K | $0.05 / 1M tokens |

More models are added regularly. Check the [catalog endpoint](https://api.dos.ai/v1/catalog) or the [dashboard](https://app.dos.ai/models) for the latest list.

## Links

- **Dashboard**: [app.dos.ai](https://app.dos.ai)
- **API base URL**: `https://api.dos.ai/v1`
- **DOSafe**: [dosafe.io](https://dosafe.io)
- **Status**: [status.dos.ai](https://status.dos.ai)
- **Community**: [Telegram](https://t.me/dosai_community) | [Discord](https://discord.gg/dosai)
