# Database provider credentials implementation plan

**Goal:** Complete the approved encrypted-database workflow so provider keys entered in the existing owner UI also serve scheduled Python collection.

**Architecture:** Keep the UI, API, schema and Node AES-256-GCM format. Python reads the same owner-scoped database row only in live mode, with the existing environment override preserved. Keep the master key outside the database/repository, preserve the deployed key, and do not cache decrypted credentials between runs.

**Scope:** Add a Python credential resolver and cross-language/integration tests; update the FRED adapter and optional scheduled missing-key handling; include both US equity indexes in deployment collection. No destructive schema changes or UI redesign.

## Execution
- [x] Write failing tests for Node-encrypted credentials, malformed/wrong keys, environment precedence, preview isolation, database replacement/deletion and explicit CLI skip behavior.
- [x] Implement resolver using cryptography AESGCM; pin the dependency; update adapter and scheduled FRED invocation.
- [x] Run full Python and Web checks, including isolated PostgreSQL integration; preserve unrelated deploy files.
- [ ] Back up the live instance, deploy only changed files and dependency, preserve secrets and permissions; verify authenticated API-to-collector flow without sending test credentials upstream.
- [ ] Verify private/public HTTPS and timer state, commit/push relevant changes, report remaining user step: entering the real Key.

## Review focus
- Wrong master key or altered ciphertext must fail safely without plaintext in logs.
- Database lookup must remain owner-scoped and live-only.
- Replacement/deletion must take effect on the next read.
- Missing optional keys must not fail scheduled collection or trigger upstream calls.
- Existing market data, master key and unrelated deployment work must survive deployment.
