# Guardrails

Guardrails let DOS AI inspect a request for sensitive data **before** it reaches the model. Version 1 is **deterministic PII detection** (email, phone, and payment-card numbers) applied to the input of your request. It is **opt-in per request** via a single header, so it never adds latency or blocks anything unless you ask for it.

This is useful when you want to keep personal data out of model prompts for privacy or compliance reasons - for example, masking customer emails and phone numbers before a request is logged or sent upstream.

## How it works

Send the `X-DOS-Guardrails` header on a [Chat Completions](chat-completions.md) (or Completions) request and set it to the action you want:

| `X-DOS-Guardrails` | Behavior when PII is detected in the input |
| ------------------ | ------------------------------------------ |
| `block` | The request is rejected with `400 guardrails_blocked`. No upstream call is made and no credits are spent. |
| `redact` | The detected PII is replaced with a placeholder (such as `[REDACTED_EMAIL]`) before the request is sent to the model. The request proceeds normally. |
| `flag` | The request passes through **unchanged**. When PII is detected, the `X-DOS-Guardrails: flag` response header is set and the detection is logged, so you can monitor without blocking. |
| *(omitted, or `off`)* | Guardrails are off. This is the default. |

When guardrails detect PII and run an action, the response carries the header `X-DOS-Guardrails: <action>`. If no PII is found, the request proceeds as normal and no header is added - even if you sent one.

## What gets detected

| Category | What it matches |
| -------- | --------------- |
| `pii.email` | Email addresses. |
| `pii.phone` | Phone numbers - Vietnamese local format (`0` followed by 9 digits) and international E.164 (`+<country code><number>`). |
| `pii.card` | Payment-card numbers (13-19 digits). Each candidate is validated with the **Luhn checksum** before it is flagged, which avoids false positives on ordinary number sequences. |

Detection is applied to:

- **Chat Completions** - every `messages[].content`, including the `text` parts of multimodal (array) content.
- **Completions** - the top-level `prompt` (string or array of strings).

Guardrails run on the **input** you send (output is not filtered in v1), and they run **before caching**, so a redacted request is what gets cached and sent upstream.

## Examples

### Block requests that contain PII

```bash
curl https://api.dos.ai/v1/chat/completions \
  -H "Authorization: Bearer dos_sk_your_key" \
  -H "Content-Type: application/json" \
  -H "X-DOS-Guardrails: block" \
  -d '{
    "model": "dos-ai",
    "messages": [
      {"role": "user", "content": "My email is jane@example.com - summarize my account."}
    ]
  }'
```

Because the input contains an email address, the request is rejected:

```json
{
  "error": {
    "message": "Request blocked by guardrails: sensitive data (PII) detected in the input.",
    "type": "guardrails_blocked"
  }
}
```

### Redact PII and let the request through

```bash
curl https://api.dos.ai/v1/chat/completions \
  -H "Authorization: Bearer dos_sk_your_key" \
  -H "Content-Type: application/json" \
  -H "X-DOS-Guardrails: redact" \
  -d '{
    "model": "dos-ai",
    "messages": [
      {"role": "user", "content": "Email jane@example.com, phone 0901234567 - draft a reply."}
    ]
  }'
```

The model receives `Email [REDACTED_EMAIL], phone [REDACTED_PHONE] - draft a reply.`, and the response includes the header `X-DOS-Guardrails: redact`.

## Notes

- **Opt-in.** Guardrails never run unless you send the `X-DOS-Guardrails` header, so existing integrations are unaffected.
- **Choose the right action.** Use `block` for the strongest guarantee that PII never reaches the model, `redact` to keep the request useful while masking sensitive values, or `flag` to monitor only.
- **v1 scope.** This release is deterministic PII detection on the input. LLM-powered content safety (categories such as hate or violence) and output-side filtering are planned follow-ups.
- See [Error Codes](../support/error-codes.md) for the `guardrails_blocked` response.
