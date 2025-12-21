# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### 2024-12-20 - Server-Side OAuth Implementation

#### Added
- **Server-side OAuth flow** replacing Firebase client SDK
  - New API routes: `/api/auth/google/start`, `/api/auth/google/callback`
  - New session management routes: `/api/auth/verify-session`, `/api/auth/logout`
  - httpOnly session cookies for enhanced security
  - Performance measurement logging

#### Changed
- **3x faster session verification** (~600ms vs ~1700ms)
- Session cookies now httpOnly, preventing XSS attacks
- OAuth flow no longer depends on Firebase client SDK in production
- Localhost still uses Firebase client SDK for simplicity

#### Fixed
- **Critical**: httpOnly cookies cannot be read by JavaScript
  - Client now sends `credentials: 'include'` for automatic cookie handling
  - Server reads cookies from request headers instead of client sending in body
- **Critical**: Browsers don't store cookies from 307 redirect responses
  - Changed to 200 OK with intermediate HTML page
  - Client-side redirect after 100ms delay ensures cookie is stored
- **Critical**: Turbo.json missing server-side environment variables
  - Added `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `FIREBASE_SERVICE_ACCOUNT`, etc.
  - Without this, Vercel builds couldn't access env vars at runtime

#### Performance Metrics
| Metric | Before (Client SDK) | After (Server-side) | Improvement |
|--------|-------------------|-------------------|-------------|
| Session verification | ~1.7s (`getRedirectResult`) | ~0.6s (cookie verify) | **3x faster** |
| Total OAuth processing | N/A | ~2.3s (callback → dashboard) | Measured |
| Security | localStorage vulnerable | httpOnly cookies | **Much more secure** |

#### Technical Implementation

**OAuth Flow**:
```
User clicks Google
  → /api/auth/google/start
  → Google OAuth UI (user interaction, not measured)
  → /api/auth/google/callback
    - Exchange code for tokens (~800ms)
    - Create Firebase session cookie (~200ms)
    - Return intermediate HTML page
  → Client-side redirect (100ms delay)
  → Dashboard loads
  → /api/auth/verify-session (~600ms)
  → User authenticated ✓
```

**Security**:
- httpOnly cookies (XSS-proof)
- Secure flag (HTTPS-only)
- SameSite=lax (CSRF protection + OAuth compatibility)
- Domain=.dos.ai (cross-subdomain SSO)
- 5-day expiration

#### Files Modified
- `apps/app/src/app/api/auth/google/start/route.ts` - NEW: OAuth initiation
- `apps/app/src/app/api/auth/google/callback/route.ts` - NEW: OAuth callback handler
- `apps/app/src/app/api/auth/verify-session/route.ts` - NEW: Session verification
- `apps/app/src/app/api/auth/logout/route.ts` - NEW: Logout with session revocation
- `apps/app/src/components/auth/AuthContext.tsx` - Server-side OAuth integration
- `apps/app/src/lib/session.ts` - httpOnly cookie handling
- `turbo.json` - Added server-side env vars to build config

#### Documentation
- Created `docs/AUTHENTICATION-ARCHITECTURE.md` - Complete technical documentation

#### Commits
- `034d95b` - perf(auth): Measure OAuth processing time excluding Google UI
- `d956c8c` - perf(auth): Fix OAuth timing measurement using sessionStorage
- `1fdf8d2` - perf(auth): Add performance logging to measure OAuth flow time
- `05a557d` - fix(auth): Fix httpOnly cookie handling in session verification
- `370265a` - fix(auth): Use intermediate page instead of 307 redirect for OAuth callback
- `a0e4d14` - fix(turbo): Add server-side env vars to turbo.json
- `fea495f` - feat(auth): Implement server-side OAuth with NextJS API routes

#### References
- [Next.js Cookie Issue #48434](https://github.com/vercel/next.js/discussions/48434)
- [Better Auth Cookie Issue #2962](https://github.com/better-auth/better-auth/issues/2962)
- [Chromium Cookie Bug #696204](https://bugs.chromium.org/p/chromium/issues/detail?id=696204)
- [Firebase Session Cookies Docs](https://firebase.google.com/docs/auth/admin/manage-cookies)

---

### 2024-12-20 - OAuth Login Flow Optimization

#### Changed
- **Optimized OAuth redirect flow** to reduce perceived loading time
  - Before: User waits 4-5s on `/login` page after OAuth (sessionLogin API call)
  - After: User redirects to dashboard immediately, sees dashboard loading instead

#### Technical Details
- Split session creation into two phases:
  1. `/login`: Get ID token (~1.7s) → redirect to dashboard
  2. Dashboard: Create session cookie in background (4-5s)
- Added performance logging to track OAuth timing:
  - `getRedirectResult()`: ~1700ms (Firebase SDK overhead)
  - `getIdToken()`: ~0ms
- Store ID token in `sessionStorage` for dashboard to process
- Dashboard creates session cookie while showing loading UI

#### Performance Metrics
| Metric | Before | After |
|--------|--------|-------|
| Time on `/login` after OAuth | 4-5s | 1.7s |
| User perception | Stuck on login page | Dashboard loading |
| Total time to dashboard | ~5s | ~6s (but better UX) |

#### Files Modified
- `apps/app/src/components/auth/AuthContext.tsx`
  - Added timing instrumentation
  - Split session creation logic
  - Added `pending_id_token` sessionStorage flag

#### Known Limitations
- `getRedirectResult()` 1.7s overhead cannot be optimized with client-side Firebase SDK
- To eliminate this delay entirely, would need server-side OAuth callback implementation

#### Commits
- `58549b4` - debug: Save timing data to sessionStorage
- `003afb0` - debug: Add performance logging to OAuth redirect flow
- `2b9cbda` - perf(auth): Redirect to dashboard immediately, create session in background
- `dc828de` - revert: Remove /oauth-start page, use simple redirect flow
- `fcb63a5` - fix(auth): Redirect to login on OAuth failure or cancellation
- `c5bad0c` - fix(auth): OAuth redirect to dashboard directly instead of login page
- `406f2ba` - fix(auth): Use sessionStorage flag to track OAuth redirect
- `76e89c6` - fix(auth): Prevent redirect loop by only calling getRedirectResult on login page
- `89a2ae5` - perf(auth): Use lightweight /oauth-start page instead of dashboard

---

## Previous Changes

(To be documented from git history)
