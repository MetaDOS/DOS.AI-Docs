# Available Models

DOS AI serves high-quality open-source LLMs via an OpenAI-compatible API. Self-hosted models run on dedicated RTX Pro 6000 GPUs with 96 GB VRAM in Asia-Southeast 1. Cloud models are served via partner providers for maximum coverage.

## Smart Routing

Use `dos-auto` as the model ID to let DOS AI automatically select the best model for each request. Smart routing uses a 15-dimension classifier to analyze your prompt and route to the optimal model based on task complexity, cost, and latency.

```python
response = client.chat.completions.create(
    model="dos-auto",  # Smart routing picks the best model
    messages=[{"role": "user", "content": "..."}],
)
```

## Model Catalog

### Self-Hosted (Lowest Latency)

| Model | Provider | Context | Input | Output | Model ID |
| ----- | -------- | ------- | ----- | ------ | -------- |
| **Qwen3.5-35B-A3B** | Alibaba | 128K | $0.15 / 1M | $0.15 / 1M | `dos-ai` |

### Cloud Models

| Model | Provider | Context | Input | Output | Model ID |
| ----- | -------- | ------- | ----- | ------ | -------- |
| **Llama 4 Maverick 17B-128E** | Meta / DeepInfra | 1M | $0.17 / 1M | $0.66 / 1M | `llama-4-maverick` |
| **Llama 4 Scout 17B-16E** | Meta / DeepInfra | 640K | $0.11 / 1M | $0.38 / 1M | `llama-4-scout` |
| **DeepSeek V3** | DeepSeek | 128K | $0.25 / 1M | $0.25 / 1M | `deepseek-v3` |
| **Llama 3.3 70B** | Meta | 128K | $0.20 / 1M | $0.20 / 1M | `llama-3.3-70b` |
| **Llama 3.1 8B** | Meta | 128K | $0.05 / 1M | $0.05 / 1M | `llama-3.1-8b` |

> All prices are in USD. The catalog is DB-driven -- new models are added regularly. Check `GET /v1/catalog` or the [dashboard](https://app.dos.ai/models) for the latest list. See [Pricing](pricing.md) for billing details.

### Embedding Models

| Model | Provider | Dimensions | Model ID |
| ----- | -------- | ---------- | -------- |
| **Qwen3-Embedding-4B AWQ** | Alibaba / Self-hosted | 2560 | `qwen3-embedding-4b` |

## Model Details

### Qwen3.5-35B-A3B (default)

Alibaba's Mixture-of-Experts model with 35 billion total parameters and 3 billion active parameters per forward pass. This architecture delivers excellent quality at remarkably low cost and latency, making it our **recommended default model** for most use cases.

- **Best for**: General-purpose chat, code generation, reasoning, multilingual tasks
- **Strengths**: Outstanding cost-efficiency, fast response times, strong multilingual support (especially CJK languages)
- **Model ID**: `dos-ai`

### Llama 4 Maverick 17B-128E

Meta's latest Mixture-of-Experts model with 17 billion active parameters and 128 experts. Strong reasoning and multilingual capabilities with an industry-leading 1 million token context window.

- **Best for**: Complex reasoning, long-context analysis, multilingual tasks
- **Strengths**: Massive context window, strong benchmark scores, efficient MoE architecture
- **Model ID**: `llama-4-maverick`

### Llama 4 Scout 17B-16E

Meta's efficient MoE model with 17 billion active parameters and 16 experts. Fast and cost-effective for everyday tasks with a 640K context window.

- **Best for**: Everyday tasks, fast responses, cost-sensitive workloads
- **Strengths**: Good balance of speed and quality, large context window
- **Model ID**: `llama-4-scout`

### DeepSeek V3

DeepSeek's latest Mixture-of-Experts model, known for strong performance across coding, math, and reasoning benchmarks.

- **Best for**: Code generation, mathematical reasoning, structured output
- **Strengths**: Competitive benchmark scores, good at structured/JSON output, strong code capabilities
- **Model ID**: `deepseek-v3`

### Llama 3.3 70B

Meta's 70-billion-parameter dense model. Offers top-tier reasoning and instruction-following capabilities.

- **Best for**: Complex reasoning, long-form content, detailed analysis
- **Strengths**: Strong English performance, excellent instruction following, robust safety tuning
- **Model ID**: `llama-3.3-70b`

### Llama 3.1 8B

Meta's efficient 8-billion-parameter model. An excellent choice when you need fast, affordable responses and the task does not require the full capability of a larger model.

- **Best for**: Simple tasks, high-throughput workloads, prototyping, cost-sensitive applications
- **Strengths**: Very low latency, lowest cost, suitable for classification and extraction tasks
- **Model ID**: `llama-3.1-8b`

## Choosing the Right Model

| Use Case | Recommended Model | Why |
| -------- | ----------------- | --- |
| Let DOS AI decide | `dos-auto` | Smart routing picks the best model per request |
| General assistant / chatbot | Qwen3.5-35B-A3B | Best balance of quality, speed, and cost |
| Long-context analysis (100K+ tokens) | Llama 4 Maverick | 1M context window, strong reasoning |
| Complex reasoning / analysis | Llama 3.3 70B | Dense model, top reasoning capability |
| Code generation / math | DeepSeek V3 | Top coding and math benchmark scores |
| High-volume / low-cost tasks | Llama 3.1 8B | Fastest and cheapest option |
| Multilingual (CJK languages) | Qwen3.5-35B-A3B | Superior CJK language performance |

## Listing Models via API

You can retrieve the current list of available models programmatically:

```bash
curl https://api.dos.ai/v1/models \
  -H "Authorization: Bearer YOUR_API_KEY"
```

For the full retail catalog with pricing and metadata:

```bash
curl https://api.dos.ai/v1/catalog \
  -H "Authorization: Bearer YOUR_API_KEY"
```

See the [Models API reference](../api-reference/models.md) for the full response schema.
