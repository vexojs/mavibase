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
