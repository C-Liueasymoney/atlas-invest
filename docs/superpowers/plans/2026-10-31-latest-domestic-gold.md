# Latest domestic gold delivery

User-approved policy: prioritize newest official domestic quote whenever the user loads or refreshes; valid latest snapshot then daily close are fallbacks. Preserve source dates and disclose unknown precise event times. Research licensed-provider access and costs using official sources; no purchases or sales outreach authorized.

- [x] Reproduce 854.76 as official 2026-10-30 close; verify the official delayed Au99.99 page contains a newer price.
- [x] Test exact-contract parsing, zero/missing/future rejection and fallback selection before implementation.
- [x] Implement authenticated latest-quote GET/POST, explicit force-refresh through existing budgets/circuit, separate monotonic snapshot storage, and visible latest-vs-history labels.
- [x] Test manual cache bypass, retained failure state, no historical rewrites and six concurrent PostgreSQL requests without nested connection acquisition.
- [x] Run Web74, browser10, real source smoke, lint, typecheck and production build; preserve unrelated workspace edits.
- [x] Document official provider application paths, unverified entitlements and lack of published applicable API prices.
- [x] Build in an isolated server directory with one worker and memory limits; smoke-test before changing production.
- [x] Switch with backup/rollback; verify authenticated manual refresh from public HTTPS; commit and push only related files.
