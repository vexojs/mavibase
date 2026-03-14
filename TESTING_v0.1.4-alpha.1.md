# Testing Guide: v0.1.4-alpha.1 Security Hardening Patch

Quick tests for each security feature using **Browser Console (F12)** or **Postman**.

---

## QUICK START - Full Production Test Script (F12 Console)

Copy and paste this entire script into your browser console (F12):

```javascript
// ================================================
// v0.1.4-alpha.1 PRODUCTION Security Test Suite
// ================================================
// Run this in F12 console on your dashboard (localhost:3000)

async function runProductionSecurityTest() {
  const BASE_URL = 'http://localhost:5000';
  const results = [];
  
  console.log('');
  console.log('================================================');
  console.log('   v0.1.4-alpha.1 PRODUCTION Security Test');
  console.log('================================================');
  console.log('   Target:', BASE_URL);
  console.log('   Time:', new Date().toISOString());
  console.log('================================================\n');

  // ----------------------------------------
  // Test 1: Security Headers
  // ----------------------------------------
  console.log('1. Testing Security Headers...');
  try {
    const res = await fetch(`${BASE_URL}/health`);
    const hsts = res.headers.get('Strict-Transport-Security');
    const xframe = res.headers.get('X-Frame-Options');
    const xcontent = res.headers.get('X-Content-Type-Options');
    const xss = res.headers.get('X-XSS-Protection');
    
    const pass = !!hsts && !!xframe && !!xcontent;
    results.push({ test: 'Security Headers', pass, details: { hsts, xframe, xcontent, xss } });
    
    console.log('   Strict-Transport-Security:', hsts || 'MISSING');
    console.log('   X-Frame-Options:', xframe || 'MISSING');
    console.log('   X-Content-Type-Options:', xcontent || 'MISSING');
    console.log('   X-XSS-Protection:', xss || 'MISSING');
    console.log('   Result:', pass ? 'PASS' : 'FAIL');
  } catch (e) {
    results.push({ test: 'Security Headers', pass: false, error: e.message });
    console.log('   Error:', e.message);
  }

  // ----------------------------------------
  // Test 2: Content-Type Validation
  // ----------------------------------------
  console.log('\n2. Testing Content-Type Validation...');
  try {
    const res = await fetch(`${BASE_URL}/api/v1/projects`, {
      method: 'POST',
      body: '{"name":"test"}'
      // No Content-Type header - should return 415
    });
    const pass = res.status === 415;
    results.push({ test: 'Content-Type Validation', pass, status: res.status });
    
    console.log('   Status:', res.status, res.statusText);
    console.log('   Expected: 415 Unsupported Media Type');
    console.log('   Result:', pass ? 'PASS' : 'FAIL');
  } catch (e) {
    results.push({ test: 'Content-Type Validation', pass: false, error: e.message });
    console.log('   Error:', e.message);
  }

  // ----------------------------------------
  // Test 3: Rate Limit Headers
  // ----------------------------------------
  console.log('\n3. Testing Rate Limit Headers...');
  try {
    const res = await fetch(`${BASE_URL}/health`);
    const limit = res.headers.get('X-RateLimit-Limit');
    const remaining = res.headers.get('X-RateLimit-Remaining');
    const reset = res.headers.get('X-RateLimit-Reset');
    
    const pass = !!limit && !!remaining;
    results.push({ test: 'Rate Limit Headers', pass, details: { limit, remaining, reset } });
    
    console.log('   X-RateLimit-Limit:', limit || 'MISSING');
    console.log('   X-RateLimit-Remaining:', remaining || 'MISSING');
    console.log('   X-RateLimit-Reset:', reset || 'MISSING');
    console.log('   Production Limit Expected: 1000');
    console.log('   Result:', pass ? 'PASS' : 'FAIL');
  } catch (e) {
    results.push({ test: 'Rate Limit Headers', pass: false, error: e.message });
    console.log('   Error:', e.message);
  }

  // ----------------------------------------
  // Test 4: CORS Preflight Caching
  // ----------------------------------------
  console.log('\n4. Testing CORS Preflight Caching...');
  try {
    const res = await fetch(`${BASE_URL}/api/v1/projects`, {
      method: 'OPTIONS',
      headers: {
        'Origin': 'http://localhost:3000',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'Content-Type'
      }
    });
    const maxAge = res.headers.get('Access-Control-Max-Age');
    const pass = maxAge === '86400';
    results.push({ test: 'CORS Preflight Cache', pass, maxAge });
    
    console.log('   Access-Control-Max-Age:', maxAge || 'MISSING');
    console.log('   Expected: 86400 (24 hours)');
    console.log('   Result:', pass ? 'PASS' : 'FAIL');
  } catch (e) {
    results.push({ test: 'CORS Preflight Cache', pass: false, error: e.message });
    console.log('   Error:', e.message);
  }

  // ----------------------------------------
  // Test 5: Idempotency-Key Validation
  // ----------------------------------------
  console.log('\n5. Testing Idempotency-Key Validation...');
  try {
    // Test 1: Invalid key format should return 400
    const res1 = await fetch(`${BASE_URL}/api/v1/projects`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': 'invalid-not-uuid'
      },
      body: JSON.stringify({ name: 'test' })
    });
    const invalidKeyRejected = res1.status === 400;
    const data1 = await res1.json();
    const hasInvalidKeyError = data1?.error?.code === 'INVALID_IDEMPOTENCY_KEY';
    
    // Test 2: Valid UUID v4 should be accepted (not 400 for key format)
    const uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
    const res2 = await fetch(`${BASE_URL}/api/v1/projects`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': uuid
      },
      body: JSON.stringify({ name: 'test' })
    });
    const validKeyAccepted = res2.status !== 400 || !(await res2.clone().json())?.error?.code?.includes('IDEMPOTENCY');
    
    const pass = invalidKeyRejected && hasInvalidKeyError && validKeyAccepted;
    results.push({ test: 'Idempotency-Key', pass, details: { invalidKeyRejected, hasInvalidKeyError, validKeyAccepted } });
    
    console.log('   Invalid Key Rejected (400):', invalidKeyRejected);
    console.log('   Error Code INVALID_IDEMPOTENCY_KEY:', hasInvalidKeyError);
    console.log('   Valid UUID Accepted:', validKeyAccepted);
    console.log('   Result:', pass ? 'PASS' : 'FAIL');
    console.log('   Note: Full replay test requires authenticated endpoint');
  } catch (e) {
    results.push({ test: 'Idempotency-Key', pass: false, error: e.message });
    console.log('   Error:', e.message);
  }

  // ----------------------------------------
  // Test 6: Production Rate Limit Value
  // ----------------------------------------
  console.log('\n6. Testing Production Rate Limit Value...');
  try {
    const res = await fetch(`${BASE_URL}/health`);
    const limit = res.headers.get('X-RateLimit-Limit');
    const isProduction = limit === '1000';
    const isDevelopment = limit === '1000000';
    
    results.push({ 
      test: 'Production Rate Limit', 
      pass: isProduction, 
      details: { limit, mode: isProduction ? 'PRODUCTION' : (isDevelopment ? 'DEVELOPMENT' : 'UNKNOWN') } 
    });
    
    console.log('   X-RateLimit-Limit:', limit);
    console.log('   Mode:', isProduction ? 'PRODUCTION (1000)' : (isDevelopment ? 'DEVELOPMENT (1000000)' : 'UNKNOWN'));
    console.log('   Result:', isProduction ? 'PASS' : 'FAIL (not in production mode)');
  } catch (e) {
    results.push({ test: 'Production Rate Limit', pass: false, error: e.message });
    console.log('   Error:', e.message);
  }

  // ----------------------------------------
  // Summary
  // ----------------------------------------
  console.log('\n================================================');
  console.log('   TEST SUMMARY');
  console.log('================================================');
  
  const passed = results.filter(r => r.pass).length;
  const total = results.length;
  const allPassed = passed === total;
  
  console.log(`   ${passed}/${total} tests passed\n`);
  
  results.forEach(r => {
    const status = r.pass ? 'PASS' : 'FAIL';
    console.log(`   ${status} - ${r.test}`);
  });
  
  console.log('\n================================================');
  if (allPassed) {
    console.log('   ALL TESTS PASSED - Ready for production!');
  } else {
    console.log('   SOME TESTS FAILED - Check results above');
  }
  console.log('================================================\n');

  return { passed, total, allPassed, results };
}

// Run the test
runProductionSecurityTest();
```

---

## Production .env File

Use `.env.production` or copy these settings:

```env
NODE_ENV=production
RATE_LIMIT_MAX_REQUESTS=1000
ENABLE_SECURITY_HEADERS=true
ENFORCE_HTTPS=true
CONTENT_TYPE_VALIDATION=true
IDEMPOTENCY_ENABLED=true
IDEMPOTENCY_TTL=3600
BANDWIDTH_LIMIT_BYTES=52428800
MAX_SINGLE_REQUEST_BYTES=10485760
```

---

## 1. Security Headers Validation

**What it does:** Adds HSTS, CSP, X-Frame-Options, and other security headers to all responses.

### Postman:
1. **Method:** `GET`
2. **URL:** `http://localhost:5000/health`
3. Click **Send**
4. Go to **Headers** tab in response
5. Look for these headers:
   - `Strict-Transport-Security: max-age=31536000; includeSubDomains`
   - `X-Content-Type-Options: nosniff`
   - `X-Frame-Options: DENY`
   - `X-XSS-Protection: 1; mode=block`

### Browser Console:
```javascript
// Open browser console (F12) and paste this:
fetch('http://localhost:5000/health')
  .then(response => {
    console.log('=== Security Headers ===');
    console.log('Strict-Transport-Security:', response.headers.get('Strict-Transport-Security'));
    console.log('X-Content-Type-Options:', response.headers.get('X-Content-Type-Options'));
    console.log('X-Frame-Options:', response.headers.get('X-Frame-Options'));
    console.log('X-XSS-Protection:', response.headers.get('X-XSS-Protection'));
    console.log('Referrer-Policy:', response.headers.get('Referrer-Policy'));
    return response.json();
  })
  .then(data => console.log('Response:', data));
```

**Expected:** All security headers present in the response.

---

## 2. Content-Type Validation

**What it does:** Rejects POST/PUT/PATCH/DELETE requests without valid `Content-Type` header.

### Test 1: WITHOUT Content-Type (Should Fail - 415)

#### Postman:
1. **Method:** `POST`
2. **URL:** `http://localhost:5000/api/v1/projects`
3. **Body Tab:** Select `raw`, paste `{"name":"test"}`
4. **IMPORTANT:** Do NOT set Content-Type header (remove it if auto-added)
5. Click **Send**
6. **Expected:** Status `415 Unsupported Media Type`

#### Browser Console:
```javascript
// Test WITHOUT Content-Type - Should return 415
fetch('http://localhost:5000/api/v1/projects', {
  method: 'POST',
  body: '{"name":"test"}'
  // No Content-Type header!
})
  .then(response => {
    console.log('=== Content-Type Validation Test (No Header) ===');
    console.log('Status:', response.status, response.statusText);
    console.log('Expected: 415 Unsupported Media Type');
    return response.json();
  })
  .then(data => console.log('Response:', data))
  .catch(err => console.log('Error:', err));
```

### Test 2: WITH Content-Type (Should Pass)

#### Postman:
1. **Method:** `POST`
2. **URL:** `http://localhost:5000/api/v1/projects`
3. **Headers Tab:** Add `Content-Type: application/json`
4. **Body Tab:** Select `raw` > `JSON`, paste `{"name":"test"}`
5. Click **Send**
6. **Expected:** NOT 415 (will be 401 if no auth, but Content-Type passed)

#### Browser Console:
```javascript
// Test WITH Content-Type - Should NOT return 415
fetch('http://localhost:5000/api/v1/projects', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ name: 'test' })
})
  .then(response => {
    console.log('=== Content-Type Validation Test (With Header) ===');
    console.log('Status:', response.status, response.statusText);
    console.log('Expected: NOT 415 (likely 401 if not authenticated)');
    return response.json();
  })
  .then(data => console.log('Response:', data));
```

---

## 3. Request Deduplication (Idempotency-Key)

**What it does:** Prevents duplicate submissions. Same `Idempotency-Key` returns cached response.

### Test: Send Same Request Twice

#### Postman:
**Request 1 (First Send):**
1. **Method:** `POST`
2. **URL:** `http://localhost:5000/api/v1/projects`
3. **Headers:**
   - `Content-Type: application/json`
   - `Authorization: Bearer YOUR_TOKEN`
   - `X-Project-Id: YOUR_PROJECT_ID`
   - `Idempotency-Key: test-key-12345`
4. **Body:** `{"name":"my-project"}`
5. Click **Send**
6. Check response headers for `Idempotency-Replayed: false` (or absent)

**Request 2 (Exact Same - Should Replay):**
1. Click **Send** again (same request)
2. Check response headers for `Idempotency-Replayed: true`
3. Response body should be IDENTICAL to first request

#### Browser Console:
```javascript
// Idempotency Test - Run this twice!
const idempotencyKey = 'browser-test-' + Date.now(); // Use same key for both calls

async function testIdempotency() {
  const options = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer YOUR_TOKEN',  // Replace with real token
      'X-Project-Id': 'YOUR_PROJECT_ID',     // Replace with real project ID
      'Idempotency-Key': idempotencyKey
    },
    body: JSON.stringify({ name: 'idempotency-test-project' })
  };

  console.log('=== Idempotency Test ===');
  console.log('Using Idempotency-Key:', idempotencyKey);

  // First request
  console.log('\n--- First Request ---');
  const response1 = await fetch('http://localhost:5000/api/v1/projects', options);
  console.log('Status:', response1.status);
  console.log('Idempotency-Replayed:', response1.headers.get('Idempotency-Replayed'));
  const data1 = await response1.json();
  console.log('Response:', data1);

  // Second request (should be replayed)
  console.log('\n--- Second Request (Should Replay) ---');
  const response2 = await fetch('http://localhost:5000/api/v1/projects', options);
  console.log('Status:', response2.status);
  console.log('Idempotency-Replayed:', response2.headers.get('Idempotency-Replayed'));
  console.log('Expected: true');
  const data2 = await response2.json();
  console.log('Response:', data2);

  console.log('\n--- Comparison ---');
  console.log('Responses match:', JSON.stringify(data1) === JSON.stringify(data2));
}

testIdempotency();
```

---

## 4. Distributed Rate Limiting

**What it does:** Limits requests per IP/user. Returns `429` when exceeded.

### Test: Check Rate Limit Headers

#### Postman:
1. **Method:** `GET`
2. **URL:** `http://localhost:5000/health`
3. Click **Send**
4. Check **Headers** tab for:
   - `X-RateLimit-Limit: 10000`
   - `X-RateLimit-Remaining: 9999`
   - `X-RateLimit-Reset: <timestamp>`

#### Browser Console:
```javascript
// Check Rate Limit Headers
fetch('http://localhost:5000/health')
  .then(response => {
    console.log('=== Rate Limit Headers ===');
    console.log('X-RateLimit-Limit:', response.headers.get('X-RateLimit-Limit'));
    console.log('X-RateLimit-Remaining:', response.headers.get('X-RateLimit-Remaining'));
    console.log('X-RateLimit-Reset:', response.headers.get('X-RateLimit-Reset'));
    return response.json();
  })
  .then(data => console.log('Response:', data));
```

### Stress Test (Multiple Requests):
```javascript
// Send 20 requests rapidly and watch the rate limit decrease
async function stressTestRateLimit() {
  console.log('=== Rate Limit Stress Test ===');
  
  for (let i = 1; i <= 20; i++) {
    const response = await fetch('http://localhost:5000/health');
    const remaining = response.headers.get('X-RateLimit-Remaining');
    console.log(`Request ${i}: Status ${response.status}, Remaining: ${remaining}`);
    
    if (response.status === 429) {
      console.log('Rate limit exceeded!');
      const data = await response.json();
      console.log('Response:', data);
      break;
    }
  }
}

stressTestRateLimit();
```

---

## 5. Bandwidth-Based Rate Limiting

**What it does:** Limits total request bytes. Returns `413` for oversized requests, `429` when bandwidth exceeded.

### Test 1: Oversized Single Request (Should Return 413)

#### Postman:
1. **Method:** `POST`
2. **URL:** `http://localhost:5000/api/v1/documents`
3. **Headers:** `Content-Type: application/json`
4. **Body:** Create a JSON with 15MB+ of data
5. **Expected:** Status `413 Payload Too Large`

#### Browser Console:
```javascript
// Test oversized request (15MB payload)
const largeData = 'x'.repeat(15 * 1024 * 1024); // 15MB of 'x'

fetch('http://localhost:5000/api/v1/documents', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer YOUR_TOKEN',
    'X-Project-Id': 'YOUR_PROJECT_ID'
  },
  body: JSON.stringify({ data: largeData })
})
  .then(response => {
    console.log('=== Bandwidth Test (Large Request) ===');
    console.log('Status:', response.status, response.statusText);
    console.log('Expected: 413 Payload Too Large');
    return response.json();
  })
  .then(data => console.log('Response:', data))
  .catch(err => console.log('Error:', err));
```

### Test 2: Check Bandwidth Headers

#### Browser Console:
```javascript
// Send medium request and check bandwidth headers
const mediumData = 'x'.repeat(1 * 1024 * 1024); // 1MB

fetch('http://localhost:5000/api/v1/documents', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer YOUR_TOKEN',
    'X-Project-Id': 'YOUR_PROJECT_ID'
  },
  body: JSON.stringify({ data: mediumData })
})
  .then(response => {
    console.log('=== Bandwidth Headers ===');
    console.log('X-Bandwidth-Limit:', response.headers.get('X-Bandwidth-Limit'));
    console.log('X-Bandwidth-Used:', response.headers.get('X-Bandwidth-Used'));
    console.log('X-Bandwidth-Remaining:', response.headers.get('X-Bandwidth-Remaining'));
    return response.json();
  })
  .then(data => console.log('Response:', data));
```

---

## 6. CORS Preflight Caching

**What it does:** Caches preflight responses for 24 hours (86400 seconds).

### Postman:
1. **Method:** `OPTIONS`
2. **URL:** `http://localhost:5000/api/v1/projects`
3. **Headers:**
   - `Origin: http://localhost:3000`
   - `Access-Control-Request-Method: POST`
   - `Access-Control-Request-Headers: Content-Type`
4. Click **Send**
5. Check response headers for:
   - `Access-Control-Max-Age: 86400`
   - `Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE`

### Browser Console:
```javascript
// Test CORS Preflight
fetch('http://localhost:5000/api/v1/projects', {
  method: 'OPTIONS',
  headers: {
    'Origin': 'http://localhost:3000',
    'Access-Control-Request-Method': 'POST',
    'Access-Control-Request-Headers': 'Content-Type'
  }
})
  .then(response => {
    console.log('=== CORS Preflight Headers ===');
    console.log('Access-Control-Max-Age:', response.headers.get('Access-Control-Max-Age'));
    console.log('Expected: 86400 (24 hours)');
    console.log('Access-Control-Allow-Methods:', response.headers.get('Access-Control-Allow-Methods'));
    console.log('Access-Control-Allow-Headers:', response.headers.get('Access-Control-Allow-Headers'));
  });
```

---

## 7. Full Integration Test

Run this comprehensive test in the browser console:

```javascript
async function fullSecurityTest() {
  const BASE_URL = 'http://localhost:5000';
  const results = [];

  console.log('========================================');
  console.log('   v0.1.4-alpha.1 Security Patch Test');
  console.log('========================================\n');

  // Test 1: Security Headers
  console.log('1. Testing Security Headers...');
  try {
    const res = await fetch(`${BASE_URL}/health`);
    const hasHSTS = !!res.headers.get('Strict-Transport-Security');
    const hasXFrame = !!res.headers.get('X-Frame-Options');
    const hasXContent = !!res.headers.get('X-Content-Type-Options');
    results.push({ test: 'Security Headers', pass: hasHSTS && hasXFrame && hasXContent });
    console.log('   HSTS:', hasHSTS ? 'PASS' : 'FAIL');
    console.log('   X-Frame-Options:', hasXFrame ? 'PASS' : 'FAIL');
    console.log('   X-Content-Type-Options:', hasXContent ? 'PASS' : 'FAIL');
  } catch (e) {
    results.push({ test: 'Security Headers', pass: false, error: e.message });
  }

  // Test 2: Content-Type Validation
  console.log('\n2. Testing Content-Type Validation...');
  try {
    const res = await fetch(`${BASE_URL}/api/v1/projects`, {
      method: 'POST',
      body: '{"name":"test"}'
      // No Content-Type header
    });
    const pass = res.status === 415;
    results.push({ test: 'Content-Type Validation', pass });
    console.log('   Status:', res.status, pass ? 'PASS (Expected 415)' : 'FAIL');
  } catch (e) {
    results.push({ test: 'Content-Type Validation', pass: false, error: e.message });
  }

  // Test 3: Rate Limit Headers
  console.log('\n3. Testing Rate Limit Headers...');
  try {
    const res = await fetch(`${BASE_URL}/health`);
    const hasLimit = !!res.headers.get('X-RateLimit-Limit');
    const hasRemaining = !!res.headers.get('X-RateLimit-Remaining');
    results.push({ test: 'Rate Limit Headers', pass: hasLimit && hasRemaining });
    console.log('   X-RateLimit-Limit:', hasLimit ? 'PASS' : 'FAIL');
    console.log('   X-RateLimit-Remaining:', hasRemaining ? 'PASS' : 'FAIL');
  } catch (e) {
    results.push({ test: 'Rate Limit Headers', pass: false, error: e.message });
  }

  // Test 4: CORS Preflight
  console.log('\n4. Testing CORS Preflight Caching...');
  try {
    const res = await fetch(`${BASE_URL}/api/v1/projects`, {
      method: 'OPTIONS',
      headers: {
        'Origin': 'http://localhost:3000',
        'Access-Control-Request-Method': 'POST'
      }
    });
    const maxAge = res.headers.get('Access-Control-Max-Age');
    const pass = maxAge === '86400';
    results.push({ test: 'CORS Preflight Cache', pass });
    console.log('   Access-Control-Max-Age:', maxAge, pass ? 'PASS' : 'FAIL');
  } catch (e) {
    results.push({ test: 'CORS Preflight Cache', pass: false, error: e.message });
  }

  // Summary
  console.log('\n========================================');
  console.log('   TEST SUMMARY');
  console.log('========================================');
  const passed = results.filter(r => r.pass).length;
  const total = results.length;
  console.log(`   ${passed}/${total} tests passed\n`);
  results.forEach(r => {
    console.log(`   ${r.pass ? 'PASS' : 'FAIL'} - ${r.test}`);
  });
  console.log('========================================');

  return results;
}

// Run the full test
fullSecurityTest();
```

---

## Quick Reference Table

| Feature | Postman Test | Expected Result |
|---------|--------------|-----------------|
| **Security Headers** | `GET /health` > Check Headers tab | See HSTS, X-Frame-Options, etc. |
| **Content-Type** | `POST /api/v1/projects` without Content-Type | `415 Unsupported Media Type` |
| **Idempotency** | Send same POST twice with `Idempotency-Key` header | 2nd response has `Idempotency-Replayed: true` |
| **Rate Limit** | `GET /health` > Check Headers tab | `X-RateLimit-Limit`, `X-RateLimit-Remaining` |
| **Bandwidth** | `POST` with 15MB+ body | `413 Payload Too Large` |
| **CORS Preflight** | `OPTIONS /api/v1/projects` with Origin header | `Access-Control-Max-Age: 86400` |

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| **CORS errors in browser** | Run tests from same origin or use Postman |
| **Redis connection failed** | Ensure Redis is running, check `REDIS_URL` in `.env` |
| **Content-Type test passing when it shouldn't** | Ensure `CONTENT_TYPE_VALIDATION=true` in `.env` |
| **Idempotency not working** | Ensure `IDEMPOTENCY_ENABLED=true` and Redis is connected |
| **No rate limit headers** | Check if rate limiting middleware is enabled |
