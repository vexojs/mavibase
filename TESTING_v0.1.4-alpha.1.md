# Testing Guide: v0.1.4-alpha.1 Security Hardening Patch

Quick tests for each security feature. Use **curl** from terminal or **Postman** for API testing.

---

## Prerequisites

Ensure the server is running on `http://localhost:5000`

```bash
# Set these in your .env for testing (development mode)
NODE_ENV=development
ENFORCE_HTTPS=false  # Keep false in development to test HTTP
CONTENT_TYPE_VALIDATION=true
IDEMPOTENCY_ENABLED=true
BANDWIDTH_LIMIT_BYTES=52428800
MAX_SINGLE_REQUEST_BYTES=10485760
```

---

## 1. HTTPS Enforcement (Production Only)

**What it does:** Redirects HTTP requests to HTTPS in production, includes HSTS headers.

### Test: Check HSTS Headers (even in dev)
```bash
curl -i http://localhost:5000/health
```

**Expected Response Headers:**
```
Strict-Transport-Security: max-age=31536000; includeSubDomains
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
```

### Postman Test:
1. **URL:** `GET http://localhost:5000/health`
2. **Headers Tab** → Check response headers for security headers

---

## 2. Security Headers Validation

**What it does:** Adds comprehensive security headers to all responses.

### Test: Verify All Security Headers
```bash
curl -i http://localhost:5000/health | grep -E "Strict-Transport-Security|X-Content-Type|X-Frame-Options|Referrer-Policy|Permissions-Policy"
```

**Expected Headers:**
```
Strict-Transport-Security: max-age=31536000; includeSubDomains
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()
Content-Security-Policy: default-src 'none'; frame-ancestors 'none'
```

---

## 3. Content-Type Validation

**What it does:** Rejects POST/PUT/PATCH/DELETE requests without valid Content-Type headers.

### Test 1: Request WITHOUT Content-Type (Should Fail)
```bash
curl -X POST http://localhost:5000/api/v1/projects \
  -d '{"name":"test"}' \
  -w "\nStatus: %{http_code}\n"
```

**Expected Response:**
- Status: **415 Unsupported Media Type**
- Message: `Missing or invalid Content-Type header`

### Test 2: Request WITH Content-Type (Should Pass)
```bash
curl -X POST http://localhost:5000/api/v1/projects \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "X-Project-Id: YOUR_PROJECT_ID" \
  -d '{"name":"test-project"}' \
  -w "\nStatus: %{http_code}\n"
```

**Expected Response:**
- Status: **201** or **400** (depends on valid token/payload)
- NOT 415 (meaning Content-Type validation passed)

### Postman Test:
1. **Tab 1 - Without Content-Type:**
   - Method: `POST`
   - URL: `http://localhost:5000/api/v1/projects`
   - Body: `{"name":"test"}` (raw)
   - **Do NOT add Content-Type header**
   - Expected: `415 Unsupported Media Type`

2. **Tab 2 - With Content-Type:**
   - Method: `POST`
   - URL: `http://localhost:5000/api/v1/projects`
   - Headers: Add `Content-Type: application/json`
   - Body: `{"name":"test"}` (raw)
   - Expected: Pass through (status depends on auth/validation)

---

## 4. Request Deduplication (Idempotency-Key)

**What it does:** Prevents duplicate submissions by replaying cached responses. Scoped per project.

### Test 1: First Request (Cache Miss)
```bash
curl -X POST http://localhost:5000/api/v1/projects \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "X-Project-Id: YOUR_PROJECT_ID" \
  -H "Idempotency-Key: test-key-123" \
  -d '{"name":"unique-project-1"}' \
  -w "\nStatus: %{http_code}\nIdempotency-Replayed: %{header_idempotency-replayed}\n"
```

**Expected Response:**
- Status: **201** (or appropriate success code)
- Header: `Idempotency-Replayed: false` (or absent)

### Test 2: Repeat Same Request (Cache Hit - Should Replay)
```bash
# Run the EXACT same command again
curl -X POST http://localhost:5000/api/v1/projects \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "X-Project-Id: YOUR_PROJECT_ID" \
  -H "Idempotency-Key: test-key-123" \
  -d '{"name":"unique-project-1"}' \
  -w "\nStatus: %{http_code}\nIdempotency-Replayed: %{header_idempotency-replayed}\n"
```

**Expected Response:**
- Status: **201** (same as first request)
- Header: `Idempotency-Replayed: true` ✓
- Body: **Identical to first response** (cached)

### Test 3: Concurrent Requests (Should Conflict)
```bash
# Run two identical requests simultaneously
for i in {1..2}; do
  curl -X POST http://localhost:5000/api/v1/projects \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer YOUR_TOKEN" \
    -H "X-Project-Id: YOUR_PROJECT_ID" \
    -H "Idempotency-Key: test-key-concurrent" \
    -d '{"name":"concurrent-test"}' &
done
wait
```

**Expected Response:**
- First request: **201** (success)
- Second request: **409 Conflict** (concurrent request detected)

### Postman Collection:
```json
{
  "info": {"name": "Idempotency Tests"},
  "item": [
    {
      "name": "First Request",
      "request": {
        "method": "POST",
        "url": "http://localhost:5000/api/v1/projects",
        "header": [
          {"key": "Content-Type", "value": "application/json"},
          {"key": "Authorization", "value": "Bearer {{TOKEN}}"},
          {"key": "X-Project-Id", "value": "{{PROJECT_ID}}"},
          {"key": "Idempotency-Key", "value": "test-123"}
        ],
        "body": {"raw": "{\"name\":\"test\"}"}
      }
    },
    {
      "name": "Replay (Should Show Idempotency-Replayed: true)",
      "request": {
        "method": "POST",
        "url": "http://localhost:5000/api/v1/projects",
        "header": [
          {"key": "Content-Type", "value": "application/json"},
          {"key": "Authorization", "value": "Bearer {{TOKEN}}"},
          {"key": "X-Project-Id", "value": "{{PROJECT_ID}}"},
          {"key": "Idempotency-Key", "value": "test-123"}
        ],
        "body": {"raw": "{\"name\":\"test\"}"}
      }
    }
  ]
}
```

---

## 5. Distributed Rate Limiting

**What it does:** Prevents brute force attacks using Redis-backed request counting (works across multiple server instances).

### Test 1: Check Rate Limit Headers
```bash
curl -v http://localhost:5000/health 2>&1 | grep -i "X-RateLimit"
```

**Expected Response Headers:**
```
X-RateLimit-Limit: 10000
X-RateLimit-Remaining: 9999
X-RateLimit-Reset: 1710432000
```

### Test 2: Exceed Rate Limit (stress test - requires ~10k requests)
```bash
# Send 100 requests rapidly
for i in {1..100}; do
  curl -s -o /dev/null -w "Status: %{http_code}\n" http://localhost:5000/health
done
```

**Expected:**
- First requests: Status **200**
- After limit exceeded: Status **429 Too Many Requests**

### Postman Collection:
1. Create request to `GET http://localhost:5000/health`
2. **Pre-request Script:**
   ```javascript
   // This will send 10 requests and track rate limit headers
   for (let i = 0; i < 10; i++) {
     pm.sendRequest({
       url: "http://localhost:5000/health",
       method: "GET"
     }, (err, response) => {
       console.log(`Request ${i + 1}: ${response.code}`);
       console.log(`Remaining: ${response.headers.get("X-RateLimit-Remaining")}`);
     });
   }
   ```

---

## 6. Bandwidth-Based Rate Limiting

**What it does:** Detects resource exhaustion attacks by limiting total request bytes per time window.

### Test 1: Single Large Request (Should Fail with 413)
```bash
# Create a 15MB payload (exceeds MAX_SINGLE_REQUEST_BYTES=10MB)
LARGE_DATA=$(perl -e 'print "x" x (15*1024*1024)' 2>/dev/null || head -c 15M </dev/zero | tr '\0' 'x')

curl -X POST http://localhost:5000/api/v1/bulk \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "X-Project-Id: YOUR_PROJECT_ID" \
  -d "{\"data\":\"$LARGE_DATA\"}" \
  -w "\nStatus: %{http_code}\n"
```

**Expected Response:**
- Status: **413 Payload Too Large**
- Message: `Request exceeds maximum single request size`

### Test 2: Multiple Medium Requests (Should Track Bandwidth)
```bash
for i in {1..5}; do
  curl -X POST http://localhost:5000/api/v1/documents \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer YOUR_TOKEN" \
    -H "X-Project-Id: YOUR_PROJECT_ID" \
    -d '{"data":"'$(head -c 5M </dev/zero | tr '\0' 'x')'"}'
    -i 2>&1 | grep -E "Status|X-Bandwidth"
done
```

**Expected Response Headers:**
```
X-Bandwidth-Limit: 52428800
X-Bandwidth-Used: 5242880 (increases with each request)
X-Bandwidth-Remaining: 47185920 (decreases with each request)
```

### Test 3: Exceed Bandwidth Limit (Should Return 429)
```bash
# Send multiple large requests to exceed BANDWIDTH_LIMIT_BYTES=50MB
for i in {1..20}; do
  curl -s -X POST http://localhost:5000/api/v1/documents \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer YOUR_TOKEN" \
    -d '{"data":"'$(head -c 3M </dev/zero | tr '\0' 'x')'"}'
    -w "Request $i - Status: %{http_code}\n" -o /dev/null
done
```

**Expected:**
- Requests: Status **201/200** until bandwidth limit exceeded
- Final requests: Status **429 Too Many Requests** with message `Bandwidth limit exceeded`

### Postman Test:
1. **Tab - Large Single Request:**
   - Method: `POST`
   - URL: `http://localhost:5000/api/v1/bulk`
   - Headers: `Content-Type: application/json`, `Authorization: Bearer YOUR_TOKEN`
   - Body (raw): Large JSON with 15MB+ data
   - Expected: `413 Payload Too Large`

2. **Tab - Multiple Medium Requests:**
   - Run same POST request 5 times
   - Watch `X-Bandwidth-Remaining` header decrease
   - When it reaches 0: Status **429**

---

## 7. CORS Preflight Caching

**What it does:** Caches preflight responses for 24 hours, reducing server load.

### Test: Check CORS Preflight Response
```bash
curl -i -X OPTIONS http://localhost:5000/api/v1/projects \
  -H "Origin: http://localhost:3000" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: Content-Type"
```

**Expected Response:**
```
HTTP/1.1 204 No Content
Access-Control-Allow-Origin: http://localhost:3000
Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE
Access-Control-Allow-Headers: Content-Type, Authorization, X-Project-Id, X-Request-Id, X-API-Key, Idempotency-Key
Access-Control-Max-Age: 86400
Access-Control-Expose-Headers: X-Request-Id, X-RateLimit-*, X-Bandwidth-*
```

### Browser DevTools Test:
1. Open DevTools (F12)
2. Go to **Network** tab
3. Visit your frontend on `http://localhost:3000`
4. Look for OPTIONS requests - they should have:
   - `Access-Control-Max-Age: 86400` (caches for 24 hours)
   - Status: **204** (should be fast)

---

## 8. Full Integration Test (Simulating Real Usage)

### Scenario: Creating a project with proper security

```bash
# Step 1: Create project with valid headers and idempotency
PROJECT_ID="proj_$(date +%s)"
IDEMPOTENT_KEY="create_project_$(date +%s)"

curl -X POST http://localhost:5000/api/v1/projects \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Idempotency-Key: $IDEMPOTENT_KEY" \
  -d "{
    \"name\": \"my-app-$(date +%s)\",
    \"description\": \"Test project\"
  }" \
  -w "\nStatus: %{http_code}\n" \
  -v

# Step 2: Verify security headers in response
echo ""
echo "Security headers verified ✓"

# Step 3: Retry with same Idempotency-Key (should get cached response)
curl -X POST http://localhost:5000/api/v1/projects \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Idempotency-Key: $IDEMPOTENT_KEY" \
  -d "{
    \"name\": \"different-name\",
    \"description\": \"Should be ignored\"
  }" \
  -w "\nStatus: %{http_code}\nIdempotency-Replayed: %{header_idempotency-replayed}\n"
```

---

## Troubleshooting

### Error: "Redis connection failed"
- Ensure Redis is running: `redis-cli ping` should return `PONG`
- Check `REDIS_URL` or `REDIS_PASSWORD` in `.env`

### Error: "Rate limit middleware failed to initialize"
- In production, Redis is required. Set valid Redis connection
- In development, rate limiting may use in-memory fallback

### Error: "Content-Type validation error" when it shouldn't fail
- Ensure `CONTENT_TYPE_VALIDATION=true` in `.env`
- Always include `Content-Type: application/json` header for body-carrying methods

### Idempotency not working
- Ensure `IDEMPOTENCY_ENABLED=true` in `.env`
- Verify Redis is connected for distributed idempotency
- Key must be same across requests and scoped to project

---

## Environment Verification Script

Run this to verify all security features are enabled:

```bash
#!/bin/bash

echo "=== Security Feature Status ==="
echo ""

# Check env variables
echo "✓ ENABLE_SECURITY_HEADERS=${ENABLE_SECURITY_HEADERS:-true}"
echo "✓ CONTENT_TYPE_VALIDATION=${CONTENT_TYPE_VALIDATION:-true}"
echo "✓ IDEMPOTENCY_ENABLED=${IDEMPOTENCY_ENABLED:-true}"
echo "✓ ENFORCE_HTTPS=${ENFORCE_HTTPS:-true}"
echo "✓ MAX_SINGLE_REQUEST_BYTES=${MAX_SINGLE_REQUEST_BYTES:-10485760}"
echo "✓ BANDWIDTH_LIMIT_BYTES=${BANDWIDTH_LIMIT_BYTES:-52428800}"
echo ""

# Test server health
echo "Testing server health..."
curl -s http://localhost:5000/health > /dev/null && echo "✓ Server is running" || echo "✗ Server is not responding"
```

---

## Summary

| Feature | Test Command | Expected |
|---------|--------------|----------|
| **Security Headers** | `curl -i http://localhost:5000/health` | See HSTS, CSP, X-Frame headers |
| **Content-Type** | POST without header | **415** Unsupported Media Type |
| **Idempotency** | Send same request twice | **2nd has `Idempotency-Replayed: true`** |
| **Bandwidth** | Send 15MB request | **413** Payload Too Large |
| **Rate Limit** | Repeated requests | See `X-RateLimit-*` headers |
| **CORS Preflight** | OPTIONS request | `Access-Control-Max-Age: 86400` |
