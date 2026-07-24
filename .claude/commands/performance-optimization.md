---
description: Analyze code for database query issues, algorithmic efficiency, memory management, and caching opportunities
argument-hint: [path or glob, optional]
---

Analyze the codebase (or `$ARGUMENTS` if given — a file, directory, or glob) for performance issues. Focus on this project's stack: Node.js/Express backend, Supabase (PostgreSQL) via repositories, calculators, Puppeteer PDF generation, and Vanilla JS frontend.

Scope: if `$ARGUMENTS` is provided, analyze only that path/glob. Otherwise, analyze `backend/src` and `frontend`, prioritizing files touched in recent commits (`git log --stat -10`) and hot paths (routes, controllers, services, repositories, calculators).

Check for these categories:

1. **Database queries** (`backend/src/repositories`, `backend/src/services`)
   - N+1 query patterns (loops issuing one query per iteration instead of a single batched/joined query)
   - Missing `WHERE` filters that force filtering in JS after fetching full tables
   - Repeated identical queries within the same request lifecycle that could be deduplicated or cached
   - Missing indexes implied by query patterns (check against `backend/migrations`)
   - Unbounded `SELECT *` on large tables without pagination/limits
   - Transactions/batching opportunities for multi-step writes

2. **Algorithmic efficiency**
   - Nested loops over collections that could be O(n) with a Map/Set lookup
   - Repeated array `.find()`/`.filter()` inside loops instead of pre-indexing
   - Unnecessary re-sorting or re-computation of the same derived data
   - Synchronous heavy computation blocking the event loop (e.g., large PDF/template generation, Excel parsing with SheetJS)

3. **Memory management**
   - Large objects/arrays held in memory unnecessarily (e.g., full Excel sheets, full query results) when streaming or pagination would do
   - Puppeteer browser/page instances not closed on all code paths (including error paths) — check `backend/src/templates` and PDF generation services
   - Event listeners or timers not cleaned up
   - Memory leaks from closures capturing large scope in long-lived structures (e.g., caches without eviction)

4. **Caching opportunities**
   - This project already uses `withCache` in `cotizacion.service.js` for catalog data — check whether other read-heavy, rarely-changing lookups (rubros, coberturas, tasas, planes) are cached consistently and invalidated correctly on admin writes
   - Frontend: repeated `fetch` calls for the same static/catalog data across screens (`frontend/cotizar`, `frontend/admin`) that could share a cache module (see the pending Sprint 2 item to unify catalog cache in `ESTADO_PROYECTO.md`)
   - Cache invalidation correctness: stale-cache bugs are worse than no cache — flag any cache without a clear invalidation path

For each finding, report:
- File and line reference
- What's wrong and why it matters (concrete impact: query count, memory growth, blocking time)
- A concrete fix, respecting the existing layered architecture (`routes → controllers → services → repositories`) and the `RamoCalculator` interface — do not propose introducing a new framework or abstraction to fix a local issue

Do not apply fixes automatically — report findings first (using `ReportFindings` if available, otherwise a structured list ranked by impact) and wait for confirmation before editing code.
