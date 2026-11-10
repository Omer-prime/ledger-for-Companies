# Phase 0 final engineering review

Base reviewed at `43b6dcd2e514f12cdd47e55b4ab7d5fbfe583f71`. This record supersedes the audit and verification status in the earlier Phase 0 reports.

## Dependency security

Mongoose is pinned to 8.24.1 and Zod to 4.6.6. Compatible lock updates include tar 7.5.22, sharp 0.35.5, fflate 0.8.3 and source-map-js 1.2.2. Next remains on 15.5.29, with an override scoped to its PostCSS dependency at 8.5.23. The app's root PostCSS resolves to 8.5.32. No forced audit fix or framework major upgrade was applied. The resolved lock was checked for npm registry URLs and integrity metadata before install. Lifecycle scripts remained disabled. The updated sharp package requires Node 20.9 or later. Validation used Node 22.19.0.

The production audit exited 0 with zero findings. The full audit exited 1 with six moderate package entries and no high or critical entries. All six trace to [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249). The affected copy is `node_modules/@typescript-eslint/typescript-estree/node_modules/minimatch@9.0.9`. The affected range is 7.0.0 through versions below 11.0.1. The five parent entries are `@typescript-eslint/eslint-plugin`, `parser`, `type-utils`, `typescript-estree`, and `utils`, all locked at 8.44.1. The fixed minimatch version is outside the installed parser's supported major. Registry metadata for the latest typescript-estree 8.72.2 still declares minimatch ^10.2.2. The residual risk is development-time denial of service if untrusted glob patterns reach the affected matcher. The runtime audit does not include this path. Reassess when the ESLint toolchain supports the patched major.

The narrowly scoped override addresses the previously reported Next/PostCSS advisory chain in the resolved npm tree, including [GHSA-fxqj-rqcc-2cmp](https://github.com/postcss/postcss/security/advisories/GHSA-fxqj-rqcc-2cmp). Recheck the override when upgrading Next, and evaluate removal once the upstream package includes a fixed version.

## Data compatibility and atomic boundary

Each new sale or purchase batch requires a stable document number. Use the originating business document's internal reference, including any series or counterparty prefix required for uniqueness. Numbers are trimmed and normalized to uppercase. The number is unique within an operation type and database. Identical replays return the existing event across actors and transport keys. Reusing the document with changed inputs returns 409. The database writes the balance, movement records, document event, and transport-key alias in the same transaction. A retry after a reload must reuse the original document number. Distinct numbers are treated as distinct business operations, even when the rows are identical.

Earlier inventory events keep their original IDs and request-key records. Older events have no business document number to reconcile automatically. Existing API clients must supply the new field for purchase and sale batches. Switch writers together. The forms disable editing and duplicate submission while in flight, reject partially entered rows, and reset rows, the number and cached previews on success.

Single and bulk legacy postings now require supplied categories to exist and be active. Supplied accounts must exist and be active. Existing implicit Unassigned account behavior remains available for rows without an explicit account. Historical archived records remain readable through their saved references. Legacy postings remain single-account entries.

The internal journal writer can join a caller-owned active MongoDB transaction. A trusted integration can commit explicit balanced lines with its stock business event using the same session and source event ID. The caller must propagate any posting error to abort the whole transaction. Existing inventory endpoints still post inventory only. The application has no approved account mappings, so it does not infer accounts or generate journals for them. No legacy data was migrated.

## Verification and recommendation

**READY FOR ENGINEERING MERGE REVIEW.** The production audit is clean and all requested regression gates passed on disposable fixtures. The development-only advisory, new document-number requirement, and journal integration boundary are explicit review items. Engineering approval and customer acceptance remain separate gates.

| Command | Exit | Result |
| --- | --- | --- |
| `npm install --package-lock-only --ignore-scripts --no-audit --save-exact --fetch-retries=0 --cache $cache mongoose@8.24.1 zod@4.6.6` | 0 | Patched direct pins. |
| `npm audit fix --package-lock-only --ignore-scripts --fetch-retries=0 --cache $cache` | 1 | Applied compatible fixes. The remaining findings included the Next/PostCSS chain before the scoped override. |
| `npm install --package-lock-only --ignore-scripts --no-audit --no-fund --fetch-retries=0 --cache $cache` | 0 | Resolved the scoped Next/PostCSS override. |
| `npm ci --ignore-scripts --prefer-offline --no-audit --no-fund --fetch-retries=0 --cache $cache` | 0 | Installed 374 packages in isolation. |
| `npm ls sharp postcss mongoose zod tar --all` | 0 | Verified locked tree. Node resolution from Next also returned PostCSS 8.5.23. |
| `npm audit --omit=dev --json --fetch-retries=0` | 0 | Zero findings. |
| `npm audit --json --fetch-retries=0` | 1 | Six moderate entries from one development advisory. |
| `node node_modules/typescript/bin/tsc --noEmit` | 0 | Passed. |
| `npm run lint -- src tests` | 0 | Zero errors, three warnings in reports and CreateLedgerClient. |
| `npm run build` | 0 | Production Turbopack build, 35 generated pages. Nested lockfile workspace inference warning. |
| `node --experimental-strip-types --test tests/phase0-security.test.mjs tests/phase0-foundation.test.mjs tests/phase0-http.test.mjs tests/phase0-journal.test.mjs` | 0 | Eight passed, zero failed or skipped. |
| `node --experimental-strip-types --test tests/phase0-browser.test.mjs` | 0 | One passed, zero failed or skipped. |
| `git diff --check` | 0 | No whitespace errors. |

The HTTP and journal suites used a disposable MongoDB 7 replica set. Tests covered simultaneous cross-user purchase replay, sale replay with a different actor and transport key, changed-payload and key conflicts, parallel oversell protection, archived account and category rejection, historical reference preservation, and aggregate totals over 2,003 rows. The journal fixture committed a stock marker and a single journal through a shared transaction, and confirmed that a forced rollback removed both. The stock marker was a fixture write. Inventory routes remain uncoupled from live journal posting pending approved accounting mappings.

Chromium over loopback HTTPS verified that each form sent one POST after two immediate clicks and cleared its rows and document number after success. It also exercised login, expiry, logout, role restrictions, inventory PDF download, ledger print, and both report print actions. Native printing was intercepted in the test, so printer layout still needs customer acceptance. The HTTP and browser log scans found zero tested sensitive fixture markers.
## Exact changed files

- `package.json`
- `package-lock.json`
- `src/app/(dashboard)/admin/purchases/page.tsx`
- `src/app/(dashboard)/admin/sales/page.tsx`
- `src/app/api/transactions/route.ts`
- `src/app/api/transactions/bulk/route.ts`
- `src/lib/inventory-posting.ts`
- `src/lib/journal-posting.ts`
- `tests/phase0-browser.test.mjs`
- `tests/phase0-http.test.mjs`
- `tests/phase0-journal.test.mjs`
- `docs/phase0-merge-readiness.md`
