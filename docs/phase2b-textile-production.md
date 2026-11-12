# Phase 2B textile production

The warehouse links to the production workspace at `/admin/warehouse/production`. Administrators and managers can post documents. Accountants can read production and finished stock. The endpoints use the existing session, origin and role checks.

## Material and records

| Collection | Identity and contents |
| --- | --- |
| `textile_cutting_orders` | Allocation document number. Source lot, allocated micrometers, intended and actual batch suit length, receipt cost and currency snapshot, settings revision, unclassified count and per-grade unpacked and packed counts. Completion adds a unique batch reference, quarantined count, returned material, usable offcuts, waste and actual consumption. |
| `textile_thaans` | Unique thaan number. Source lot, order and batch, grade contents, suit count, actual suit length, total length, target count, packing defaults, revision, actor and time. Full and partial status derives from actual count and the recorded Business Settings default. |
| `textile_production_movements` | Operation and normalized document reference. Append-only allocation, completion, grade, correction and packing documents with actor, timestamp, source references, settings revision and actual quantities. |

All material amounts use integer micrometers. A cutting allocation moves available dyed stock into work in progress. Completion reconciles allocated length to usable and quarantined suits, uncut returns, recoverable offcuts and waste. Uncut material returns to the source lot's dyed balance. Usable offcuts remain in the cutting order's recoverable offcut balance. They are traceable and excluded from available dyed fabric and finished stock. Actual waste comes from the completion document. The settings loss percentage is a planning input for future workflows.

Each allocation records a planned suit length. At completion the operator can confirm the planned length or enter the measured length for one uniform batch. The graded counters divide usable suits into unclassified, graded unpacked and packed counts. Corrections move only unpacked suits and record both grades and a reason. New classification and correction destinations must be active settings grades. Prior grading movements and thaan contents retain their historical labels. A grade that is later disabled can still be packed from its existing classified balance.

New thaans contain one grade. The required scenario uses four full A-grade thaans, two full B-grade thaans, one full C-grade thaan, and one partial B-grade thaan. The server records the standard suit count from the Business Settings revision used at posting. The recorded Business Settings default determines full or partial status even after settings change. Historical operator targets and contents remain in the original records. Historical counts above the saved default appear as oversize. Exact retries return the original posting. Actual suit length comes from the cutting batch.

One MongoDB transaction commits the warehouse balance or order changes, the thaan when applicable, and the immutable movement. Unique references provide idempotent retries and conditional allocations enforce the available dyed balance. Concurrent changes to the same order serialize through MongoDB write conflicts. Reconstruct warehouse availability by combining Phase 2A dyeing movements with Phase 2B allocation and uncut-return movements. Existing receipt and dyeing history stays in its original records.

## Limits

Finished inventory counts committed thaans. Unpacked, unclassified and quarantined suits are listed separately. Individual suit serials, recoverable offcut reuse, quarantined output disposition, unpacking and correction of packed thaans require later workflows. The dashboard aggregates all records and lists the latest 100 entries in each detail list. Receipt cost and currency trace back through the cutting order and source lot. Production costs and financial journals require approved accounting mappings.


## Verification and changed files

The final run used Node 22, a disposable MongoDB 7 replica set and Chromium over loopback HTTPS.

- `node node_modules/typescript/bin/tsc --noEmit` exited 0.
- `npm run lint -- src tests` exited 0 with zero errors and three existing warnings.
- `npm run build` exited 0 with 41 generated pages.
- `node --experimental-strip-types --test tests/textile-production.test.mjs tests/business-settings.test.mjs tests/phase0-security.test.mjs tests/phase0-foundation.test.mjs tests/phase0-http.test.mjs tests/phase0-journal.test.mjs` passed 11 tests with zero failures or skips.

The integration fixture verified 180 m allocated, 29 suits at 6 m, 6 m of waste and 174 m packed. It covered duplicate requests, allocation and packing races, authorization, disabled and historical grades, settings snapshots, and forced final-write failures that rolled back allocation, completion and packing. The pre-existing login throttle test now seeds its threshold in the current and next clock windows so rollover cannot invalidate the fixture.

Changed files from merged base `d65361a`:

```text
docs/phase2b-textile-production.md
src/app/(dashboard)/admin/warehouse/page.tsx
src/app/(dashboard)/admin/warehouse/production/page.tsx
src/app/api/textile-production/route.ts
src/lib/textile-quantities.ts
src/models/TextileProduction.ts
tests/phase0-browser.test.mjs
tests/phase0-http.test.mjs
tests/phase0-security.test.mjs
tests/textile-production.test.mjs
```

The HTTPS suite ran with `node --experimental-strip-types --test tests/phase0-browser.test.mjs` and passed one test with zero failures or skips. Chromium exercised all four mobile production steps and verified that a thaan retained a measured 5.5 m suit length.  Earlier runs exposed a grade selector mismatch and a clock-window dependency in the login fixture. Both test issues were corrected before the final run.