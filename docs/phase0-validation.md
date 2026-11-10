# Phase 0 validation follow-up

This follow-up supersedes the dependency and test status in the original checkpoint. The recovery branch is published and [PR #1](https://github.com/Omer-prime/ledger-for-Companies/pull/1) is a draft. Remote main was verified at `6a47e644fa826e35d1871b94e23837506902a017`.

## Dependency review

The restricted runner could not resolve the npm registry and an offline attempt lacked cached tarballs. Approved access to the official registry resolved the problem without changing DNS, TLS verification, or npm integrity checking. Resolution and install ran in an ignored validation directory without application environment files. The build and application server were configured to use only a loopback fixture database.

The lock update pins Next and eslint-config-next to 15.5.29 and React and React DOM to 19.1.2. This addresses the original [React Server Components advisory](https://github.com/vercel/next.js/security/advisories/GHSA-9qr9-h5gf-34mp) and picks up the [Next 15.5.29 security release](https://github.com/vercel/next.js/releases/tag/v15.5.29). The 14 changed package versions were confined to those packages and the associated Next env, lint and SWC packages. Resolved entries used npm registry URLs and had integrity metadata.

The pre-install lock review identified lifecycle hooks in four unchanged packages. Installed manifests confirmed Tailwind Oxide invokes its install script, core-js invokes its postinstall module, sharp invokes its native install check, and unrs-resolver invokes the napi postinstall check. All install hooks remained disabled.

## Command results

| Command | Exit | Evidence |
| --- | --- | --- |
| `npm install --package-lock-only --ignore-scripts --no-audit --no-fund --fetch-retries=0 --registry=https://registry.npmjs.org/ --cache .cache --save-exact next@15.5.29 react@19.1.2 react-dom@19.1.2` | 0 | Resolved production pins. |
| `npm install --package-lock-only --ignore-scripts --no-audit --no-fund --fetch-retries=0 --registry=https://registry.npmjs.org/ --cache .cache --save-dev --save-exact eslint-config-next@15.5.29` | 0 | Resolved matching lint config. |
| `npm ci --ignore-scripts --no-audit --no-fund --fetch-retries=0 --registry=https://registry.npmjs.org/ --cache .cache` | 0 | 372 packages installed in isolation. |
| `npm audit --omit=dev --json --registry=https://registry.npmjs.org/ --fetch-retries=0 --cache .audit-cache` | 1 | 11 package findings, 2 critical, 7 high, 2 moderate. Critical entries were jspdf and jspdf-autotable. The remaining Next entry was a transitive PostCSS finding. |
| `node node_modules/typescript/bin/tsc --noEmit` | 2, then 0 | Corrected the stale bulk transaction ObjectId reference. |
| `npm run lint -- src tests` | 0 | Zero errors, four warnings in reports, sales and CreateLedgerClient after removing an unused sales API import. |
| `npm run build` | 1, then 0 | Restricted runner could not start the Turbopack CSS worker. Approved isolated rerun compiled and generated 32 pages. Next warned about root inference from nested lockfiles. |
| `node --experimental-strip-types --test tests/phase0-security.test.mjs tests/phase0-http.test.mjs` | 0 | Five passed, zero failed or skipped. |
| `git diff --check` | 0 | Recovery changes passed whitespace checks. |

## Disposable database rehearsal

Used the pre-existing Mongo 7 image with a single-node replica set named `phase0`, bound the host port only to `127.0.0.1:37171`, and tested the production build on `127.0.0.1:37172`. The fixture suite requires an empty `oarlinks_phase0_fixture` database, verifies the writable replica primary, and seeds users and legacy ledger data within a Mongo transaction. The server and temporary container were stopped after testing.

The HTTP suite verified 401 for anonymous and invalid or legacy cookie requests, 403 for insufficient permissions and cross-origin mutations, session cookie attributes, revocation, expiry, and disabled-user rejection. It verified the per-account throttle, password hash storage and response redaction, offline superadmin provisioning, admin delegation limits, and a non-destructive legacy password reset. It verified authorized ledger posting, rejection of in-place transaction edits and deletes, unchanged legacy ledger data, the seed 404, and an opening inventory movement and summary. The fixture applied and verified both TTL indexes and the unique email index. Cookie headers were checked through loopback HTTP with explicit test cookies. Browser cookie transport under HTTPS and representative-load throttling remain unverified.

Static review found no explicit credential or payload logging in the API handlers. The captured server logs contained zero matches for the tested fixture-sensitive markers. Unexpected unhandled database failures can still reach framework logs. Error-path redaction needs targeted verification before acceptance.

## Acceptance gate

The [original runbook](phase0-security.md) still applies to incident containment, verified backups, credential rotation, approved roles, fresh credentials, configuration and index provisioning. The replica-set rehearsal validates the reset procedure on fixtures. Production data was not accessed. No deployment or merge occurred.

Phase 0 remains open. Review and remediate the production audit findings, verify failure-path log redaction and browser behavior over HTTPS, and close the existing atomic inventory, reversal, reference integrity, and reporting gaps. Keep the PR in draft and defer Business Settings and Warehouse implementation.
