# v0.1.4-alpha.1

> English | [Turkce](./CHANGES.tr.md)

**Release Date:** March 13, 2026

This patch focuses on security hardening across the Mavibase platform. Several critical vulnerabilities have been addressed including HTTPS enforcement, Content-Type validation, distributed rate limiting, request deduplication, and bandwidth-based spike detection. These changes significantly improve the security posture of production deployments.

> [!IMPORTANT]
> **Self-Hosted / Docker / Repository Clone Users:** This release adds new dependencies (`rate-limit-redis`). You must re-install dependencies after updating:
> ```bash
> # npm
> npm install
> 
> # pnpm
> pnpm install
> 
> # yarn
> yarn install
> 
> # Docker
> docker-compose build --no-cache
> ```

---

## Added

* Added comprehensive security headers middleware with HTTPS enforcement for production environments.

  * Redirects all HTTP requests to HTTPS in production (configurable via `ENFORCE_HTTPS`).
  * Implements Strict-Transport-Security (HSTS) with configurable max-age, includeSubDomains, and preload options.
  * Sets X-Content-Type-Options, X-Frame-Options, X-XSS-Protection, Referrer-Policy, and Permissions-Policy headers.
  * Adds restrictive Content-Security-Policy for API responses.
  * Includes X-DNS-Prefetch-Control, X-Download-Options, and X-Permitted-Cross-Domain-Policies headers.

* Added Content-Type validation middleware to prevent content confusion attacks.

  * Rejects POST/PUT/PATCH/DELETE requests with missing or invalid Content-Type headers.
  * Returns HTTP 415 (Unsupported Media Type) for invalid types.
  * Supports charset parameters (e.g., `application/json; charset=utf-8`).
  * Configurable allowed types via `ALLOWED_CONTENT_TYPES` environment variable.
  * Bypasses validation for health check endpoints (`/health`, `/live`, `/ready`, `/metrics`).

* Added request deduplication via Idempotency-Key header support.

  * Prevents duplicate submissions when users click buttons multiple times.
  * Caches successful (2xx) responses for replay with `Idempotency-Replayed: true` header.
  * Returns 409 Conflict for concurrent requests with the same idempotency key.
  * Keys are scoped per-project to prevent collisions.
  * Configurable TTL via `IDEMPOTENCY_TTL` environment variable (default: 1 hour).

* Added bandwidth-based rate limiting for request size spike detection.

  * Layer 1: Rejects single requests exceeding `MAX_SINGLE_REQUEST_BYTES` (default: 10MB) with HTTP 413.
  * Layer 2: Tracks cumulative bytes per time window using Redis, returns HTTP 429 when exceeded.
  * Exposes `X-Bandwidth-Limit`, `X-Bandwidth-Used`, `X-Bandwidth-Remaining` response headers.
  * Prevents resource exhaustion attacks where attackers send large payloads while staying under request count limits.

* Added Turkish language support for documentation.

---

## Security Fixes

* **CRITICAL: HTTPS Enforcement** - Fixed missing HTTPS redirect in production. Tokens were previously transmitted in plaintext over HTTP, allowing man-in-the-middle attacks.

* **HIGH: CORS Preflight Caching** - Added `maxAge: 86400` to CORS configuration. Preflight requests are now cached for 24 hours, reducing server load by ~50% for cross-origin API calls.

* **HIGH: Content-Type Validation** - API now rejects requests without valid Content-Type headers on body-carrying methods, preventing content confusion attacks.

* **MEDIUM: Distributed Rate Limiting** - Rate limiting now uses Redis instead of in-memory storage. Attackers can no longer bypass limits by distributing requests across multiple server instances.

* **MEDIUM: Request Deduplication** - Identical rapid requests are now deduplicated using Idempotency-Key headers, preventing duplicate database entries and double-charging scenarios.

* **LOW: Request Size Spike Detection** - Added bandwidth-based rate limiting alongside request-count limits to prevent resource exhaustion via large payloads.

---

## Platform Improvements

* Enhanced CORS configuration with explicit `allowedHeaders` and `exposedHeaders`.

  * Allowed headers: `Content-Type`, `Authorization`, `X-Project-Id`, `X-Request-Id`, `X-API-Key`, `Idempotency-Key`.
  * Exposed headers: `X-Request-Id`, `X-RateLimit-*`, `X-Bandwidth-*`, `Idempotency-Replayed`.

* Rate limiters now require Redis in production and will fail to start without a valid connection.

  * Uses separate Redis key prefixes: `rl:api:`, `rl:platform:`, `rl:auth:`.
  * Exports `isDistributedRateLimiting()` function for health monitoring.

* Middleware chain order optimized for security:

  1. HTTPS Enforcement (before anything else)
  2. Security Headers
  3. CORS
  4. Content-Type Validation
  5. Body Parsing
  6. Rate Limiting (request count)
  7. Bandwidth Limiting (bytes)
  8. Idempotency

---

## New Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `ENFORCE_HTTPS` | `true` | Redirect HTTP to HTTPS in production |
| `ENABLE_SECURITY_HEADERS` | `true` | Enable all security headers |
| `HSTS_MAX_AGE` | `31536000` | HSTS max-age in seconds (1 year) |
| `HSTS_INCLUDE_SUBDOMAINS` | `true` | Include subdomains in HSTS |
| `HSTS_PRELOAD` | `false` | Enable HSTS preload |
| `CSP_DIRECTIVES` | (restrictive) | Custom Content Security Policy |
| `CORS_MAX_AGE` | `86400` | Preflight cache duration (24 hours) |
| `CONTENT_TYPE_VALIDATION` | `true` | Enable Content-Type validation |
| `ALLOWED_CONTENT_TYPES` | `application/json` | Comma-separated allowed types |
| `IDEMPOTENCY_ENABLED` | `true` | Enable request deduplication |
| `IDEMPOTENCY_TTL` | `3600` | Idempotency cache TTL (1 hour) |
| `BANDWIDTH_LIMIT_BYTES` | `52428800` | Max bytes per window (50MB) |
| `BANDWIDTH_WINDOW_SECONDS` | `60` | Bandwidth window size |
| `MAX_SINGLE_REQUEST_BYTES` | `10485760` | Max single request size (10MB) |

---

## Dependencies Added

| Package | Version | Packages |
|---------|---------|----------|
| `rate-limit-redis` | `^4.2.0` | `@mavibase/api`, `@mavibase/platform` |

---

## Files Changed

### Added
* `packages/platform/src/middleware/security-headers.ts`
* `packages/platform/src/middleware/content-type-validator.ts`
* `packages/platform/src/middleware/idempotency.ts`
* `packages/platform/src/middleware/bandwidth-limiter.ts`
* `CHANGES.tr.md`

### Modified
* `packages/platform/src/middleware/index.ts`
* `packages/platform/src/middleware/rate-limiter.ts`
* `packages/api/src/middleware/rate-limiter.ts`
* `packages/platform/package.json`
* `packages/api/package.json`
* `.env.example`
