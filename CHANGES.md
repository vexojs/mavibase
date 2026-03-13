# CHANGES - HTTPS Enforcement Security Fix

> English | [Turkce](./CHANGES.tr.md)

## Issue
**CRITICAL: Missing HTTPS Enforcement**

The application had `ENABLE_SECURITY_HEADERS` and `HSTS_MAX_AGE` defined in `.env.example` but they were not implemented in the middleware. This left the API vulnerable to:
- Tokens transmitted in plaintext over HTTP
- Man-in-the-middle attacks on API keys
- Missing HSTS headers allowing protocol downgrade attacks

---

## Files Changed

| File | Change Type | Description |
|------|-------------|-------------|
| `packages/platform/src/middleware/security-headers.ts` | **Added** | New middleware implementing HTTPS enforcement, HSTS, and security headers |
| `packages/platform/src/middleware/index.ts` | **Modified** | Integrated security headers middleware into the middleware chain |
| `.env.example` | **Modified** | Added new configuration options for HTTPS enforcement |

---

## New Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `ENFORCE_HTTPS` | `true` | Redirect HTTP to HTTPS (production only) |
| `ENABLE_SECURITY_HEADERS` | `true` | Enable/disable all security headers |
| `HSTS_MAX_AGE` | `31536000` | HSTS max-age in seconds (1 year) |
| `HSTS_INCLUDE_SUBDOMAINS` | `true` | Include subdomains in HSTS policy |
| `HSTS_PRELOAD` | `false` | Enable HSTS preload (requires domain submission) |
| `CSP_DIRECTIVES` | (restrictive default) | Custom Content Security Policy |

---

## Security Headers Implemented

1. **HTTPS Enforcement** - Redirects all HTTP requests to HTTPS in production
2. **Strict-Transport-Security (HSTS)** - Forces browsers to use HTTPS for future requests
3. **X-Content-Type-Options** - Prevents MIME type sniffing
4. **X-Frame-Options** - Prevents clickjacking attacks
5. **X-XSS-Protection** - Enables XSS filtering in legacy browsers
6. **Referrer-Policy** - Controls referrer information leakage
7. **Permissions-Policy** - Disables unnecessary browser features
8. **Content-Security-Policy** - Restrictive CSP for API responses
9. **X-DNS-Prefetch-Control** - Disables DNS prefetching
10. **X-Download-Options** - Prevents IE from executing downloads
11. **X-Permitted-Cross-Domain-Policies** - Restricts Adobe Flash/PDF policies

---

## Expected Behavior

### In Development (`NODE_ENV=development`)
- HTTPS enforcement is **disabled** (allows HTTP for local development)
- Security headers are still applied
- HSTS header is only set on HTTPS requests

### In Production (`NODE_ENV=production`)
- All HTTP requests are **redirected to HTTPS** (301 redirect)
- HSTS header is set on all responses
- Full security headers are applied

### Health Check Endpoints
- `/health`, `/live`, `/ready` endpoints skip HTTPS redirect to allow monitoring tools

---

## How to Verify

### 1. Check HTTPS Redirect (Production)
```bash
# Should return 301 redirect to HTTPS
curl -I http://your-domain.com/api/v1/health
```

### 2. Check Security Headers
```bash
# Should show all security headers including HSTS
curl -I https://your-domain.com/api/v1/health
```

Expected headers in response:
```
Strict-Transport-Security: max-age=31536000; includeSubDomains
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Referrer-Policy: strict-origin-when-cross-origin
Content-Security-Policy: default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'
```

### 3. Test in Browser DevTools
1. Open DevTools > Network tab
2. Make any API request
3. Check Response Headers for security headers

---

## Commit Messages

```
feat(platform): add HTTPS enforcement middleware

fix(platform): integrate security headers into middleware chain

docs: add HTTPS enforcement configuration to .env.example
```

---

# CHANGES - CORS Preflight Caching Fix

## Issue
**HIGH: Missing CORS Preflight Caching**

CORS preflight (OPTIONS) requests were not being cached by browsers, causing every cross-origin request to hit the server twice (preflight + actual request). This created:
- Unnecessary server load and DDoS vulnerability
- Increased latency for API requests
- Missing explicit `allowedHeaders` and `exposedHeaders` configuration

---

## Files Changed

| File | Change Type | Description |
|------|-------------|-------------|
| `packages/platform/src/middleware/index.ts` | **Modified** | Added `maxAge`, `allowedHeaders`, and `exposedHeaders` to CORS config |
| `.env.example` | **Modified** | Added `CORS_MAX_AGE` configuration option |

---

## New Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `CORS_MAX_AGE` | `86400` | Preflight cache duration in seconds (24 hours) |

---

## CORS Configuration Changes

### Before
```typescript
cors({
  origin: allowedOrigins,
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
})
```

### After
```typescript
cors({
  origin: allowedOrigins,
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Project-Id", "X-Request-Id", "X-API-Key"],
  exposedHeaders: ["X-Request-Id", "X-RateLimit-Limit", "X-RateLimit-Remaining", "X-RateLimit-Reset"],
  maxAge: 86400, // Browser caches preflight for 24 hours
})
```

---

## Expected Behavior

### Preflight Caching
- Browser sends OPTIONS request only once per unique origin/method/headers combination
- Subsequent requests within 24 hours skip preflight entirely
- Reduces server load by ~50% for cross-origin API calls

### Allowed Headers
Clients can now send these headers without triggering additional preflight:
- `Content-Type` - JSON/form data
- `Authorization` - Bearer tokens
- `X-Project-Id` - Project identification
- `X-Request-Id` - Request tracing
- `X-API-Key` - API key authentication

### Exposed Headers
Clients can read these headers from responses:
- `X-Request-Id` - For debugging/tracing
- `X-RateLimit-*` - Rate limit information

---

## How to Verify

### 1. Check Preflight Response Headers
```bash
curl -I -X OPTIONS https://your-domain.com/api/v1/databases \
  -H "Origin: https://console.yourdomain.com" \
  -H "Access-Control-Request-Method: POST"
```

Expected response includes:
```
Access-Control-Max-Age: 86400
Access-Control-Allow-Headers: Content-Type, Authorization, X-Project-Id, X-Request-Id, X-API-Key
Access-Control-Expose-Headers: X-Request-Id, X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset
```

### 2. Browser DevTools
1. Open DevTools > Network tab
2. Make a cross-origin POST request
3. First time: You'll see OPTIONS + POST
4. Second time (within 24h): Only POST (preflight cached)

---

## Commit Messages

```
fix(platform): add CORS preflight caching with maxAge

docs: add CORS_MAX_AGE configuration to .env.example
```

---

# CHANGES - Content-Type Validation Fix

## Issue
**HIGH: No Content-Type Validation (Content Confusion Attack)**

The API accepted requests without validating the Content-Type header on body-carrying requests (POST, PUT, PATCH, DELETE). This vulnerability allowed:
- Content confusion attacks where malformed content types could bypass security filters
- Potential for parsing issues when incorrect content types are sent
- Missing early rejection of invalid requests before body parsing

---

## Files Changed

| File | Change Type | Description |
|------|-------------|-------------|
| `packages/platform/src/middleware/content-type-validator.ts` | **Added** | New middleware implementing Content-Type validation |
| `packages/platform/src/middleware/index.ts` | **Modified** | Integrated content-type validator into the middleware chain |
| `.env.example` | **Modified** | Added Content-Type validation configuration options |

---

## New Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `CONTENT_TYPE_VALIDATION` | `true` | Enable/disable Content-Type validation |
| `ALLOWED_CONTENT_TYPES` | `application/json` | Comma-separated list of allowed content types |

---

## Content-Type Validation Features

1. **Strict Validation** - Rejects requests with missing or invalid Content-Type on POST/PUT/PATCH/DELETE
2. **Charset Support** - Handles Content-Type with parameters (e.g., `application/json; charset=utf-8`)
3. **Empty Body Handling** - Allows requests with `Content-Length: 0` or no body
4. **Health Check Bypass** - Skips validation for `/health`, `/live`, `/ready`, `/metrics` endpoints
5. **Configurable Types** - Allowed content types can be configured via environment variable
6. **HTTP 415 Response** - Returns proper "Unsupported Media Type" status code for invalid types

---

## Expected Behavior

### Valid Requests (Accepted)
```bash
# JSON content type
curl -X POST https://api.domain.com/api/v1/databases \
  -H "Content-Type: application/json" \
  -d '{"name": "test"}'

# JSON with charset
curl -X POST https://api.domain.com/api/v1/databases \
  -H "Content-Type: application/json; charset=utf-8" \
  -d '{"name": "test"}'

# GET request (no body)
curl https://api.domain.com/api/v1/databases
```

### Invalid Requests (Rejected with 415)
```bash
# Missing Content-Type
curl -X POST https://api.domain.com/api/v1/databases \
  -d '{"name": "test"}'

# Wrong Content-Type
curl -X POST https://api.domain.com/api/v1/databases \
  -H "Content-Type: text/plain" \
  -d '{"name": "test"}'
```

### Error Response Format
```json
{
  "error": {
    "code": "UNSUPPORTED_MEDIA_TYPE",
    "message": "Content-Type must be one of: application/json",
    "received": "text/plain"
  }
}
```

---

## How to Verify

### 1. Test Missing Content-Type
```bash
curl -X POST https://your-domain.com/api/v1/databases \
  -d '{"name": "test"}'
# Expected: 415 Unsupported Media Type
```

### 2. Test Invalid Content-Type
```bash
curl -X POST https://your-domain.com/api/v1/databases \
  -H "Content-Type: text/html" \
  -d '{"name": "test"}'
# Expected: 415 Unsupported Media Type
```

### 3. Test Valid Content-Type
```bash
curl -X POST https://your-domain.com/api/v1/databases \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"name": "test"}'
# Expected: 200 OK (or appropriate response)
```

---

## Commit Messages

```
feat(platform): add Content-Type validation middleware

fix(platform): integrate content-type validator into middleware chain

docs: add Content-Type validation configuration to .env.example
```

---

# CHANGES - Distributed Rate Limit Bypass Fix

## Issue
**MEDIUM: Distributed Rate Limit Bypass**

Rate limiting was using in-memory store instead of Redis, allowing attackers to bypass rate limits by distributing requests across multiple server instances. This vulnerability allowed:
- Credential stuffing attacks distributed across instances
- API abuse by sending requests to different backend servers
- Brute force attacks that reset on server restarts

---

## Files Changed

| File | Change Type | Description |
|------|-------------|-------------|
| `packages/api/src/middleware/rate-limiter.ts` | **Modified** | Added RedisStore for distributed rate limiting |
| `packages/platform/src/middleware/rate-limiter.ts` | **Modified** | Added RedisStore for both general and auth rate limiters |
| `packages/api/package.json` | **Modified** | Added `rate-limit-redis` dependency |
| `packages/platform/package.json` | **Modified** | Added `rate-limit-redis` dependency |

---

## Dependencies Added

| Package | Version | Description |
|---------|---------|-------------|
| `rate-limit-redis` | `^4.2.0` | Redis store adapter for express-rate-limit |

---

## Security Features Implemented

1. **Redis-backed Rate Limiting** - All rate limit counters stored in Redis, shared across instances
2. **Production Enforcement** - Application fails to start in production without Redis connection
3. **Separate Auth Store** - Authentication rate limits use separate Redis prefix to avoid conflicts
4. **Distributed Counter Sync** - All server instances share the same rate limit state
5. **Health Check Export** - `isDistributedRateLimiting()` function for monitoring

---

## Rate Limiting Architecture

### Before (Vulnerable)
```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Instance 1 │     │  Instance 2 │     │  Instance 3 │
│  Memory: 50 │     │  Memory: 50 │     │  Memory: 50 │
└─────────────┘     └─────────────┘     └─────────────┘
     ↑                    ↑                    ↑
     └────────────────────┼────────────────────┘
                    Attacker: 150 requests
                    (50 per instance = bypass!)
```

### After (Secure)
```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Instance 1 │     │  Instance 2 │     │  Instance 3 │
└──────┬──────┘     └──────┬──────┘     └──────┬──────┘
       │                   │                   │
       └───────────────────┼───────────────────┘
                           ▼
                    ┌─────────────┐
                    │    Redis    │
                    │  Counter: 150│
                    └─────────────┘
                    Rate limit: EXCEEDED!
```

---

## Redis Key Prefixes

| Prefix | Purpose |
|--------|---------|
| `rl:api:` | API rate limits (per-project) |
| `rl:platform:` | Platform general rate limits |
| `rl:auth:` | Authentication rate limits (stricter) |

---

## Expected Behavior

### In Development (`NODE_ENV=development`)
- Rate limiting is **skipped** entirely
- Redis connection is optional (falls back to memory with warning)

### In Production (`NODE_ENV=production`)
- Redis is **REQUIRED** - application throws fatal error without it
- All rate limits are distributed across instances
- Counters persist across deployments (until TTL expires)

---

## How to Verify

### 1. Check Redis Connection on Startup
```bash
# Logs should show:
# "Redis store initialized for distributed rate limiting"
```

### 2. Test Rate Limit Persistence
```bash
# Send requests to different instances (if load balanced)
# Rate limit should trigger after the SAME total count
for i in {1..101}; do
  curl -s -o /dev/null -w "%{http_code}\n" https://api.domain.com/api/v1/databases
done
# 100 requests: 200 OK
# 101st request: 429 Too Many Requests
```

### 3. Check Redis Keys
```bash
redis-cli KEYS "rl:*"
# Should show rate limit keys like:
# rl:api:<project-id>
# rl:platform:<ip>
# rl:auth:<ip>
```

### 4. Health Check
```typescript
import { isDistributedRateLimiting } from "./middleware/rate-limiter"

if (!isDistributedRateLimiting()) {
  logger.warn("Rate limiting is NOT distributed - security risk!")
}
```

---

## Error on Missing Redis (Production)

```
Error: FATAL: Redis is required for rate limiting in production. 
Without distributed rate limiting, attackers can bypass limits. 
Set REDIS_URL environment variable or disable rate limiting explicitly.
```

---

## Commit Messages

```
fix(api): add Redis store for distributed rate limiting

fix(platform): add Redis store for distributed rate limiting

deps: add rate-limit-redis package for distributed rate limiting
```

---

# CHANGES - Request Deduplication Fix

## Issue
**MEDIUM: No Request Deduplication**

Identical rapid requests weren't deduplicated. If a user clicks a button twice, two API calls would go through, potentially causing:
- Duplicate database entries
- Double-charging in payment scenarios
- Race conditions with conflicting updates
- Wasted server resources processing identical requests

---

## Files Changed

| File | Change Type | Description |
|------|-------------|-------------|
| `packages/platform/src/middleware/idempotency.ts` | **Added** | New middleware for request deduplication using Idempotency-Key header |
| `packages/platform/src/middleware/index.ts` | **Modified** | Integrated idempotency middleware into the middleware chain |
| `.env.example` | **Modified** | Added idempotency configuration options |

---

## New Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `IDEMPOTENCY_ENABLED` | `true` | Enable/disable idempotency checking |
| `IDEMPOTENCY_TTL` | `3600` | Cache TTL in seconds (default: 1 hour) |
| `IDEMPOTENCY_KEY_PREFIX` | `idempotency` | Redis key prefix |

---

## Idempotency Features Implemented

1. **UUID Validation** - Idempotency-Key must be a valid UUID v4 format
2. **Project Scoping** - Keys are scoped per-project to prevent collisions
3. **In-Flight Protection** - Returns 409 Conflict if same key is being processed
4. **Response Caching** - Caches successful (2xx) responses for replay
5. **Header Replay** - Restores original response headers on replay
6. **Graceful Degradation** - Skips idempotency if Redis unavailable (with warning)
7. **Backward Compatible** - Requests without Idempotency-Key work normally

---

## How It Works

### First Request
```
Client                          Server                         Redis
  │                                │                              │
  │─── POST /api/v1/databases ────>│                              │
  │    Idempotency-Key: abc-123    │                              │
  │                                │─── SET idempotency:abc-123 ──>│
  │                                │    status: "processing"       │
  │                                │                              │
  │                                │ (process request)            │
  │                                │                              │
  │                                │─── SET idempotency:abc-123 ──>│
  │                                │    status: "completed"        │
  │                                │    response: {...}            │
  │<────── 201 Created ────────────│                              │
```

### Duplicate Request (Replayed)
```
Client                          Server                         Redis
  │                                │                              │
  │─── POST /api/v1/databases ────>│                              │
  │    Idempotency-Key: abc-123    │                              │
  │                                │─── GET idempotency:abc-123 ──>│
  │                                │<── {status: "completed"} ─────│
  │                                │                              │
  │<─ 201 Created (from cache) ────│                              │
  │   Idempotency-Replayed: true   │                              │
```

---

## Redis Key Format

```
idempotency:<project_id>:<idempotency_key>
```

Example: `idempotency:proj_abc123:550e8400-e29b-41d4-a716-446655440000`

---

## Expected Behavior

### Valid Request with Idempotency-Key
```bash
curl -X POST https://api.domain.com/api/v1/databases \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -H "Idempotency-Key: 550e8400-e29b-41d4-a716-446655440000" \
  -d '{"name": "my-database"}'
# First call: 201 Created
# Second call (same key): 201 Created (cached), Idempotency-Replayed: true
```

### Invalid Idempotency-Key Format
```bash
curl -X POST https://api.domain.com/api/v1/databases \
  -H "Idempotency-Key: not-a-uuid" \
  -d '{"name": "test"}'
# Returns: 400 Bad Request
# {"error": {"code": "INVALID_IDEMPOTENCY_KEY", "message": "Idempotency-Key must be a valid UUID v4"}}
```

### Concurrent Request with Same Key
```bash
# If another request with same key is being processed:
# Returns: 409 Conflict
# {"error": {"code": "IDEMPOTENCY_KEY_IN_USE", "message": "A request with this Idempotency-Key is currently being processed"}}
```

---

## Client Implementation Example

```typescript
// Generate unique key per operation
const idempotencyKey = crypto.randomUUID()

const response = await fetch('/api/v1/databases', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Idempotency-Key': idempotencyKey,
  },
  body: JSON.stringify({ name: 'my-database' }),
})

// Check if response was replayed
if (response.headers.get('Idempotency-Replayed') === 'true') {
  console.log('Request was deduplicated')
}
```

---

## Commit Messages

```
feat(platform): add idempotency middleware for request deduplication

fix(platform): integrate idempotency middleware into middleware chain

docs: add idempotency configuration to .env.example
```

---

# CHANGES - Request Size Spike Detection Fix

## Issue
**LOW: No Request Size Spike Detection**

Rate limiting was request-count based only, not bandwidth-based. An attacker could exploit this by sending large payloads:
- Normal user: 100 requests x 1KB = 100KB total
- Attacker: 100 requests x 10MB = 1GB total (same request count, 10,000x bandwidth)

This allows resource exhaustion attacks while staying under request count limits.

---

## Files Changed

| File | Change Type | Description |
|------|-------------|-------------|
| `packages/platform/src/middleware/bandwidth-limiter.ts` | **Added** | New middleware for bandwidth-based rate limiting and spike detection |
| `packages/platform/src/middleware/index.ts` | **Modified** | Integrated bandwidth limiter after request-count rate limiter |
| `.env.example` | **Modified** | Added bandwidth limiting configuration options |

---

## New Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `BANDWIDTH_LIMIT_BYTES` | `52428800` (50MB) | Maximum bytes allowed per window |
| `BANDWIDTH_WINDOW_SECONDS` | `60` | Window size in seconds |
| `MAX_SINGLE_REQUEST_BYTES` | `10485760` (10MB) | Maximum single request size (spike detection) |
| `BANDWIDTH_INCLUDE_RESPONSE` | `false` | Include response size in bandwidth calculation |
| `BANDWIDTH_KEY_PREFIX` | `bw` | Redis key prefix |

---

## Features Implemented

1. **Single Request Spike Detection** - Rejects requests larger than `MAX_SINGLE_REQUEST_BYTES` (works without Redis)
2. **Bandwidth-Based Rate Limiting** - Tracks total bytes per time window using Redis
3. **Per-Identity Tracking** - Tracks by Project ID > User ID > IP Address (in priority order)
4. **Response Headers** - Exposes `X-Bandwidth-Limit`, `X-Bandwidth-Used`, `X-Bandwidth-Remaining`
5. **Optional Response Tracking** - Can include response size in bandwidth calculation
6. **Strict Limiter Variant** - `strictBandwidthLimiter` for sensitive endpoints (1MB/request, 10MB/window)

---

## Two-Layer Protection

### Layer 1: Single Request Spike (No Redis Required)
```
Request 10MB body → 413 REQUEST_TOO_LARGE (blocked immediately)
```

### Layer 2: Cumulative Bandwidth (Requires Redis)
```
Request 1: 5MB  → 200 OK (5MB used)
Request 2: 5MB  → 200 OK (10MB used)
...
Request 11: 5MB → 429 BANDWIDTH_LIMIT_EXCEEDED (55MB > 50MB limit)
```

---

## Expected Behavior

### Single Request Too Large
```bash
curl -X POST https://api.domain.com/api/v1/databases \
  -H "Content-Type: application/json" \
  -d @large-15mb-file.json
# Returns: 413 Payload Too Large
# {
#   "error": {
#     "code": "REQUEST_TOO_LARGE",
#     "message": "Request body exceeds maximum allowed size of 10MB",
#     "received": "15MB",
#     "limit": "10MB"
#   }
# }
```

### Bandwidth Limit Exceeded
```bash
# After sending 50MB+ in the current window:
# Returns: 429 Too Many Requests
# {
#   "error": {
#     "code": "BANDWIDTH_LIMIT_EXCEEDED",
#     "message": "Bandwidth limit of 50MB per 60 seconds exceeded",
#     "used": "52.5MB",
#     "limit": "50MB",
#     "retryAfter": 45
#   }
# }
```

### Response Headers
```
X-Bandwidth-Limit: 52428800
X-Bandwidth-Used: 10485760
X-Bandwidth-Remaining: 41943040
```

---

## Redis Key Format

```
bw:<identifier>:<window_timestamp>
```

Examples:
- `bw:proj:proj_abc123:1710345600` - Project-scoped
- `bw:user:user_xyz789:1710345600` - User-scoped
- `bw:ip:192.168.1.1:1710345600` - IP-scoped (fallback)

---

## Commit Messages

```
feat(platform): add bandwidth-based rate limiting middleware

fix(platform): integrate bandwidth limiter into middleware chain

docs: add bandwidth limiting configuration to .env.example
```
