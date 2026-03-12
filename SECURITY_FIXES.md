# Security Fixes

This document tracks security improvements and vulnerability fixes applied to Mavibase.

---

## March 2026

### 1. Slow Query Tracking & External API Logging

Added comprehensive slow query tracking with configurable thresholds. External API requests are now logged with API key identification for audit trails and debugging purposes.

---

### 2. SQL Comment Injection Detection

**Location:** `QueryParser.ts`

Added field name validation to prevent SQL comment injection attempts. The parser now:

- Detects and blocks SQL comment patterns (`--`, `/*`, `*/`) in field names
- Rejects statement terminators (`;`) and quote characters (`'`, `"`, `` ` ``)
- Blocks null byte injection attempts
- Enforces reserved field prefix rules (`$` and `_` prefixes are system-reserved)
- Validates field names against collection schema when available, ensuring only defined fields can be queried

This provides defense-in-depth alongside parameterized queries.

---

### 3. Transaction Isolation Levels

**Location:** `TransactionManager.ts` and all repository/service files

Previously, transactions used PostgreSQL's implicit default isolation level. Now all database transactions explicitly specify their isolation level:

- **READ COMMITTED** (default): Used for standard CRUD operations across `DocumentRepository`, `CollectionRepository`, `DatabaseRepository`, `QuotaManager`, and user registration
- **SERIALIZABLE**: Used for audit-critical operations where race conditions could cause data integrity issues:
  - Team deletion (`deleteTeam`)
  - Team invite acceptance (`acceptInvite`)

A centralized `TransactionManager` utility was introduced with:

- `withTransaction()` helper for automatic BEGIN/COMMIT/ROLLBACK handling
- Configurable isolation levels per transaction
- `auditCritical` flag that forces SERIALIZABLE isolation
- Proper connection release and error logging

---

## How to Verify

1. **SQL Injection Detection**: Query with a field containing `--` or `/*` and expect a 400 error
2. **Schema Validation**: Query a non-existent field on a schema-enabled collection and expect a 400 error
3. **Transaction Isolation**: Check logs for `"Transaction started"` entries showing the isolation level
