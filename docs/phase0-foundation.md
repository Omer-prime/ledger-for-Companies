# Phase 0 business foundation

This milestone keeps one application codebase with independent database configuration per installation. Business Settings and textile warehouse workflows remain separate milestones.

## Inventory cutover

The opening, purchase, sale and adjustment bulk APIs require an `Idempotency-Key` header. Keep the same key for retries of the same request. Keys are scoped to the authenticated user across inventory operations. The response contains a durable event ID. Replaying the key with changed authoritative inputs returns a conflict. Browser forms retain a pending key in the current page session for an unchanged payload. After a reload or uncertain outcome, reconcile the event before posting it again.

A MongoDB replica set is required. The first post for a product initializes a balance from its existing movements without editing those movements. Each write serializes on the product record and commits the conditional balance change, movements and posting record in one transaction. The balance uses millionths of the existing inventory quantity unit. New quantities accept at most six fractional digits. Reconcile legacy rounding, missing product or party references, duplicate openings and negative balances in a read-only audit before enabling writes. Legacy movement values and IDs remain available to historical reports.

Each product can have one opening event, including legacy opening movements. New postings cannot precede its latest dated movement. Same-day rows retain request order. Purchases add quantity and waste subtracts quantity in the same transaction. Downward corrections consume available quantity and upward corrections require a unit cost. Both require a reason. Legacy adjustments without direction continue to subtract. Client sale and purchase calculation metadata is ignored. Reports still calculate legacy weighted average from movements and use existing floating-point amounts. Validate customer unit precision, costing and historical reconciliation before cutover.

The new inventory collections use their standard unique MongoDB `_id` indexes for product balances and request events. Provision indexes and verify permissions on an empty replica-set fixture, back up the database, and stop older writers before enabling the new path. Older code and direct writes do not maintain the new balance collection. No stock-to-journal integration is exposed by this milestone.

## Financial boundary

Existing transaction documents remain single-account legacy entries. Search computes full matched debit and credit separately from its paginated rows and returns `totalRows`. Report exports and monthly rows describe the displayed rows, while the overall debit and credit reflect the full query. The separate reads can observe concurrent writes at slightly different points. A full reporting redesign and report snapshotting remain separate work.

Transaction reporting accepts an IANA `BUSINESS_TIME_ZONE` value and defaults to UTC for compatibility. Date ranges use inclusive local start and exclusive next-day end. Account statements calculate opening from prior entries and closing from opening plus net activity. Legacy date-only values stored at UTC midnight need customer review before enabling a non-UTC timezone. Historical records are not rewritten.

Products, parties and ledger categories archive in place through the existing DELETE routes. Standard selectors exclude archived records. Historical records retain the original references. Archives have no restore UI in this milestone.

The internal journal service records balanced integer-paisa debit and credit lines by unique source event, preserves the actor and reason, and allows a single idempotent compensating reversal per original entry. It uses separate journal collections and does not migrate or reinterpret legacy transactions. Customer chart-of-accounts mapping, business authorization for posting, and transactionally linking journal entries to stock and other business events are pending.


## Verification

Validation used a disposable MongoDB 7 single-node replica set, a loopback production Next build and a fresh Chromium profile. A self-signed certificate was accepted only inside the test browser context. The test browser intercepted the OS print call after opening the actual report print windows. PDF bytes were downloaded and checked in Chromium. Native print-dialog interaction and physical printer layout remain customer acceptance items.

| Command | Exit | Result |
| --- | --- | --- |
| `npm install --package-lock-only --ignore-scripts --no-audit --no-fund --fetch-retries=0 --registry=https://registry.npmjs.org/ --cache .cache --save-exact jspdf@4.2.1 jspdf-autotable@5.0.9` | 0 | Reviewed lock update. |
| `npm ci --ignore-scripts --no-audit --no-fund --fetch-retries=0 --registry=https://registry.npmjs.org/ --cache .cache` | 0 | 372 packages. Extraction was slow. Lifecycle scripts stayed disabled. |
| `npm audit --omit=dev --json --registry=https://registry.npmjs.org/ --fetch-retries=0 --cache .audit-cache` | 1 | Eight production findings, zero critical. |
| `npm audit --json --registry=https://registry.npmjs.org/ --fetch-retries=0 --cache .audit-cache` | 1 | Sixteen full-tree findings, one critical. See [advisories and paths](phase0-dependency-audit.md). |
| `node node_modules/typescript/bin/tsc --noEmit` | 0 | After correcting a wrapper parse error, a BigInt target incompatibility and waiting for the isolated install to finish. |
| `npm run lint -- src tests` | 0 | Four existing warnings and zero errors after the isolated install completed. |
| `npm run build` | 0 | Production Turbopack build, 35 generated pages, nested lockfile workspace warning. |
| `node --experimental-strip-types --test tests/phase0-security.test.mjs tests/phase0-foundation.test.mjs tests/phase0-http.test.mjs` | 0 | Seven passed, zero failed or skipped. |
| `node --experimental-strip-types --test tests/phase0-journal.test.mjs` | 0 | One passed after correcting the standalone Node test's Mongoose import shim. |
| `node --experimental-strip-types --test tests/phase0-browser.test.mjs` | 0 | One passed. HTTPS browser authentication, inventory PDF download, ledger print and both report print actions. |
| `git diff --check` | 0 | No whitespace errors. |

The HTTP rehearsal verified duplicate opening rejection, parallel sales with one winner, insufficient stock, replay of the winning event, purchase waste, both adjustment directions, rejection of a missing party and an archived product, and archived product and category history. It checked all-match totals across 2,003 rows with a 2,000-row page. A fixture MongoDB validator forced a confidential write to fail. The response was a generic 503, and the HTTP and browser server logs had zero matches for the tested sensitive fixture markers. The journal rehearsal verified balanced posting, idempotency, one reversal and preservation of the original. Browser coverage verified Secure and HttpOnly cookie attributes, authenticated navigation, logout, a new session, server expiry and denial of a privileged endpoint to an accountant.

## Remaining acceptance gates

The dependency audit is still open, including bundled PostCSS and a critical build/development tar advisory. Validate compatible updates in a separate lock review. Review failure redaction for infrastructure and externally managed logging in each installation. Customer acceptance requires ledger and stock reconciliation, chart of accounts, timezone and unit confirmation, archive policy, tested backups, PDF layout and print review. The current legacy posting path still accepts a syntactically valid category ID supplied by an authorized caller. Keep old inventory writers disabled or reconcile balances before returning to this release after rollback. Business Settings and warehouse processing are outside this checkpoint.

## Exact changed files

Compared with the reviewed base `e3e5667f9a874f77095fd587515b7175d04b5b4d`.

```text
docs/phase0-dependency-audit.md
docs/phase0-foundation.md
package-lock.json
package.json
src/app/(dashboard)/admin/purchases/page.tsx
src/app/(dashboard)/admin/reports/page.tsx
src/app/(dashboard)/admin/sales/page.tsx
src/app/api/accounts/route.ts
src/app/api/auth/login/route.ts
src/app/api/auth/logout/route.ts
src/app/api/auth/me/route.ts
src/app/api/banks/route.ts
src/app/api/banks/search/route.ts
src/app/api/categories/[id]/route.ts
src/app/api/categories/route.ts
src/app/api/inventory/adjustments/bulk/route.ts
src/app/api/inventory/opening/bulk/route.ts
src/app/api/inventory/purchases/bulk/route.ts
src/app/api/inventory/sales/bulk/route.ts
src/app/api/inventory/summary/all/route.ts
src/app/api/inventory/summary/route.ts
src/app/api/parties/[id]/route.ts
src/app/api/parties/route.ts
src/app/api/parties/search/route.ts
src/app/api/product-categories/route.ts
src/app/api/products/[id]/route.ts
src/app/api/products/route.ts
src/app/api/products/search/route.ts
src/app/api/transactions/[id]/route.ts
src/app/api/transactions/bulk/route.ts
src/app/api/transactions/route.ts
src/app/api/transactions/search/route.ts
src/app/api/users/route.ts
src/lib/api-security.ts
src/lib/business-dates.ts
src/lib/inventory-posting.ts
src/lib/inventory-request.ts
src/lib/journal-lines.ts
src/lib/journal-posting.ts
src/lib/wac.ts
src/models/Account.ts
src/models/InventoryMovement.ts
src/models/LedgerCategory.ts
tests/phase0-browser.test.mjs
tests/phase0-foundation.test.mjs
tests/phase0-http.test.mjs
tests/phase0-journal.test.mjs
tests/phase0-security.test.mjs
```
