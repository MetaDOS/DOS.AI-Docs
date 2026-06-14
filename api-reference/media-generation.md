# Media Generation

Generate video and audio from text prompts. These are DOS AI extension endpoints (not part of the OpenAI API).

- **Video** generation is **asynchronous**: create a job, then poll for the result.
- **Audio (music)** generation is **synchronous**: the response includes the audio URL directly.

All media-generation endpoints use the same API key authentication as the rest of the API:

```
Authorization: Bearer dos_sk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

---

## Video Generation

### Create a video

```
POST https://api.dos.ai/v1/videos/generations
```

#### Request Body

| Parameter | Type | Required | Default | Description |
| --------- | ---- | -------- | ------- | ----------- |
| `prompt` | string | Yes | - | Text description of the video to generate. |
| `model` | string | No | `wan-t2v` | Video model ID. See [Video Models](#video-models). |
| `duration` | integer | No | 5 | Length of the video in seconds. |
| `resolution` | string | No | provider default | Output resolution, e.g. `720p`, `1080p`. |
| `image_url` | string | No | - | A source image URL. Providing it switches the model to its image-to-video variant. |

#### Response (202 Accepted)

Video generation runs in the background. The call returns immediately with a `task_id` you use to poll for the result.

```json
{
  "id": "req-1a2b3c",
  "task_id": "task-abc123",
  "status": "processing",
  "model": "wan-t2v",
  "provider": "alibaba"
}
```

#### Video Models

| Model ID | Description |
| -------- | ----------- |
| `wan-t2v` (default) | Wan 2.7 text-to-video |
| `wan2.7-t2v` | Wan 2.7 text-to-video |
| `wan-i2v` / `wan2.7-i2v` | Wan 2.7 image-to-video |
| `wan2.6-t2v` | Wan 2.6 text-to-video |
| `wan2.6-i2v` | Wan 2.6 image-to-video |

> When `image_url` is supplied with a text-to-video model, DOS AI automatically routes to that model's image-to-video variant.

### Get video status

```
GET https://api.dos.ai/v1/videos/generations/{task_id}
```

Poll this endpoint (using the `task_id` from the create call) until `status` is `succeeded` or `failed`.

```json
{
  "task_id": "task-abc123",
  "status": "succeeded",
  "provider": "alibaba",
  "data": [
    { "url": "https://.../video.mp4" }
  ]
}
```

| `status` | Meaning |
| -------- | ------- |
| `processing` | The job is still running. Keep polling. |
| `succeeded` | Done. `data[].url` holds the generated video URL. |
| `failed` | Generation failed. `message` contains the reason. |

---

## Audio (Music) Generation

```
POST https://api.dos.ai/v1/audio/generations
```

Generates music from a text prompt and/or lyrics. This call is **synchronous** and typically takes 30-60 seconds.

#### Request Body

| Parameter | Type | Required | Default | Description |
| --------- | ---- | -------- | ------- | ----------- |
| `prompt` | string | Yes* | - | Description / style of the music. |
| `lyrics` | string | Yes* | - | Lyrics for the song. |
| `model` | string | No | `minimax-music-2.5` | Audio model ID. |
| `duration` | integer | No | 180 | Target length in seconds. |
| `instrumental` | boolean | No | false | Generate an instrumental track (no vocals). |

\* Provide at least one of `prompt` or `lyrics`.

#### Response (200 OK)

```json
{
  "id": "trace-xyz789",
  "created": 1718000000,
  "model": "minimax-music-2.5",
  "provider": "minimax",
  "data": [
    { "url": "https://.../music.mp3", "duration": 30.0 }
  ]
}
```

Audio is returned as a direct URL (MP3, 44.1 kHz, 256 kbps). `data[0].duration` is the actual length in seconds.

---

## Billing

Video and audio are billed **per second of generated media** (not per token). The rate depends on the model; see the [dashboard](https://app.dos.ai/models) for current pricing.

## Error Responses

| Status Code | Error | Description |
| ----------- | ----- | ----------- |
| 400 | Bad Request | Invalid parameters (e.g. missing `prompt`). |
| 401 | Unauthorized | Invalid or missing API key. |
| 402 | Payment Required | Insufficient credits. |
| 429 | Too Many Requests | Rate limit exceeded. |
| 500 | Internal Server Error | Generation backend error. |

## Examples

### Generate a video, then poll for it (cURL)

```bash
# 1. Create the job
curl https://api.dos.ai/v1/videos/generations \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer dos_sk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" \
  -d '{
    "prompt": "A red panda surfing a wave at sunset, cinematic",
    "model": "wan-t2v",
    "duration": 5,
    "resolution": "720p"
  }'
# -> {"id":"req-...","task_id":"task-abc123","status":"processing",...}

# 2. Poll until succeeded
curl https://api.dos.ai/v1/videos/generations/task-abc123 \
  -H "Authorization: Bearer dos_sk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
# -> {"task_id":"task-abc123","status":"succeeded","data":[{"url":"https://.../video.mp4"}]}
```

### Generate music (cURL)

```bash
curl https://api.dos.ai/v1/audio/generations \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer dos_sk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" \
  -d '{
    "prompt": "upbeat lo-fi hip hop, mellow piano",
    "instrumental": true,
    "duration": 30
  }'
```
