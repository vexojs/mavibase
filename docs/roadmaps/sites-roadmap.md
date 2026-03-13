# Sites Service Roadmap

A deployment and hosting service for static and containerized websites, integrated with the Mavibase platform.

---

## MVP Scope

### Core Deployment Features

- **Static Site Deployments**
  - Upload static files (HTML, CSS, JS, images)
  - Automatic file serving with proper MIME types
  - SPA (Single Page Application) support with fallback routing
  - Asset optimization (gzip/brotli compression)

- **Container Deployments**
  - Docker image deployments from registry (Docker Hub, GHCR)
  - Dockerfile-based builds from Git repositories
  - Health check endpoint configuration
  - Container restart policies

- **Build Pipeline**
  - Git repository integration (GitHub, GitLab, Bitbucket)
  - Webhook triggers for automatic deployments
  - Build command configuration (npm, yarn, pnpm support)
  - Build environment variables
  - Build logs with real-time streaming
  - Build caching for faster deployments

### Domain Management

- **Subdomain Allocation**
  - Automatic subdomain: `{project-slug}.{team-slug}.mavibase.app`
  - Custom subdomain selection within team namespace

- **Custom Domains**
  - Add custom domains to deployments
  - DNS verification via TXT records
  - Automatic SSL/TLS certificate provisioning (Let's Encrypt)
  - Certificate renewal automation
  - Domain transfer between projects

### Environment Variables

- **Secrets Management**
  - Encrypted environment variable storage
  - Per-environment variables (production, staging, development)
  - Integration with existing `project.settings` JSONB field
  - Build-time vs runtime variable distinction
  - Variable inheritance from team level

### Networking & SSL

- **Reverse Proxy**
  - Traefik-based routing to containers
  - Automatic HTTPS redirection
  - WebSocket support
  - Custom headers configuration

- **SSL/TLS**
  - Automatic certificate generation via ACME
  - Wildcard certificates for subdomains
  - Custom certificate upload support
  - TLS 1.2+ enforcement

### Storage

- **Build Artifacts**
  - S3-compatible object storage for static assets
  - Build output caching
  - Asset versioning for rollbacks
  - CDN integration for static assets

- **Deployment Logs**
  - Build log storage with 30-day retention
  - Runtime log aggregation
  - Log search and filtering
  - Integration with existing `slow_query_logs` pattern

---

## Infrastructure Design

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        Load Balancer                             │
│                    (nginx / cloud LB)                            │
└─────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Reverse Proxy Layer                         │
│                         (Traefik)                                │
│  - SSL termination                                               │
│  - Domain routing                                                │
│  - Rate limiting integration                                     │
└─────────────────────────────────────────────────────────────────┘
                               │
          ┌────────────────────┼────────────────────┐
          │                    │                    │
          ▼                    ▼                    ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│  Static Assets  │  │   Container A   │  │   Container B   │
│    (MinIO/S3)   │  │   (user app)    │  │   (user app)    │
└─────────────────┘  └─────────────────┘  └─────────────────┘
```

### Docker Container Orchestration

- **Container Runtime**: Docker Engine with containerd
- **Orchestration**: Docker Swarm (MVP) → Kubernetes (post-MVP)
- **Registry**: Self-hosted registry or integrate with existing registries

```yaml
# Example container configuration
services:
  user-app-{deployment-id}:
    image: registry.mavibase.internal/{team}/{project}:{version}
    deploy:
      replicas: 1
      resources:
        limits:
          cpus: '0.5'
          memory: 512M
      restart_policy:
        condition: on-failure
        max_attempts: 3
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.{deployment-id}.rule=Host(`{domain}`)"
```

### Reverse Proxy / Routing

- **Traefik** for dynamic container discovery and routing
- Automatic SSL certificate management via ACME
- Per-deployment routing rules
- Health check integration

```yaml
# Traefik dynamic configuration
http:
  routers:
    deployment-{id}:
      rule: "Host(`project.team.mavibase.app`) || Host(`custom-domain.com`)"
      service: deployment-{id}
      tls:
        certResolver: letsencrypt
  services:
    deployment-{id}:
      loadBalancer:
        servers:
          - url: "http://container-{id}:3000"
        healthCheck:
          path: "/health"
          interval: "10s"
```

### Isolation Between Deployments

- **Network Isolation**: Each deployment runs in isolated Docker network
- **Resource Limits**: CPU/memory limits per container
- **Filesystem Isolation**: Read-only root filesystem, ephemeral writable layer
- **Process Isolation**: Unprivileged containers, no host access

### Build Pipeline

```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│   Git Push   │───▶│  Build Queue │───▶│ Build Worker │───▶│   Registry   │
│   Webhook    │    │   (Redis)    │    │   (Docker)   │    │   (Images)   │
└──────────────┘    └──────────────┘    └──────────────┘    └──────────────┘
                                               │
                                               ▼
                                        ┌──────────────┐
                                        │   Deploy     │
                                        │   Service    │
                                        └──────────────┘
```

- **Build Queue**: Redis-based queue (using existing `@mavibase/database/config/redis`)
- **Build Workers**: Isolated Docker-in-Docker or Kaniko for rootless builds
- **Build Cache**: Layer caching in registry, npm/yarn cache volumes

### Storage Strategy

| Asset Type | Storage | Retention |
|------------|---------|-----------|
| Static files | MinIO/S3 | Permanent (versioned) |
| Build logs | PostgreSQL + S3 | 30 days |
| Docker images | Registry | 10 versions |
| Build cache | Local volume | 7 days |

### CDN Strategy

- **MVP**: Serve directly through Traefik with caching headers
- **Post-MVP**: CloudFlare/Bunny CDN integration
- Cache invalidation on deployment
- Edge caching for static assets

### Scaling Strategy

- **Horizontal**: Multiple container replicas per deployment
- **Vertical**: Resource limit adjustments based on plan
- **Auto-scaling** (post-MVP): Based on request metrics

---

## Security Design

### Container Isolation

```yaml
# Security-hardened container defaults
security_opt:
  - no-new-privileges:true
  - seccomp:default
cap_drop:
  - ALL
read_only: true
tmpfs:
  - /tmp:size=64M
user: "1000:1000"  # Non-root
```

### Resource Limits

| Plan | CPU | Memory | Storage | Bandwidth |
|------|-----|--------|---------|-----------|
| Free | 0.25 | 256MB | 1GB | 10GB/mo |
| Pro | 1.0 | 1GB | 10GB | 100GB/mo |
| Team | 2.0 | 4GB | 50GB | 500GB/mo |

- Enforce via Docker resource constraints
- Track via existing `egress_events` table pattern

### Abuse Protection

- **Rate Limiting**: Integrate with existing `rate-limiter.ts` middleware
- **Build Limits**: Max builds per hour per project
- **Deploy Limits**: Max concurrent deployments per team
- **Resource Monitoring**: Alert on unusual resource usage

### Secrets Management

- Environment variables encrypted at rest (AES-256)
- Decrypted only at container runtime
- Never exposed in build logs (automatic redaction)
- Rotation support without redeployment

### Domain Verification

```sql
-- Domain verification table
CREATE TABLE site_domains (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES sites(id),
  domain VARCHAR(255) NOT NULL UNIQUE,
  verification_token VARCHAR(64) NOT NULL,
  verified_at TIMESTAMPTZ,
  ssl_status VARCHAR(20) DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

- TXT record verification: `_mavibase-verification.domain.com`
- CNAME verification alternative
- Periodic re-verification for ownership

### Rate Limiting

- Extend existing `rate-limiter.ts` with per-site limits
- Use existing Redis infrastructure
- Configurable per-plan limits

### Sandboxing

- **gVisor** or **Firecracker** for additional isolation (post-MVP)
- Network policy enforcement
- Egress filtering (prevent SSRF)

---

## Permissions & Platform Integration

### Database Schema Integration

```sql
-- Sites table (follows existing pattern)
CREATE TABLE sites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id),
  team_id UUID NOT NULL REFERENCES teams(id),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) NOT NULL,
  subdomain VARCHAR(63),
  status VARCHAR(20) DEFAULT 'active',
  settings JSONB DEFAULT '{}',
  created_by UUID REFERENCES platform_users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(team_id, slug)
);

-- Deployments table
CREATE TABLE site_deployments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES sites(id),
  version VARCHAR(50) NOT NULL,
  source_type VARCHAR(20) NOT NULL, -- 'git', 'upload', 'docker'
  source_ref VARCHAR(255),
  build_status VARCHAR(20) DEFAULT 'pending',
  deploy_status VARCHAR(20) DEFAULT 'pending',
  build_logs_url TEXT,
  created_by UUID REFERENCES platform_users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  deployed_at TIMESTAMPTZ
);
```

### Organization Permissions

Sites inherit the existing team/project permission model:

```typescript
// Extend IdentityContext for sites
interface SitesIdentityContext extends IdentityContext {
  site_permissions?: string[]  // e.g., "sites.deploy", "sites.settings"
}
```

- Team owners: Full access to all sites
- Team admins: Create, deploy, configure sites
- Developers: Deploy to existing sites
- Viewers: View deployment status and logs

### Project Access

- Sites are scoped to projects (like databases and collections)
- Use existing `project-access.ts` middleware
- Sites count toward project quotas

```typescript
// Extend existing project verification
export const verifySiteAccess = async (siteId: string, identity: IdentityContext) => {
  const site = await getSiteById(siteId)
  if (!site) throw new NotFoundError("Site not found")
  
  // Use existing project access check
  return verifyProjectAccess(site.project_id, identity.user_id)
}
```

### API Keys Integration

Extend existing API key scopes for sites:

```typescript
const SITE_SCOPES = [
  "sites.read",
  "sites.create",
  "sites.deploy",
  "sites.settings",
  "sites.domains",
  "sites.delete"
]

// Example API key creation for CI/CD
const deployKey = await createAPIKey({
  projectId,
  userId,
  name: "GitHub Actions Deploy",
  keyType: "service",
  scopes: ["sites.deploy", "sites.read"]
})
```

### Database / Collection Permissions

Sites can optionally connect to Mavibase databases:

- Sites inherit project's database access
- Connection strings injected as environment variables
- Use existing permission evaluation for data access

```typescript
// Auto-inject database connection for sites
const siteEnvVars = {
  MAVIBASE_API_URL: process.env.API_URL,
  MAVIBASE_API_KEY: await createSiteServiceKey(site.id),
  MAVIBASE_PROJECT_ID: site.project_id
}
```

### Audit Logs

Extend existing audit pattern:

```sql
CREATE TABLE site_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES sites(id),
  action VARCHAR(50) NOT NULL,
  actor_id UUID REFERENCES platform_users(id),
  actor_type VARCHAR(20) NOT NULL, -- 'user', 'api_key', 'system'
  metadata JSONB DEFAULT '{}',
  ip_address INET,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Post-MVP Features

### CI/CD Integrations

- GitHub Actions integration with OIDC
- GitLab CI/CD support
- Bitbucket Pipelines
- Generic webhook API for custom CI

### Preview Deployments

- Automatic deployment for pull requests
- Unique preview URLs: `pr-{number}.{site}.preview.mavibase.app`
- Auto-cleanup on PR merge/close
- Comment on PR with preview link

### Rollback Versions

- One-click rollback to previous deployment
- Keep last 10 deployments available
- Instant rollback (container swap)
- Database migration rollback coordination

### Traffic Analytics

- Request count, bandwidth, error rates
- Geographic distribution
- Top paths and referrers
- Integration with existing `egress_events` table

### Edge Caching

- CloudFlare Workers / Deno Deploy integration
- Cache rules configuration
- Cache purge API
- Stale-while-revalidate support

### Serverless Functions

- Edge functions for dynamic routes
- API routes (Node.js, Deno)
- Scheduled functions (cron)
- Integration with Mavibase database

---

## Long-Term Vision

The Sites service evolves into a comprehensive application platform similar to Vercel/Netlify:

### Platform Capabilities

- **Full-Stack Deployments**: Frontend + API + Database in one project
- **Framework Detection**: Auto-detect Next.js, Nuxt, Remix, etc.
- **Zero-Config Deployments**: Smart defaults for popular frameworks
- **Monorepo Support**: Deploy multiple services from one repo

### Developer Experience

- **CLI Tool**: `mavibase deploy` for local deployments
- **Local Development**: `mavibase dev` with hot reload
- **SDK**: JavaScript/TypeScript SDK for framework integration
- **VS Code Extension**: Deploy directly from editor

### Enterprise Features

- **SSO Integration**: Team authentication via SAML/OIDC
- **Compliance**: SOC 2, GDPR, HIPAA ready infrastructure
- **SLA**: 99.9% uptime guarantee
- **Priority Support**: Dedicated support channels

### Ecosystem

- **Marketplace**: Pre-built templates and integrations
- **Partner Integrations**: Database, monitoring, analytics partners
- **Community Templates**: Share and discover project templates

---

## Implementation Priority

### Phase 1 (MVP Core)
1. Static site deployments
2. Subdomain allocation
3. Basic container support
4. Environment variables
5. Build pipeline

### Phase 2 (MVP Complete)
1. Custom domains + SSL
2. Git webhook integration
3. Deployment logs
4. Resource limits
5. Platform permission integration

### Phase 3 (Post-MVP)
1. Preview deployments
2. Rollback support
3. CI/CD integrations
4. Analytics dashboard

### Phase 4 (Advanced)
1. Edge functions
2. CDN integration
3. Auto-scaling
4. Framework detection
