# Error Codes

When an API request fails, the response includes an HTTP status code and a JSON body with error details.

## Error Response Format

Most errors follow this structure:

```json
{
  "error": {
    "message": "A human-readable description of the error.",
    "type": "error_type",
    "code": 401
  }
}
```

## 400 Bad Request

The request is malformed or contains invalid parameters.

**Common triggers:**
- Missing required fields (`model` or `messages`)
- Invalid `model` value (model does not exist)
- `messages` array is empty
- `temperature` outside the valid range (0-2)
- `max_tokens` is negative or exceeds the model context limit
- Malformed JSON in the request body

**Example:**
```json
{
  "error": {
    "message": "Invalid value for temperature: must be between 0 and 2.",
    "type": "invalid_request_error",
    "code": 400
  }
}
```

**How to fix:**
- Verify the request body is valid JSON
- Check that all required fields are present
- Ensure parameter values are within documented ranges
- Use the [Models API](../api-reference/models.md) to confirm valid model IDs

### Guardrails Block (`guardrails_blocked`)

If you opt into [Guardrails](../guides/guardrails.md) with the `X-DOS-Guardrails: block` header and sensitive data (PII) is detected in your input, the request is rejected with a `400` and this body:

```json
{
  "error": {
    "message": "Request blocked by guardrails: sensitive data (PII) detected in the input.",
    "type": "guardrails_blocked"
  }
}
```

To mask the PII and let the request through instead, use `X-DOS-Guardrails: redact`. See [Guardrails](../guides/guardrails.md) for details.

---

## 401 Unauthorized

The API key is missing, invalid, or has been revoked.

**Common triggers:**
- No `Authorization` header in the request
- Incorrect header format (must be `Bearer YOUR_API_KEY`)
- API key has been deleted or deactivated

**Example:**
```json
{
  "error": {
    "message": "Invalid API key.",
    "type": "authentication_error",
    "code": 401
  }
}
```

**How to fix:**
- Verify your API key starts with `dos_sk_`
- Check the `Authorization` header format: `Authorization: Bearer dos_sk_...`
- Generate a new key from the [dashboard](https://app.dos.ai) if your current key may be compromised
- Ensure there are no trailing spaces or newlines in the key

---

## 402 Payment Required

Your account does not have sufficient credits to process the request.

**Example:**
```json
{
  "error": {
    "message": "Insufficient credits. Please top up your account.",
    "type": "payment_required",
    "code": 402
  }
}
```

**How to fix:**
- Check your current balance on the [dashboard](https://app.dos.ai)
- Add credits to your account
- If you believe this is an error, contact support@dos.ai

---

## 429 Too Many Requests

You have exceeded the rate limit for your account.

**Example:**
```json
{
  "error": {
    "message": "Rate limit exceeded. Please wait before making another request.",
    "type": "rate_limit_error",
    "code": 429
  }
}
```

**How to fix:**
- Implement exponential backoff (wait, then retry with increasing delays)
- Check the `Retry-After` header for how long to wait
- Reduce the frequency of your requests
- See [Rate Limits](rate-limits.md) for detailed limits and best practices
- Contact us for higher limits if your use case requires them

---

## 500 Internal Server Error

An unexpected error occurred on our servers.

**Example:**
```json
{
  "error": {
    "message": "An internal error occurred. Please try again later.",
    "type": "server_error",
    "code": 500
  }
}
```

**How to fix:**
- Retry the request after a short delay (1-5 seconds)
- If the error persists, try a different model
- Check [status.dos.ai](https://status.dos.ai) for any ongoing incidents
- Contact support@dos.ai with the request details if the problem continues

---

## 503 Service Unavailable

The requested model is temporarily unavailable, typically because it is being loaded, updated, or restarted.

**Example:**
```json
{
  "error": {
    "message": "Model is currently unavailable. Please try again shortly.",
    "type": "service_unavailable",
    "code": 503
  }
}
```

**How to fix:**
- Wait 30-60 seconds and retry. Model loading typically completes within a few minutes.
- Try a different model if you need an immediate response
- Check [status.dos.ai](https://status.dos.ai) for maintenance announcements

---

## Best Practices for Error Handling

### Implement Retry Logic

For transient errors (429, 500, 503), implement automatic retries with exponential backoff:

```python
import time
import requests

def call_api_with_retry(url, headers, data, max_retries=3):
    for attempt in range(max_retries):
        response = requests.post(url, headers=headers, json=data)

        if response.status_code == 200:
            return response.json()

        if response.status_code in (429, 500, 503):
            wait_time = 2 ** attempt  # 1s, 2s, 4s
            time.sleep(wait_time)
            continue

        # Non-retryable error
        response.raise_for_status()

    raise Exception("Max retries exceeded")
```

### Log Error Details

Always log the full error response for debugging. The `message` field often contains specific information about what went wrong.

### Validate Before Sending

Validate your request parameters client-side before making API calls to avoid unnecessary 400 errors. Check that:
- The model ID is valid
- Messages array is not empty
- Numeric parameters are within range
- JSON is well-formed
