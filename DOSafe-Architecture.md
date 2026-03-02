# DOSafe — AI Content Detection Architecture

**Updated:** 2026-03-02
**Status:** Phase 1–5 COMPLETE. Phase 5.5 (Paraphrase Shield + ESL De-bias) COMPLETE. Phase 6 (Audio/Video) + Phase 7 (On-Chain) TODO.
**Repo:** `DOSafe/apps/web/src/app/api/detect/` + `detect-image/`

---

## Overview

DOSafe AI Agent phát hiện nội dung do AI tạo (text + image). Hiện tại chỉ dùng **LLM-as-judge** (Tier 3). Doc này thiết kế multi-tier detection pipeline dựa trên research từ các papers và open source projects hàng đầu.

### Current State (DOSafe) — as of 2026-02-28

| | Text Detection | Image Detection |
|---|---|---|
| **Model** | Qwen3.5-35B-A3B-FP8 (scorer) + Qwen3-8B (observer) | Qwen3.5-35B-A3B-FP8 |
| **Method** | Tier 1 perplexity+burstiness + Tier 2 Binoculars + Tier 3 LLM rubric | Tier 0 C2PA + Tier 1 EXIF/reverse search + Tier 2 DCT + Tier 3 LLM visual |
| **Input** | 50-5000 chars | JPEG/PNG/WEBP/GIF, max 10MB |
| **Output** | ai_probability, verdict, confidence, signals, source_matches | ai_probability, verdict, confidence, signals, metadata.exif, c2pa, reverse_search |
| **Quota** | 10k words/month (anonymous), 50k (free), 500k (paid) | Same quota pool, image = 500 words flat |
| **API** | `POST /api/detect` | `POST /api/detect-image` |
| **Source matching** | ✅ Serper API (Google Search, verbatim phrase match) | ✅ Serper Google Lens (reverse image search) |
| **C2PA** | ❌ N/A (text) | ✅ `@contentauth/c2pa-node` v0.5.1 |

**Infra:**
- Scorer: `Qwen3.5-35B-A3B-FP8` on RTX Pro 6000 (97GB VRAM, 96% util) → `inference.dos.ai` (port 8000)
- Observer: `Qwen3-8B` (base) on RTX 5090 (32GB VRAM, **59% util** after tuning) → `inference-ref.dos.ai` (port 8001)
  - Config: `--max-model-len 4096 --gpu-memory-utilization 0.75 --kv-cache-dtype fp8`

**Resolved problems:**
1. ✅ **Text normalization** — Unicode NFKC implemented, homoglyph defense active
2. ✅ **Statistical analysis** — Tier 1 perplexity + burstiness running via vLLM logprobs
3. ✅ **Vietnamese optimization** — Vietnamese-specific rubric signals (M/N/O: particles, code-switching, informal markers)
4. ✅ **Confidence levels** — low/medium/high based on token count and signal agreement
5. ✅ **Improved rubric** — 19 criteria (A-S), statistical score grounding (35% stat + 65% rubric)
6. ✅ **Image detection** — separate `/api/detect-image` route with multimodal LLM
7. ✅ **Source matching** — verbatim internet search, trusted domain scoring, adjusts ai_probability
8. ✅ **Binoculars** — observer model (Qwen3-8B) on RTX 5090, tunnel `inference-ref.dos.ai` active, 60% weight in stat score
9. ✅ **Image EXIF analysis** — pure-JS EXIF parser, detects camera model, GPS, AI tool in metadata (definitive verdict)
10. ✅ **Image DCT/quantization** — JPEG quantization table analysis, camera-specific patterns vs AI generic quality settings
11. ✅ **C2PA / Content Credentials** — `@contentauth/c2pa-node` v0.5.1, cryptographic manifest parsing, AI/camera origin verdict, tamper detection banner in UI
12. ✅ **Reverse image search** — Serper Google Lens API, trusted domain scoring (−12/−20 ai_prob), "Found online" badges in UI
13. ✅ **Firebase dead code removed** — DOSafe uses Supabase Auth only (firebase.ts from DOS-AI fork was never active)
14. ✅ **Quota system** — Monthly word-based (10k/50k/500k words), Supabase-backed for auth users, in-memory per-IP for anonymous. Image = 500 words flat
15. ✅ **Observer VRAM tuning** — RTX 5090: 99% → **59% VRAM** (`--max-model-len 4096 --gpu-memory-utilization 0.75 --kv-cache-dtype fp8`)
16. ✅ **Paraphrase Shield** — Rubric criteria P (paraphrase markers: unnatural synonym substitutions preserving AI structure) + Q (bypasser artifacts: inconsistent vocabulary, mechanical word replacements from AI bypass tools like Undetectable AI, Phrasly, QuillBot). Defends against adversarial paraphrasing which degrades detection by up to 87.88% on undefended systems.
17. ✅ **ESL De-biasing** — Rubric criteria R (ESL markers: limited vocabulary, simple sentences, L1 interference = human signal, NOT AI) + S (formulaic academic: simple structured writing typical of non-native students). Critical for Vietnamese market — Stanford HAI research shows AI detectors misclassify 61.3% of ESL essays as AI-generated. Perplexity/burstiness methods are especially biased against ESL English text.

**Remaining problems:**
1. ❌ **Binoculars threshold calibration** — needs testing on Vietnamese + English corpus to tune τ
2. ❌ **Watermark detection** — SynthID Image (Google/Gemini) watermark not detectable (proprietary pixel-space)
3. ❌ **Audio/Video detection** — only text + image supported, no audio (voice cloning, TTS) or video (deepfake) pipeline
4. ❌ **Short text accuracy** — texts <200 chars still low confidence
5. ❌ **Mixed content** — sentence-level AI detection not implemented
6. ❌ **SERPER_API_KEY** — must be set in Vercel production for reverse image search + text source matching to work

---

## Research Summary

### Academic Landscape

Có 3 paradigm chính cho AI text detection:

```
┌────────────────────────────────────────────────────────────┐
│  PARADIGM 1: Statistical / Feature-based                    │
│  - Perplexity, burstiness, lexical diversity                │
│  - Fast, no GPU, low accuracy alone                         │
│  - Best as pre-filter (Tier 1)                              │
├────────────────────────────────────────────────────────────┤
│  PARADIGM 2: Zero-shot Model-based                          │
│  - Binoculars, Fast-DetectGPT, GLTR                        │
│  - Cần GPU, high accuracy, no training data needed          │
│  - Best for core detection (Tier 2)                         │
├────────────────────────────────────────────────────────────┤
│  PARADIGM 3: LLM-as-Judge                                   │
│  - Chain-of-thought analysis of linguistic features         │
│  - Most expensive, good for ambiguous cases                 │
│  - Best as final arbiter (Tier 3) ← DOSafe hiện tại       │
└────────────────────────────────────────────────────────────┘
```

### Key Papers & Tools

#### Text Detection

| Method | Paper | Code | Key Insight | Result |
|--------|-------|------|-------------|--------|
| **Binoculars** ⭐ | [arxiv 2401.12070](https://arxiv.org/abs/2401.12070) (ICML 2024) | [GitHub](https://github.com/ahans30/Binoculars) | Perplexity ratio giữa 2 LLMs — AI text → cả 2 model đồng ý (ratio thấp) | >90% detection, **0.01% FPR** |
| **Fast-DetectGPT** ⭐ | [arxiv 2310.05130](https://arxiv.org/abs/2310.05130) (ICLR 2024) | [GitHub](https://github.com/baoguangsheng/fast-detect-gpt) | Probability curvature — AI text nằm ở "đỉnh" log-prob | 75% improvement vs DetectGPT, **340x faster** |
| **DetectGPT** | [arxiv 2301.11305](https://arxiv.org/abs/2301.11305) (ICML 2023) | [GitHub](https://github.com/eric-mitchell/detect-gpt) | Perturbation-based detection — AI text có negative curvature | 0.95 AUROC, nhưng chậm (~100 forward passes) |
| **Ghostbuster** | [arxiv 2305.15047](https://arxiv.org/abs/2305.15047) (NAACL 2024) | [GitHub](https://github.com/vivek3141/ghostbuster) | Black-box: pass qua weak models → features → linear classifier | **99.0 F1** across domains |
| **RADAR** | [arxiv 2307.03838](https://arxiv.org/abs/2307.03838) (NeurIPS 2023) | — | Adversarial training: paraphraser vs detector | Robust against paraphrasing attacks |
| **GLTR** | — (2019) | [GitHub](https://github.com/HendrikStrobelt/detecting-fake-text) | Token rank visualization (green/yellow/red/purple) | Pioneering, good for interpretability |
| **DivEye** | [arxiv 2509.18880](https://arxiv.org/abs/2509.18880) (2025) | — | Surprisal variability — human text có lexical unpredictability phong phú hơn | State-of-the-art 2025 |

#### Image Detection

| Method | Paper | Code | Key Insight |
|--------|-------|------|-------------|
| **DIRE** | [arxiv 2303.09295](https://arxiv.org/abs/2303.09295) (ICCV 2023) | [GitHub](https://github.com/ZhendongWang6/DIRE) | Diffusion reconstruction error — AI images có error thấp |
| **FreqNet** | (AAAI 2024) | [GitHub](https://github.com/chuangchuangtan/FreqNet-DeepfakeDetection) | Frequency domain analysis — AI images có high-freq artifacts |
| **ZED** | — | [GitHub](https://github.com/grip-unina/ZED) | Zero-shot AI image detection, không cần training |
| **CNNDetection** | [arxiv 1912.11035](https://arxiv.org/abs/1912.11035) (CVPR 2020) | [GitHub](https://github.com/PeterWang512/CNNDetection) | Trained on ProGAN → generalizes to 11 architectures |
| **DeepfakeBench** | — | [GitHub](https://github.com/SCLBD/DeepfakeBench) | Benchmark: 36 detection methods (28 image + 8 video) |

#### Watermarking (preventive)

| Method | Paper | Code | How |
|--------|-------|------|-----|
| **Kirchenbauer** | [arxiv 2301.10226](https://arxiv.org/abs/2301.10226) (ICML 2023) | [GitHub](https://github.com/jwkirchenbauer/lm-watermarking) | Green/red token list, z-test detection |
| **SynthID Text** | (Google DeepMind 2024) | [GitHub](https://github.com/google-deepmind/synthid-text) | Logits processor, Bayesian detector, integrated vào HuggingFace |

#### Provenance & Watermarking (deterministic — no AI needed)

| Method | Spec/Paper | Code | How |
|--------|------------|------|-----|
| **C2PA** (Content Credentials) ⭐ | [c2pa.org](https://c2pa.org/specifications/specifications/2.1/specs/C2PA_Specification.html) | [c2pa-js](https://github.com/contentauth/c2pa-js), [c2pa-rs](https://github.com/contentauth/c2pa-rs) | Cryptographic manifest embedded in file — proves origin, edit history, creator. **100% accurate when present** |
| **SynthID Text** | Google DeepMind 2024 | [synthid-text](https://github.com/google-deepmind/synthid-text) | Logits processor embeds statistical watermark, Bayesian detector. Integrated in Gemini |
| **SynthID Image** | Google DeepMind 2023 | — (proprietary) | Imperceptible watermark in pixel space, survives JPEG/resize. Integrated in Imagen |
| **Kirchenbauer Watermark** | [arxiv 2301.10226](https://arxiv.org/abs/2301.10226) (ICML 2023) | [lm-watermarking](https://github.com/jwkirchenbauer/lm-watermarking) | Green/red token list split, z-test detection |

**C2PA adoption (2026):** Adobe (Photoshop, Firefly), Microsoft (Bing Image Creator), OpenAI (DALL-E 3/4), Google (Gemini Images), Canon, Nikon, Leica, Sony, BBC, AP, Reuters. ~40% của AI-generated images trên web hiện có C2PA manifest.

**Key insight:** C2PA là **provenance** (chứng minh nguồn gốc), không phải detection (đoán). Khi có C2PA → kết quả deterministic, không cần AI phán đoán. Khi không có → fallback sang detection pipeline.

#### Benchmarks

| Benchmark | Link | Scale |
|-----------|------|-------|
| **RAID** | [GitHub](https://github.com/liamdugan/raid), [arxiv 2405.07940](https://arxiv.org/abs/2405.07940) | 10M+ documents, 11 LLMs, 12 adversarial attacks |
| **PAN 2026** | [arxiv 2602.09147](https://arxiv.org/html/2602.09147) | Shared tasks: reasoning trajectory, watermark detection |

---

## How Each Method Works

### Binoculars (Recommended for DOSafe Tier 2)

Core idea: **AI text dễ đoán bởi bất kỳ LLM nào, human text thì không.**

```
Input text: "The quick brown fox jumps over the lazy dog"

Model A (observer, e.g. Falcon-7B):
  - Predicts each next token → compute cross-entropy (CE)

Model B (performer, e.g. Falcon-7B-instruct):
  - Predicts each next token → compute perplexity (PPL)

Binoculars Score = PPL(Model B) / CE(Model A)

AI text:  Both models agree → PPL ≈ CE → score ≈ 1.0 (LOW)
Human text: Models disagree → PPL >> CE → score >> 1.0 (HIGH)

Threshold: score < τ → AI-generated
```

**Tại sao tốt:**
- Zero-shot — không cần training data, không cần biết model nào generate
- 0.01% false positive rate — gần như không bao giờ sai khi nói "AI"
- Simple implementation — chỉ 2 forward passes qua 2 pre-trained LLMs
- Works across models — detect GPT-4, Claude, Llama, etc.

**Implementation requirements:**
- 2 LLMs (cùng family, khác variant) — e.g., Falcon-7B + Falcon-7B-instruct
- GPU RAM: ~14GB cho 2x 7B models (hoặc dùng quantized versions)
- Inference: ~2s per text sample trên GPU

### Fast-DetectGPT (Alternative Tier 2)

Core idea: **AI text nằm ở vùng "đỉnh" trong log-probability landscape.**

```
Input text x = [t1, t2, ..., tn]

For each position i:
  1. Get model's conditional distribution P(·|t1,...,t_{i-1})
  2. Sample alternative tokens: t'_i ~ P(·|context)
  3. Compare: log P(t_i|context) vs log P(t'_i|context)

AI text: Original tokens consistently have HIGHER log-prob than alternatives
  → Positive curvature → AI-generated

Human text: Original tokens NOT consistently highest
  → Flat/negative curvature → Human-written
```

**So sánh với Binoculars:**
- Fast-DetectGPT chỉ cần 1 model (Binoculars cần 2)
- Binoculars có FPR thấp hơn (0.01% vs ~1%)
- Fast-DetectGPT giải thích được hơn (per-token scores)

### Statistical Features (Tier 1)

```python
# Perplexity — AI text có perplexity thấp và đều
perplexity = exp(-1/N * sum(log P(token_i | context)))
# AI: low, consistent | Human: higher, variable

# Burstiness — variation in sentence complexity
burstiness = std(sentence_perplexities) / mean(sentence_perplexities)
# AI: low (consistent complexity) | Human: high (varies wildly)

# Lexical diversity — type-token ratio
TTR = unique_words / total_words
# AI: lower (repetitive vocabulary) | Human: higher

# Sentence length variance
SLV = std(sentence_lengths) / mean(sentence_lengths)
# AI: low (uniform lengths) | Human: high (short + long mixed)
```

---

## Proposed Architecture: Multi-Tier Detection Pipeline

### Text Detection Pipeline

```
Input text (≥ 50 chars)
  │
  ├─ Step 0: PREPROCESSING
  │    - Unicode normalization (chống homoglyph attack)
  │    - Language detection
  │    - Length check (< 200 chars → flag low confidence)
  │
  ├─ Tier 1: STATISTICAL ANALYSIS (< 10ms, no GPU)
  │    - Perplexity (via cached n-gram model or small LM)
  │    - Burstiness (sentence-level perplexity variance)
  │    - Lexical diversity (type-token ratio)
  │    - Sentence length variance
  │    - POS bigram frequency distribution
  │    │
  │    ├─ Score > HIGH_THRESHOLD → verdict: AI (confidence: medium)
  │    ├─ Score < LOW_THRESHOLD  → verdict: Human (confidence: medium)
  │    └─ AMBIGUOUS → proceed to Tier 2
  │
  ├─ Tier 2: ZERO-SHOT MODEL ANALYSIS (~2s, GPU)
  │    - Binoculars score (perplexity ratio between 2 LLMs)
  │    - Optional: Fast-DetectGPT curvature score
  │    │
  │    ├─ Binoculars < AI_THRESHOLD → verdict: AI (confidence: high)
  │    ├─ Binoculars > HUMAN_THRESHOLD → verdict: Human (confidence: high)
  │    └─ AMBIGUOUS → proceed to Tier 3
  │
  └─ Tier 3: LLM-AS-JUDGE (~3-5s, LLM inference)
       - Current DOSafe rubric (improved)
       - Chain-of-thought analysis
       - Combine Tier 1+2 signals as context
       │
       └─ Final verdict + confidence + reasoning + signals
```

### Image Detection Pipeline

```
Input image (≤ 10MB)
  │
  ├─ Step 0: PREPROCESSING
  │    - Format validation
  │    - Resolution check
  │
  ├─ Tier 0: C2PA / CONTENT CREDENTIALS (< 50ms, deterministic)
  │    - Parse C2PA manifest (c2pa-js / c2pa-rs)
  │    - Check cryptographic signature validity
  │    - Extract: creator, tool, edit history, provenance chain
  │    - Check embedded watermarks (SynthID, C2PA watermark)
  │    │
  │    ├─ Valid C2PA + camera origin → verdict: Human (confidence: VERY HIGH)
  │    ├─ Valid C2PA + AI tool (DALL-E, Midjourney, Stable Diffusion)
  │    │   → verdict: AI (confidence: VERY HIGH)
  │    ├─ C2PA present but signature invalid → flag TAMPERED
  │    ├─ SynthID watermark detected → verdict: AI (confidence: high)
  │    └─ No C2PA / no watermark → proceed to Tier 1
  │
  ├─ Tier 1: METADATA + REVERSE SEARCH (< 500ms)
  │    - EXIF data present? (AI images = no EXIF)
  │    - Camera model, lens info, GPS coords?
  │    - Software field (Photoshop, Midjourney, DALL-E?)
  │    - JPEG quantization table analysis (camera-specific vs generic)
  │    - Reverse image search (Google Lens API / TinEye)
  │    │
  │    ├─ Real camera EXIF → likely Human (confidence: medium)
  │    ├─ AI tool in metadata → verdict: AI (confidence: high)
  │    ├─ Found original source (news, stock photo) → Human (confidence: high)
  │    └─ No metadata + no source → proceed to Tier 2
  │
  ├─ Tier 2: FREQUENCY ANALYSIS (~500ms, GPU)
  │    - FFT/DCT frequency spectrum analysis
  │    - AI images have distinct high-frequency patterns
  │    - Optional: DIRE reconstruction error
  │    │
  │    ├─ Clear AI frequency pattern → verdict: AI (confidence: high)
  │    ├─ Natural frequency pattern → verdict: Human (confidence: medium)
  │    └─ AMBIGUOUS → proceed to Tier 3
  │
  └─ Tier 3: LLM VISUAL ANALYSIS (~3-5s, multimodal LLM)
       - Current DOSafe image rubric (improved)
       - Analyze: texture, lighting, anatomy, edges, physics
       - Combine Tier 0+1+2 signals as context
       │
       └─ Final verdict + confidence + reasoning + signals
```

### Audio Detection Pipeline (planned)

```
Input audio (≤ 50MB)
  │
  ├─ Step 0: PREPROCESSING
  │    - Format validation (WAV/MP3/OGG/FLAC)
  │    - Duration check, sample rate normalization
  │
  ├─ Tier 0: C2PA / WATERMARK CHECK (< 50ms, deterministic)
  │    - C2PA manifest check (recording device provenance)
  │    - SynthID Audio watermark detection (Google TTS)
  │    │
  │    ├─ Valid C2PA + mic origin → Human (confidence: VERY HIGH)
  │    ├─ SynthID watermark → AI (confidence: VERY HIGH)
  │    └─ No provenance → proceed to Tier 1
  │
  ├─ Tier 1: SPECTRAL ANALYSIS (< 500ms, CPU/GPU)
  │    - Mel-spectrogram analysis
  │    - TTS artifacts: unnatural pitch transitions, uniform energy
  │    - Voice cloning artifacts: spectral gaps, phase discontinuities
  │    - Breathing pattern analysis (real speech has irregular breathing)
  │    │
  │    ├─ Clear TTS pattern → AI (confidence: high)
  │    ├─ Natural speech patterns → Human (confidence: medium)
  │    └─ AMBIGUOUS → proceed to Tier 2
  │
  └─ Tier 2: LLM AUDIO ANALYSIS (~3-5s, multimodal LLM)
       - Transcribe (Whisper) + analyze linguistic naturalness
       - Cross-check with spectral signals
       │
       └─ Final verdict + confidence + reasoning

Research: ASVspoof benchmark, AASIST (anti-spoofing), RawNet2
```

### Video Detection Pipeline (planned)

```
Input video (≤ 100MB)
  │
  ├─ Tier 0: C2PA CHECK (< 100ms, deterministic)
  │    - C2PA manifest (camera + edit provenance)
  │    │
  │    ├─ Valid C2PA + camera origin → Human (VERY HIGH)
  │    └─ No provenance → proceed to Tier 1
  │
  ├─ Tier 1: FRAME-LEVEL ANALYSIS
  │    - Sample N keyframes → run Image Detection Pipeline
  │    - Temporal consistency check (flickering, identity drift)
  │    - Face detection → deepfake-specific analysis
  │
  └─ Tier 2: LLM + SPECIALIZED MODELS
       - Deepfake detector (face-swap, lip-sync, full synthesis)
       - Motion analysis (unnatural movement patterns)

Research: DeepfakeBench (36 methods), FaceForensics++, DeeperForensics
```

### Combined Output Format

```json
{
  "ai_probability": 87,
  "human_probability": 13,
  "verdict": "AI",
  "confidence": "high",
  "tier_reached": 2,
  "analysis": {
    "tier1": {
      "perplexity": 12.3,
      "burstiness": 0.15,
      "lexical_diversity": 0.42,
      "statistical_score": 72
    },
    "tier2": {
      "binoculars_score": 0.84,
      "threshold": 0.90,
      "method": "binoculars"
    },
    "tier3": null
  },
  "reasoning": "Low burstiness (0.15) and Binoculars score (0.84) below AI threshold (0.90) indicate machine-generated text with consistent complexity patterns.",
  "signals": ["low_burstiness", "uniform_perplexity", "binoculars_ai"],
  "language": "vi",
  "processing_time_ms": 2150
}
```

---

## Current Prompt Analysis & Improvements

### Text Detection — Original Rubric (10 criteria, superseded by 19-criteria version below)

| # | Criterion | Points | Assessment |
|---|-----------|--------|------------|
| A | STRUCTURE (intro→body→conclusion) | +15 | OK — standard signal |
| B | TRANSITIONS (smooth logical flow) | +15 | OK — AI hallmark |
| C | CONSISTENT REGISTER (uniform vocabulary) | +10 | OK — AI tends uniform |
| D | EVEN EMOTION (flat emotional distribution) | +10 | OK — AI doesn't fluctuate |
| E | GENERIC EXAMPLES (no personal anecdotes) | +10 | OK — good discriminator |
| F | NO TRUE ERRORS (no typos/self-corrections) | +10 | **WEAK** — modern AI makes deliberate "typos" to evade |
| G | COMPLETE NARRATIVE (coherent, relevant) | +10 | **WEAK** — both human and AI can be coherent |
| H | HEDGING LANGUAGE ("however", "moreover") | +10 | OK — AI overuses hedging |
| I | UNEXPECTED DETAIL (personal, idiosyncratic) | -15 | **GOOD** — strong human signal |
| J | AUTHENTIC MESSINESS (contradictions, topic shifts) | -15 | **GOOD** — strong human signal |

**Improvements needed:**

1. **Add: Sentence-level entropy variation** — AI has uniform complexity per sentence, humans vary wildly. Research shows this is one of the most discriminative signals (DivEye, 2025)

2. **Add: Repetitive phrasing patterns** — AI reuses sentence structures ("It is important to note that...", "In conclusion..."). Count structural repetition

3. **Add: First-person narrative consistency** — AI's "personal stories" are generic and could apply to anyone. Real personal stories have specific, verifiable details

4. **Weaken: NO TRUE ERRORS (F)** — Modern AI deliberately inserts "typos" to evade. This criterion gives false confidence

5. **Weaken: COMPLETE NARRATIVE (G)** — Both can produce coherent text. Not discriminative enough for +10

6. **Add Vietnamese-specific signals:**
   - Particle usage (à, ạ, nhỉ, nhé, nha) — AI underuses Vietnamese particles
   - Code-switching patterns (Vietnamese-English mixing in natural conversation)
   - Regional dialect markers (Bắc/Trung/Nam)
   - Informal abbreviations (ko, dc, k, r, vs...)

### Current Rubric (19 criteria — A-S, active since 2026-03-02)

```
POSITIVE SIGNALS (indicates AI):
A. STRUCTURE: Provides structured intro→body→conclusion           (+12)
B. TRANSITIONS: Smooth logical transitions between paragraphs      (+12)
C. CONSISTENT REGISTER: Uniform vocabulary level throughout        (+8)
D. EVEN EMOTION: Flat emotional distribution across text           (+8)
E. GENERIC EXAMPLES: Non-specific examples, no real anecdotes     (+10)
F. HEDGING OVERUSE: Excessive "however", "moreover", "it is
   important to note", "in conclusion"                             (+10)
G. UNIFORM COMPLEXITY: Similar sentence length and structure
   throughout (low burstiness)                                     (+12)
H. REPETITIVE STRUCTURES: Reused sentence patterns/templates       (+8)
P. PARAPHRASE MARKERS: Unnatural synonym substitutions that
   preserve AI structure but swap words awkwardly                   (+10)
Q. BYPASSER ARTIFACTS: Inconsistent vocabulary level, mechanical
   word replacements from AI bypass tools (Undetectable AI, etc.)  (+8)

NEGATIVE SIGNALS (indicates Human):
I. UNEXPECTED DETAIL: Specific, personal, verifiable details       (-15)
J. AUTHENTIC MESSINESS: Real contradictions, topic drift,
   self-corrections, incomplete thoughts                           (-15)
K. NATURAL ERRORS: Genuine typos (not deliberate), grammar
   mistakes typical of the language/dialect                        (-8)
L. EMOTIONAL SPIKES: Sudden emotional shifts, strong opinions,
   humor, sarcasm                                                  (-7)
R. ESL MARKERS: Non-native patterns (limited vocabulary, simple
   sentences, L1 interference) = human, not AI fluency             (-10)
S. FORMULAIC ACADEMIC: Simple structured writing typical of
   non-native students, not AI sophistication                      (-8)

VIETNAMESE-SPECIFIC (if Vietnamese detected):
M. PARTICLE USAGE: Natural use of à, ạ, nhỉ, nhé, nha, hen       (-5)
N. CODE-SWITCHING: Natural Vietnamese-English mixing               (-5)
O. INFORMAL MARKERS: ko, dc, k, r, vs, abbreviations              (-5)

Total range: -78 to +98 (without VN: -63 to +98). Normalize to 0-100.
Threshold: ≥ 60 → AI | ≤ 40 → Human | 41-59 → Mixed
```

### Image Detection — Current Rubric Assessment

Current rubric is reasonable. Improvements:

1. **Add: EXIF metadata analysis** — mention in prompt that AI images lack camera EXIF
2. **Add: Perspective consistency** — AI often has subtle vanishing point errors
3. **Add: Text rendering** — AI-generated text in images is often garbled/nonsensical
4. **Weight adjustment:** ANATOMICAL ERRORS (+20) is good but modern AI (Flux, SD3) is improving rapidly. Should decrease weight over time

---

## Known Limitations & Defenses

### Attack Vectors

| Attack | Impact | Current DOSafe Vulnerability | Proposed Defense |
|--------|--------|------------------------------|------------------|
| **Paraphrasing** | Fast-DetectGPT: -98.96% accuracy | MEDIUM — rubric criteria P+Q detect bypass artifacts | Rubric P+Q (done). Next: retrieval-based detection via pgvector |
| **Homoglyph** (Unicode substitution) | -40.6% accuracy | LOW — NFKC normalization active | Text normalization preprocessing (NFKC + custom rules) |
| **Short text** (< 200 chars) | Most methods unreliable | MEDIUM — min 50 chars | Increase minimum to 200, flag low confidence |
| **Mixed human+AI** | Detection < 50% | HIGH — single verdict | Sentence-level classification, report mixed probability |
| **Non-English** (Vietnamese) | 70-80% vs 95% English | MEDIUM — VN rubric M/N/O + ESL R/S active | Vietnamese-specific signals + ESL de-biasing. Next: bilingual test corpus |
| **Fine-tuned evasion** | Model trained to evade | LOW — unlikely for most users | Adversarial training (RADAR approach) |

### Defense Priority

1. **Text normalization** — trivial to implement, blocks homoglyph attacks immediately
2. **Vietnamese optimization** — add Vietnamese-specific signals to rubric, test with Vietnamese corpus
3. **Minimum text length** — increase to 200 chars, add confidence levels
4. **Multi-tier pipeline** — statistical + model + LLM layering catches different attack vectors
5. **Sentence-level analysis** — detect mixed human+AI content (future)

---

## Implementation Plan

### Phase 1: Quick Wins ✅ COMPLETE

1. ✅ **Text normalization** — Unicode NFKC implemented
2. ✅ **Improved rubric** — 15 criteria (A-O), Vietnamese-specific M/N/O signals
3. ✅ **Confidence levels** — low/medium/high based on token count and signal agreement
4. ✅ **Language detection** — Vietnamese auto-detected, extra rubric signals added

### Phase 2: Add Tier 1 Statistical Analysis ✅ COMPLETE

1. ✅ **Perplexity** — computed via vLLM `/v1/completions` with `echo: true, logprobs: 1`
2. ✅ **Burstiness** — chunk-level perplexity coefficient of variation
3. ✅ **Source matching** — Serper API Google Search, trusted domain scoring (−5 to −15 ai_probability)
4. Note: Lexical diversity / TTR / SLV not implemented (burstiness already covers the key signal)

### Phase 3: Add Tier 2 Binoculars ✅ COMPLETE

1. ✅ **Observer model deployed** — Qwen3-8B (base) on RTX 5090, port 8001, healthy
2. ✅ **Binoculars code** — `computeBinoculars()` implemented in `/api/detect`
3. ✅ **Scoring formula** — `PPL(scorer) / CE(observer)`, low score = AI
4. ✅ **Graceful degradation** — falls back to Tier 1 only if observer unavailable
5. ✅ **Tunnel active** — `inference-ref.dos.ai → localhost:8001` configured in Zero Trust dashboard (DOS account, tunnel `04915ff2`)
6. ✅ **Vercel env var** — `VLLM_OBSERVER_URL=https://inference-ref.dos.ai` set in production
7. ✅ **VRAM tuned** — `--max-model-len 4096 --gpu-memory-utilization 0.75 --kv-cache-dtype fp8` → RTX 5090 at 59% (down from 99%)
8. ❌ **Threshold calibration** — needs testing on Vietnamese + English corpus

**Infra summary:**
- Scorer: `Qwen3.5-35B-A3B-FP8` on RTX Pro 6000 (97GB) → `api.dos.ai` (port 8000)
- Observer: `Qwen3-8B` on RTX 5090 (32GB) → `inference-ref.dos.ai` (port 8001)
- Combined weight: 60% Binoculars + 40% perplexity/burstiness → stat score
- Final score: 35% stat + 65% LLM rubric

### Phase 4: Image Detection Improvements ✅ COMPLETE

1. ✅ **EXIF extraction** — pure-JS EXIF parser (no native deps), detects camera model, GPS, software, AI tool names (Midjourney/DALL-E/SD → definitive AI verdict)
2. ✅ **JPEG DCT/quantization analysis** — reads quantization tables from binary stream, camera-specific high-variance tables vs AI generic quality settings
3. ✅ **Integrated into LLM prompt** — EXIF/DCT signals passed as context to Tier 3 (30% metadata + 70% visual rubric blend)
4. ✅ **UI updated** — "Image metadata" section shows camera model, GPS, software, AI tool detected
5. ❌ **Open source models** — ZED / DIRE not yet integrated (requires Python sidecar)

### Phase 5: C2PA Provenance + Reverse Image Search ✅ COMPLETE

1. ✅ **C2PA parsing** — `@contentauth/c2pa-node` v0.5.1 (Node.js native Rust bindings, MIT)
   - `Reader.fromAsset({ buffer, mimeType })` parses manifest from image buffer, <100ms, no GPU
   - `trainedAlgorithmicMedia` digitalSourceType → AI verdict (100% accurate, cryptographic proof)
   - `photograph` / `digitalCapture` → camera origin → cap AI prob at 40
   - Signature validation: invalid → TAMPERED flag shown in UI
   - Graceful degradation: c2pa-node load failure → skip to EXIF tier
   - Displayed as colored banner in UI (blue=camera, red=AI, amber=tampered)
2. ✅ **Reverse image search** — Serper Google Lens API (`POST /lens`, same SERPER_API_KEY)
   - Sends `data:image/jpeg;base64,...` → returns visual matches with title, URL, source domain
   - Trusted domains: Reuters, AP, BBC, VnExpress, Getty, Shutterstock, Unsplash, Wikipedia, etc.
   - Adjustment: 1 trusted match = −12, 2+ trusted matches = −20 AI prob
   - 8s timeout, graceful degradation on failure
   - Shown as "Found online" section in UI with trusted source badges
3. ✅ **next.config.js** — `serverExternalPackages: ['@contentauth/c2pa-node']` added
4. ✅ **pnpm-lock.yaml** updated — deployed to dosafe.io successfully
5. ❌ **SynthID detection** — requires Google API or pixel-level watermark analysis (deferred)
6. ❌ **Kirchenbauer watermark** — text-only, deferred

**Pending:** SERPER_API_KEY needs to be set in Vercel production for reverse image search + text source matching to work.

### Phase 5.5: Paraphrase Shield + ESL De-biasing ✅ COMPLETE

1. ✅ **Paraphrase Shield** — Added rubric criteria P + Q to LLM prompt
   - P. PARAPHRASE MARKERS (+10): Detects unnatural synonym substitutions that preserve AI sentence structure but swap words awkwardly — hallmark of paraphrase tools (Undetectable AI, Phrasly, QuillBot)
   - Q. BYPASSER ARTIFACTS (+8): Detects inconsistent vocabulary level, mechanical word replacements, unnatural phrase inversions typical of automated rewriting
   - Defends against adversarial paraphrasing which degrades undefended detectors by up to 87.88% (NeurIPS 2025)
2. ✅ **ESL De-biasing** — Added rubric criteria R + S to LLM prompt
   - R. ESL MARKERS (-10): Recognizes non-native speaker patterns (limited vocabulary, simple sentences, L1 interference, awkward prepositions) as HUMAN indicators rather than AI fluency
   - S. FORMULAIC ACADEMIC (-8): Simple structured academic writing typical of ESL students should not be confused with AI sophistication
   - Critical: Stanford HAI research shows 61.3% of ESL essays are misclassified as AI by standard detectors
   - Especially important for DOSafe's Vietnamese market where most users write English as L2
3. ❌ **Retrieval-based paraphrase defense** — Future: index known AI patterns in Supabase pgvector, flag text with high semantic similarity to known AI outputs
4. ❌ **ESL detection heuristics** — Future: auto-detect ESL text via unique word ratio + sentence complexity metrics, dynamically adjust scoring thresholds

**Research refs:**
- [Adversarial Paraphrasing (NeurIPS 2025)](https://github.com/chengez/Adversarial-Paraphrasing)
- [Stanford HAI: AI Detectors Biased Against ESL Writers](https://hai.stanford.edu/news/ai-detectors-biased-against-non-native-english-writers)
- [GPTZero Paraphraser Shield](https://gptzero.me/news/ai-paraphrasing-detection/)

### Phase 6: Audio / Video Detection ❌ TODO

1. ❌ **Audio detection pipeline**
   - Spectral analysis: mel-spectrogram, pitch contour, breathing patterns
   - TTS detection: uniform energy distribution, missing micro-prosody
   - Voice cloning: spectral gaps, phase discontinuities at splice points
   - ASVspoof benchmark models (AASIST, RawNet2)
   - Whisper transcription → text detection pipeline (reuse Tier 1-3)
2. ❌ **Video detection pipeline**
   - Keyframe sampling → Image Detection Pipeline (reuse)
   - Temporal consistency: identity drift, flickering, lighting shifts between frames
   - Face-specific: deepfake detector (face-swap, lip-sync, reenactment)
   - DeepfakeBench models (36 methods available)
3. ❌ **Multimodal LLM integration**
   - Qwen3-VL / Qwen2.5-VL already supports video input
   - Can analyze short clips (~30s) directly

**Research refs:**
- ASVspoof 2021/2024 — standard audio anti-spoofing benchmark
- FaceForensics++ — 1000 videos, 4 manipulation methods
- DeepfakeBench — 36 detection methods (28 image + 8 video)
- AASIST — graph-based spectro-temporal anti-spoofing

### Phase 7: On-Chain Integration ❌ TODO

Link detection results to DOS Chain Trust Stack:

```
DOSafe detection → EntityRegistry record (on-chain)
  - Entity: URL/content hash of checked content
  - Record: FLAG(AI_GENERATED, risk=85, source=API)
  - Evidence: hash of full analysis (off-chain)
```

See [EntityRegistry Design](Smart-Contracts/DOS-Chain-EntityRegistry-Design.md) for on-chain data model.

---

## Resource Requirements

### Current (Tier 3 only)
- 1x Qwen3.5-35B inference endpoint (existing: `api.dos.ai`)
- Cost: ~$0.002/request (500 tokens output)

### With Multi-Tier Pipeline
| Component | Resource | Cost Impact |
|-----------|----------|-------------|
| Tier 0 (C2PA/watermark) | CPU only, c2pa-js ~200KB | ~$0 (deterministic, no inference) |
| Tier 1 (statistical + EXIF) | CPU only, no model | ~$0 (negligible) |
| Tier 2 (Binoculars) | 2x 7B models, ~14GB VRAM | New GPU cost, but saves Tier 3 calls |
| Tier 3 (LLM judge) | Existing Qwen3.5-35B | Same, but called less often (~40-60% less) |
| Reverse image search | External API (Google Lens/TinEye) | ~$0.002-0.005/query |

**Net effect:** Tier 0 (C2PA) is essentially free and gives deterministic results. Higher upfront GPU cost for Binoculars, but significantly reduced Tier 3 LLM calls. Overall cost likely **neutral or lower** with better accuracy.

---

## Evaluation Plan

### Test Corpus Needed

| Language | Source | Human | AI | Total |
|----------|--------|-------|-----|-------|
| English | Wikipedia, Reddit, blogs | 500 | 500 (GPT-4, Claude, Llama) | 1000 |
| Vietnamese | Báo Mới, VNExpress, forums | 500 | 500 (GPT-4, Claude, Gemini) | 1000 |
| Mixed (VN+EN) | Code-switching text | 200 | 200 | 400 |
| Short text (<200 chars) | Tweets, comments | 200 | 200 | 400 |
| **Total** | | 1400 | 1400 | 2800 |

### Metrics

| Metric | Target | Current (estimated) |
|--------|--------|---------------------|
| **True Positive Rate** (AI correctly detected) | >90% | ~75% |
| **False Positive Rate** (human flagged as AI) | <5% | ~15% |
| **Vietnamese accuracy** | >85% | ~70% |
| **Latency (median)** | <500ms (Tier 1+2) | ~3-5s (Tier 3 only) |
| **Cost per request** | <$0.001 average | ~$0.002 |

### A/B Testing

Deploy multi-tier pipeline alongside current system. Compare:
- Accuracy on test corpus
- User feedback (thumbs up/down on verdict)
- Latency distribution
- Cost per request

---

## References

### Must-Read Papers (sorted by practical value)

1. **Binoculars** — Hans et al., ICML 2024 — [arxiv.org/abs/2401.12070](https://arxiv.org/abs/2401.12070)
   - Best zero-shot method. 0.01% FPR. Simple implementation
2. **Fast-DetectGPT** — Bao et al., ICLR 2024 — [arxiv.org/abs/2310.05130](https://arxiv.org/abs/2310.05130)
   - 340x faster than DetectGPT. Single model needed
3. **Ghostbuster** — Verma et al., NAACL 2024 — [arxiv.org/abs/2305.15047](https://arxiv.org/abs/2305.15047)
   - Black-box detection. 99.0 F1. Uses weak model features
4. **RADAR** — Hu et al., NeurIPS 2023 — [arxiv.org/abs/2307.03838](https://arxiv.org/abs/2307.03838)
   - Adversarial training. Best defense against paraphrasing
5. **DetectGPT** — Mitchell et al., ICML 2023 — [arxiv.org/abs/2301.11305](https://arxiv.org/abs/2301.11305)
   - Foundational paper. Probability curvature concept
6. **Kirchenbauer Watermark** — ICML 2023 — [arxiv.org/abs/2301.10226](https://arxiv.org/abs/2301.10226)
   - Green/red token watermarking. Preventive approach
7. **DivEye** — 2025 — [arxiv.org/abs/2509.18880](https://arxiv.org/abs/2509.18880)
   - Surprisal variability. State-of-the-art for text
8. **RAID Benchmark** — 2024 — [arxiv.org/abs/2405.07940](https://arxiv.org/abs/2405.07940)
   - 10M+ documents. Standard benchmark for evaluation
9. **DIRE** (images) — ICCV 2023 — [arxiv.org/abs/2303.09295](https://arxiv.org/abs/2303.09295)
   - Diffusion reconstruction error for image detection
10. **LLM-as-Judge survey** — 2024 — [arxiv.org/html/2411.15594v6](https://arxiv.org/html/2411.15594v6)
    - Comprehensive survey on using LLMs as evaluators
11. **C2PA Specification** — v2.1 — [c2pa.org](https://c2pa.org/specifications/specifications/2.1/specs/C2PA_Specification.html)
    - Content provenance standard. Deterministic, 100% accurate. Adobe/Microsoft/Google/OpenAI adopted
12. **ASVspoof 2021** — [asvspoof.org](https://www.asvspoof.org/)
    - Standard benchmark for audio anti-spoofing (voice cloning, TTS detection)

### Open Source Repos

| Repo | Stars | Use Case |
|------|-------|----------|
| [ahans30/Binoculars](https://github.com/ahans30/Binoculars) | — | Zero-shot text detection (RECOMMENDED) |
| [baoguangsheng/fast-detect-gpt](https://github.com/baoguangsheng/fast-detect-gpt) | — | Fast zero-shot text detection |
| [vivek3141/ghostbuster](https://github.com/vivek3141/ghostbuster) | — | Black-box text detection |
| [jwkirchenbauer/lm-watermarking](https://github.com/jwkirchenbauer/lm-watermarking) | — | Text watermarking |
| [google-deepmind/synthid-text](https://github.com/google-deepmind/synthid-text) | — | Google's text watermarking |
| [ZhendongWang6/DIRE](https://github.com/ZhendongWang6/DIRE) | — | Image detection via diffusion error |
| [chuangchuangtan/FreqNet-DeepfakeDetection](https://github.com/chuangchuangtan/FreqNet-DeepfakeDetection) | — | Frequency-based image detection |
| [grip-unina/ZED](https://github.com/grip-unina/ZED) | — | Zero-shot image detection |
| [SCLBD/DeepfakeBench](https://github.com/SCLBD/DeepfakeBench) | — | 36 detection methods benchmark |
| [liamdugan/raid](https://github.com/liamdugan/raid) | — | RAID benchmark (10M+ docs) |
| [HendrikStrobelt/detecting-fake-text](https://github.com/HendrikStrobelt/detecting-fake-text) | — | GLTR visual forensic tool |
| [contentauth/c2pa-js](https://github.com/contentauth/c2pa-js) | — | C2PA Content Credentials (JS, MIT) — **RECOMMENDED for provenance** |
| [contentauth/c2pa-rs](https://github.com/contentauth/c2pa-rs) | — | C2PA Content Credentials (Rust, MIT/Apache-2.0) |
| [contentauth/c2patool](https://github.com/contentauth/c2patool) | — | CLI tool to inspect/create C2PA manifests |

---

## Open Questions

1. **Binoculars model pair cho Vietnamese:** Falcon-7B + instruct pair chủ yếu train trên English. Cần test Qwen-7B (tốt cho CJK/Vietnamese) hoặc Vistral (Vietnamese-specific)
2. **GPU hosting:** Binoculars cần 2x 7B models. Dùng cùng GPU với Qwen3.5-35B (api.dos.ai) hay deploy riêng?
3. **Vietnamese test corpus:** Chưa có labeled dataset Vietnamese AI-generated text. Cần tự tạo (generate từ GPT-4/Claude/Gemini → label)
4. **Watermarking cho DOS AI output:** DOS AI (api.dos.ai) nên embed watermark (SynthID/Kirchenbauer) vào output để tự detect được?
5. **Rate limiting strategy:** Multi-tier giảm cost per request → có thể tăng rate limit? Hiện 10/hour khá thấp
6. **Sentence-level detection:** Phát hiện mixed human+AI content cần sentence-level scoring. Complexity vs value tradeoff
7. **C2PA adoption rate:** ~40% AI images có C2PA manifest (2026). Nếu user strip metadata trước khi upload → C2PA vô dụng. Cần fallback detection pipeline vững
8. **Reverse image search API:** Google Lens API (chưa có public API chính thức) vs TinEye API ($0.005/search, có API). Hoặc SerpAPI Google Lens wrapper?
9. **Audio priority:** Voice cloning phổ biến (ElevenLabs, XTTS) nhưng DOSafe chưa có use case cụ thể. Audio detection nên ở priority nào?
10. **DOS AI watermarking:** api.dos.ai (Qwen3.5) nên embed Kirchenbauer watermark vào output không? Pros: tự detect được 100%. Cons: quality degradation nhỏ, user có thể paraphrase xóa
