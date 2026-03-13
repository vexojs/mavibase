# Auth Service Roadmap

A centralized authentication service for applications built on the Mavibase platform, providing user management, session handling, and identity verification for end-users of customer applications.

> **Note**: This service is for **customer applications** authenticating their own users, separate from the existing platform authentication in `packages/platform/src/services/auth-service.ts`.

---

## MVP Scope

### User Registration

```typescript
// API: POST /v1/auth/{project_id}/register
interface RegisterRequest {
  email: string
  password: string
  name?: string
  metadata?: Record<string, any>
}

interface RegisterResponse {
  user: AppUser
  access_token: string
  refresh_token: string
  expires_in: number
}
```

- Email validation and normalization
- Password strength requirements (min 8 chars, complexity rules)
- Password hashing with bcrypt (cost factor 12)
- Duplicate email prevention per project
- Optional user metadata storage
- Welcome email (optional, configurable)

### Login

```typescript
// API: POST /v1/auth/{project_id}/login
interface LoginRequest {
  email: string
  password: string
}

interface LoginResponse {
  user: AppUser
  access_token: string
  refresh_token: string
  expires_in: number
  requires_mfa?: boolean
  mfa_token?: string  // Temporary token for MFA flow
}
```

- Timing-safe password comparison
- Failed attempt tracking
- Account lockout after configurable attempts
- Last login timestamp update
- Device/session tracking

### Email Verification

```typescript
// API: POST /v1/auth/{project_id}/verify-email
// API: POST /v1/auth/{project_id}/resend-verification
```

- Token generation with SHA-256 hashing (following existing pattern)
- Configurable expiry (default: 24 hours)
- Rate limiting on resend (max 3 per hour)
- Customizable email templates per project
- Verification status in user profile

### Password Reset

```typescript
// API: POST /v1/auth/{project_id}/forgot-password
// API: POST /v1/auth/{project_id}/reset-password
```

- Secure token generation (following existing `requestPasswordReset` pattern)
- Token hashing before storage
- Single-use tokens with expiry
- Password history check (optional)
- Notification on password change

### JWT / Access Tokens

```typescript
// Token structure
interface AccessTokenPayload {
  sub: string           // User ID
  pid: string           // Project ID
  type: 'app_user'
  roles: string[]
  permissions: string[]
  iat: number
  exp: number
}
```

- RS256 signing (asymmetric keys per project)
- Configurable expiry (default: 15 minutes)
- Include user roles and permissions
- Project-scoped tokens
- Token introspection endpoint

### Refresh Tokens

```typescript
// API: POST /v1/auth/{project_id}/refresh
interface RefreshRequest {
  refresh_token: string
}
```

- Secure random generation (following existing pattern)
- Database-backed token storage
- Token rotation on use
- Configurable expiry (default: 7 days)
- Revocation support
- Family tracking for token theft detection

### Session Management

```typescript
// API: GET /v1/auth/{project_id}/sessions
// API: DELETE /v1/auth/{project_id}/sessions/{session_id}
// API: DELETE /v1/auth/{project_id}/sessions (revoke all)
```

- Multiple concurrent sessions
- Session metadata (IP, user agent, location)
- Session listing for users
- Remote session termination
- Maximum sessions per user (configurable)

### Rate Limiting

Extend existing rate limiter for auth endpoints:

```typescript
// Auth-specific rate limits
const AUTH_RATE_LIMITS = {
  register: { window: '1h', max: 5 },
  login: { window: '15m', max: 10 },
  passwordReset: { window: '1h', max: 3 },
  verifyEmail: { window: '1h', max: 5 },
  refresh: { window: '1m', max: 30 }
}
```

- Per-IP rate limiting
- Per-email rate limiting for login
- Sliding window algorithm
- Use existing Redis infrastructure

### API Authentication

```typescript
// Middleware for customer applications
const authMiddleware = (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '')
  const payload = verifyAppUserToken(token, req.params.projectId)
  req.appUser = payload
  next()
}
```

- Bearer token validation
- Project scope verification
- User status check (active, suspended, deleted)
- Permission injection into request context

---

## Platform Integration

### Organizations

The auth service operates within the existing team/organization structure:

```sql
-- App users are scoped to projects (owned by teams)
CREATE TABLE app_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id),
  team_id UUID NOT NULL REFERENCES teams(id),
  email VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(255),
  avatar_url TEXT,
  email_verified BOOLEAN DEFAULT false,
  status VARCHAR(20) DEFAULT 'active',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_login_at TIMESTAMPTZ,
  UNIQUE(project_id, email)
);
```

- App users belong to projects → teams
- Team quotas apply to total app users
- Team admins can manage all app users
- Billing based on monthly active users (MAU)

### Projects

Each project has its own auth configuration:

```sql
-- Project auth settings (extend existing projects table)
ALTER TABLE projects ADD COLUMN auth_settings JSONB DEFAULT '{
  "enabled": true,
  "registration_enabled": true,
  "email_verification_required": false,
  "password_min_length": 8,
  "session_lifetime_seconds": 604800,
  "max_sessions_per_user": 10,
  "mfa_enabled": false,
  "allowed_domains": [],
  "blocked_domains": []
}';
```

- Project-level auth configuration
- Enable/disable registration
- Custom password policies
- Domain restrictions

### Database Permissions

App users can be granted access to Mavibase databases:

```typescript
// Link app user to database role
interface AppUserRole {
  app_user_id: string
  database_id: string
  role_id: string  // References existing roles table
}
```

Integration with existing permission system:

```typescript
// Extend IdentityContext for app users
interface AppUserIdentityContext extends IdentityContext {
  type: 'app_user'
  app_user_id: string
  project_id: string
  team_id: string
  roles: string[]
  permissions: string[]
}

// Use existing PermissionRuleEvaluator
const evaluator = new PermissionRuleEvaluator()
const canRead = evaluator.evaluate('read', collection.permission_rules, appUserIdentity, document)
```

### Collection Permissions

App users interact with collections through the existing RLS system:

```typescript
// Example: User can only read their own documents
const permissionRules: PermissionRules = {
  read: [{ role: 'user:{user_id}' }],  // Uses app_user_id
  create: [{ role: 'any' }],
  update: [{ role: 'owner' }],
  delete: [{ role: 'owner' }]
}
```

- Support `app_user:{id}` in permission targets
- Extend existing `PermissionRuleEvaluator` to recognize app users
- Document ownership via `created_by` field

### Document Permissions

Per-document permissions for app users:

```typescript
// Document with app user permissions
{
  _id: "doc123",
  _permissions: {
    read: ["app_user:user123", "role:moderator"],
    update: ["owner"],
    delete: ["owner", "role:admin"]
  },
  owner_id: "user123",  // app_user_id
  // ... document data
}
```

### API Keys

App users can optionally have their own API keys:

```typescript
// API: POST /v1/auth/{project_id}/users/{user_id}/api-keys
const appUserKey = await createAppUserAPIKey({
  projectId,
  appUserId,
  name: "Mobile App",
  scopes: ["documents.read", "documents.create"]
})
```

- Scoped to app user's permissions
- Follow existing API key patterns
- Optional feature per project

### Platform-Level Roles

Two-tier role system:

1. **Platform Roles** (existing): owner, admin, developer, viewer
2. **App Roles** (new): Defined per project for app users

```sql
-- App roles (per project)
CREATE TABLE app_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id),
  name VARCHAR(50) NOT NULL,
  description TEXT,
  permissions TEXT[] DEFAULT '{}',
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(project_id, name)
);

-- App user role assignments
CREATE TABLE app_user_roles (
  app_user_id UUID NOT NULL REFERENCES app_users(id),
  app_role_id UUID NOT NULL REFERENCES app_roles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (app_user_id, app_role_id)
);
```

---

## Security Design

### Token Rotation

```typescript
// Refresh token rotation strategy
async function rotateRefreshToken(oldToken: string): Promise<TokenPair> {
  const session = await validateRefreshToken(oldToken)
  
  // Mark old token as used
  await markTokenUsed(oldToken)
  
  // Generate new token pair
  const newAccessToken = generateAccessToken(session.userId, session.projectId)
  const newRefreshToken = generateRefreshToken()
  
  // Update session with new refresh token
  await updateSessionRefreshToken(session.id, newRefreshToken)
  
  return { accessToken: newAccessToken, refreshToken: newRefreshToken }
}
```

- Automatic rotation on refresh
- Token reuse detection
- Entire family revocation on reuse

### Session Expiration

```typescript
// Session configuration per project
interface SessionConfig {
  accessTokenTTL: number     // Default: 900 (15 min)
  refreshTokenTTL: number    // Default: 604800 (7 days)
  absoluteTimeout: number    // Default: 2592000 (30 days)
  idleTimeout: number        // Default: 86400 (24 hours)
  slidingSession: boolean    // Extend on activity
}
```

- Configurable TTLs per project
- Absolute session timeout
- Idle timeout with activity tracking
- Sliding sessions option

### Brute Force Protection

```typescript
// Track failed attempts in Redis
interface LoginAttempt {
  email: string
  ip: string
  timestamp: number
  success: boolean
}

// Lockout thresholds
const LOCKOUT_CONFIG = {
  maxAttempts: 5,
  lockoutDuration: 900,  // 15 minutes
  attemptWindow: 300     // 5 minutes
}
```

- Per-email attempt tracking
- Per-IP attempt tracking
- Progressive delays
- CAPTCHA trigger after threshold
- Account lockout notification

### Device Tracking

```sql
CREATE TABLE app_user_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_user_id UUID NOT NULL REFERENCES app_users(id),
  session_id UUID REFERENCES app_user_sessions(id),
  device_fingerprint VARCHAR(64),
  device_name VARCHAR(255),
  device_type VARCHAR(50),  -- 'desktop', 'mobile', 'tablet'
  os VARCHAR(100),
  browser VARCHAR(100),
  ip_address INET,
  location_country VARCHAR(2),
  location_city VARCHAR(100),
  first_seen_at TIMESTAMPTZ DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ DEFAULT NOW(),
  trusted BOOLEAN DEFAULT false
);
```

- Device fingerprinting
- New device notifications
- Trusted device management
- Location tracking (GeoIP)
- Suspicious activity alerts

### Audit Logging

```sql
CREATE TABLE app_auth_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id),
  app_user_id UUID REFERENCES app_users(id),
  action VARCHAR(50) NOT NULL,
  -- Actions: register, login, logout, password_reset, 
  -- email_verify, mfa_enable, mfa_verify, session_revoke
  success BOOLEAN NOT NULL,
  ip_address INET,
  user_agent TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for efficient queries
CREATE INDEX idx_auth_audit_project_time ON app_auth_audit_logs(project_id, created_at DESC);
CREATE INDEX idx_auth_audit_user ON app_auth_audit_logs(app_user_id, created_at DESC);
```

- Comprehensive action logging
- Success/failure tracking
- IP and user agent capture
- Queryable metadata
- Retention policy (configurable)

### Secure Cookie Handling

```typescript
// Cookie configuration
const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: 7 * 24 * 60 * 60 * 1000,  // 7 days
  domain: undefined  // Set per deployment
}

// CSRF token for state-changing operations
const CSRF_COOKIE_OPTIONS = {
  httpOnly: false,  // Needs to be readable by JS
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const
}
```

- HttpOnly for session cookies
- Secure flag in production
- SameSite protection
- CSRF token support
- Cookie prefix support (`__Host-`, `__Secure-`)

---

## Identity Features (Post-MVP)

### OAuth Providers

```typescript
// API: GET /v1/auth/{project_id}/oauth/{provider}/authorize
// API: POST /v1/auth/{project_id}/oauth/{provider}/callback

interface OAuthConfig {
  provider: 'google' | 'github' | 'apple' | 'microsoft' | 'facebook'
  clientId: string
  clientSecret: string  // Encrypted
  scopes: string[]
  enabled: boolean
}
```

- Google, GitHub, Apple, Microsoft, Facebook
- Per-project OAuth app configuration
- Account linking to existing users
- Profile data sync

### SSO (Single Sign-On)

```typescript
// SAML 2.0 configuration
interface SAMLConfig {
  entityId: string
  ssoUrl: string
  certificate: string
  attributeMapping: Record<string, string>
}

// OIDC configuration
interface OIDCConfig {
  issuer: string
  clientId: string
  clientSecret: string
  scopes: string[]
}
```

- SAML 2.0 support
- OIDC/OpenID Connect
- JIT (Just-In-Time) provisioning
- Attribute mapping

### Magic Links

```typescript
// API: POST /v1/auth/{project_id}/magic-link
// API: POST /v1/auth/{project_id}/magic-link/verify
```

- Passwordless authentication
- Configurable expiry (default: 15 minutes)
- Single-use tokens
- Rate limiting

### MFA / 2FA

```typescript
// API: POST /v1/auth/{project_id}/mfa/enable
// API: POST /v1/auth/{project_id}/mfa/verify
// API: POST /v1/auth/{project_id}/mfa/disable

interface MFAMethods {
  totp: boolean       // Authenticator apps
  sms: boolean        // SMS codes
  email: boolean      // Email codes
  backup_codes: boolean
}
```

- TOTP (Google Authenticator, Authy)
- SMS verification (via Twilio)
- Email OTP
- Backup codes
- Recovery flow

### Passkeys / WebAuthn

```typescript
// API: POST /v1/auth/{project_id}/passkeys/register/options
// API: POST /v1/auth/{project_id}/passkeys/register/verify
// API: POST /v1/auth/{project_id}/passkeys/authenticate/options
// API: POST /v1/auth/{project_id}/passkeys/authenticate/verify
```

- FIDO2/WebAuthn support
- Platform authenticators (Face ID, Touch ID, Windows Hello)
- Roaming authenticators (YubiKey)
- Passkey management UI

---

## Developer Experience

### SDKs

```typescript
// JavaScript/TypeScript SDK
import { MavibaseAuth } from '@mavibase/auth'

const auth = new MavibaseAuth({
  projectId: 'proj_xxx',
  apiKey: 'pk_xxx'
})

// Register
const { user, session } = await auth.signUp({
  email: 'user@example.com',
  password: 'securepassword'
})

// Login
const { user, session } = await auth.signIn({
  email: 'user@example.com',
  password: 'securepassword'
})

// Get current user
const user = await auth.getUser()

// Sign out
await auth.signOut()

// Listen to auth state changes
auth.onAuthStateChange((event, session) => {
  console.log(event, session)
})
```

SDKs for:
- JavaScript/TypeScript (browser + Node.js)
- React hooks (`@mavibase/auth-react`)
- Next.js (`@mavibase/auth-next`)
- Vue (`@mavibase/auth-vue`)
- React Native
- Flutter/Dart
- Swift (iOS)
- Kotlin (Android)

### Middleware

```typescript
// Express middleware
import { createAuthMiddleware } from '@mavibase/auth-express'

app.use(createAuthMiddleware({
  projectId: process.env.MAVIBASE_PROJECT_ID,
  apiKey: process.env.MAVIBASE_API_KEY
}))

app.get('/api/protected', (req, res) => {
  const user = req.appUser  // Injected by middleware
  res.json({ user })
})

// Next.js middleware
import { withAuth } from '@mavibase/auth-next/middleware'

export default withAuth({
  publicPaths: ['/login', '/register', '/'],
  loginPath: '/login'
})
```

### API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/v1/auth/{project}/register` | POST | User registration |
| `/v1/auth/{project}/login` | POST | User login |
| `/v1/auth/{project}/logout` | POST | User logout |
| `/v1/auth/{project}/refresh` | POST | Refresh tokens |
| `/v1/auth/{project}/verify-email` | POST | Verify email |
| `/v1/auth/{project}/forgot-password` | POST | Request password reset |
| `/v1/auth/{project}/reset-password` | POST | Reset password |
| `/v1/auth/{project}/me` | GET | Get current user |
| `/v1/auth/{project}/me` | PATCH | Update current user |
| `/v1/auth/{project}/sessions` | GET | List sessions |
| `/v1/auth/{project}/sessions/{id}` | DELETE | Revoke session |
| `/v1/auth/{project}/users` | GET | List users (admin) |
| `/v1/auth/{project}/users/{id}` | GET | Get user (admin) |
| `/v1/auth/{project}/users/{id}` | PATCH | Update user (admin) |
| `/v1/auth/{project}/users/{id}` | DELETE | Delete user (admin) |

### Webhooks

```typescript
// Webhook configuration
interface WebhookConfig {
  url: string
  secret: string
  events: AuthEvent[]
}

type AuthEvent = 
  | 'user.created'
  | 'user.updated'
  | 'user.deleted'
  | 'user.login'
  | 'user.logout'
  | 'password.reset'
  | 'email.verified'
  | 'mfa.enabled'
  | 'mfa.disabled'
  | 'session.created'
  | 'session.revoked'
```

- Webhook registration API
- Signed payloads (HMAC-SHA256)
- Retry with exponential backoff
- Webhook logs and debugging

### CLI Integration

```bash
# Mavibase CLI auth commands
mavibase auth users list
mavibase auth users create --email user@example.com
mavibase auth users delete user_xxx
mavibase auth sessions list --user user_xxx
mavibase auth sessions revoke session_xxx
mavibase auth config set registration_enabled true
mavibase auth export --format csv > users.csv
```

---

## Long-Term Vision

The auth service evolves into a comprehensive identity platform similar to Auth0/Clerk/Supabase Auth:

### Enterprise Identity

- **Directory Sync**: Azure AD, Okta, Google Workspace
- **SCIM Provisioning**: Automatic user provisioning/deprovisioning
- **Organization Management**: B2B multi-tenant authentication
- **Custom Domains**: `auth.yourdomain.com`

### Advanced Security

- **Adaptive Authentication**: Risk-based authentication
- **Bot Detection**: ML-powered bot protection
- **Breached Password Detection**: HaveIBeenPwned integration
- **Session Intelligence**: Anomaly detection

### User Management

- **Admin Dashboard**: Full-featured user management UI
- **User Profiles**: Extended profile management
- **User Groups**: Group-based permissions
- **User Import/Export**: Bulk operations

### Compliance

- **GDPR Tools**: Data export, deletion, consent management
- **SOC 2**: Audit-ready logging and controls
- **HIPAA**: Healthcare compliance features
- **Data Residency**: Region-specific data storage

### Developer Tools

- **Auth UI Components**: Pre-built React/Vue components
- **Email Templates**: Customizable, i18n-ready templates
- **Custom Flows**: Visual auth flow builder
- **Testing Tools**: Mock users, test tokens

### Analytics

- **User Analytics**: Signups, logins, retention
- **Security Dashboard**: Failed logins, suspicious activity
- **Conversion Tracking**: Funnel analysis
- **Real-time Monitoring**: Live auth activity

---

## Implementation Priority

### Phase 1 (MVP Core)
1. User registration and login
2. JWT tokens with refresh
3. Session management
4. Rate limiting
5. Password reset flow

### Phase 2 (MVP Complete)
1. Email verification
2. Database permission integration
3. App roles system
4. Audit logging
5. SDK (JavaScript)

### Phase 3 (Identity Features)
1. OAuth providers (Google, GitHub)
2. MFA (TOTP)
3. Magic links
4. Additional SDKs

### Phase 4 (Enterprise)
1. SSO (SAML, OIDC)
2. Passkeys/WebAuthn
3. Admin dashboard
4. Advanced security features
