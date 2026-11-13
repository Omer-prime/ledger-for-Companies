# Release engineering review

## Implementation checklist

- [x] Compare the staged and unstaged feature work with merged Phase 2B. Retain the local POS, printing, branding, and warehouse changes.
- [x] Inspect authentication and database selection. Add a guarded disposable administrator provisioning command.
- [x] Correct warehouse quantities, rupee entry, contact roles, ledger carry-forward and retry handling.
- [x] Preserve transactional POS stock deductions and separate sales revenue from old Udhar collections in the POS report.
- [x] Add the live accounting gate, print regression coverage, shop guide and Windows preparation.
- [ ] Approve and integrate live accounting mappings, calibrate printer hardware and rehearse the client installation.

## Authentication and fixture setup

The application selects the database named by `MONGODB_DATABASE` on the server specified by `MONGODB_URI`. A fixture login belongs to the disposable database where it was created. The prior validation runners explicitly selected different fixture databases and seeded their own users. This work did not inspect customer connection strings or query customer databases. No repository-local environment file or inherited MongoDB settings were visible during the audit, so the database used by the earlier failing browser session could not be confirmed.

With a dedicated loopback MongoDB replica set on port 37171 named `phase0`, set `MONGODB_URI` to `mongodb://127.0.0.1:37171/?replicaSet=phase0&directConnection=true` and `MONGODB_DATABASE` to a new name beginning with `oarlinks_disposable_`. Create the ignored `.phase0-validation` directory and run:

```powershell
node --experimental-strip-types scripts/provision-fixture-admin.mjs .phase0-validation/fixture-local.json
```

The script requires an empty disposable database and writes fresh credentials to a new local file. Protect that directory with Windows ACLs and delete the credential file when finished. Use the same URI and database when starting Next.js. Set `APP_ORIGIN` to the exact HTTPS browser origin. Credentials are not logged.

## Accounting and stock

The POS fixture path debits registered customer balances for invoices and credits them for payment. Walk-ins have no customer receivable. The till register records receipts separately, and repayments against old Udhar are excluded from new sales. Full accounting still needs approved accounts for cash, bank, receivables, sales, discounts, tax, inventory, COGS and returns. The live API rejects posts with an actionable configuration error before any stock or financial write. Fixture posting requires `OARLINKS_POS_FIXTURE=1`, the exact loopback fixture URI and an accepted fixture database name.

Warehouse entry accepts decimal PKR and sends integer paisa with explicit PKR currency. Existing receipts keep their original stored rate and currency. Valuations round to the nearest minor unit for display. Contact categories are additive metadata and keep prior IDs. Earlier unclassified parties remain selectable for compatibility.

Create Ledger carries the opening balance once. The browser reuses its bulk posting key for unchanged entries and the server commits keyed batches atomically. Unkeyed legacy callers retain their original behavior. A reload loses the browser's in-memory posting key. Check the ledger before submitting a possibly committed legacy batch again.

## Remaining acceptance

See the Windows runbook and shop guide. A customer workstation installation, reboot and backup restore need an isolated rehearsal. Physical thermal, sheet and sticker printing and barcode-scanner acceptance require the actual hardware. Review finance mappings and reconciliation before enabling customer POS posting.

## Verification results

| Command | Result |
| --- | --- |
| node node_modules/typescript/bin/tsc --noEmit | Exit 0 |
| npm run lint -- src tests | Exit 0, two existing warnings |
| npm run build | Exit 0, 43 static pages generated |
| node --experimental-strip-types --test tests/warehouse-values.test.mjs tests/checkout-print.test.mjs tests/textile-production.test.mjs tests/business-settings.test.mjs tests/phase0-security.test.mjs tests/phase0-foundation.test.mjs tests/phase0-http.test.mjs tests/phase0-journal.test.mjs | 16 passed |
| node --experimental-strip-types --test tests/checkout-http.test.mjs | 1 passed |
| node --experimental-strip-types --test tests/pos-suit-acceptance.test.mjs | 1 passed |
| node --experimental-strip-types --test tests/phase0-browser.test.mjs | 1 passed |
| node --experimental-strip-types scripts/provision-fixture-admin.mjs | Disposable provisioning passed, customer-style database name refused |

Final run totals were 19 passing tests, zero failures or skips. The Chromium test intercepted the OS print call, inspected the visible receipt and barcode DOM, and verified the PDF page boxes and single-page fit for A4, A5, 80 mm and 50 by 30 mm fixtures. Physical output and barcode decoding remain unverified. Earlier runs exposed a TypeScript filter type mismatch and outdated regression assertions and browser selectors, which were corrected before the final run. HTTPS login was verified with suite-created accounts. The generated administrator was verified through the provisioning command.

## Review boundaries

The POS fixtures exercise concurrency and idempotent replay through HTTP. The browser suite exercises the warehouse lost-response flow and prints a seeded POS receipt. An end-to-end browser POS posting with an intentionally dropped response remains unverified. The report exposes selected-customer outstanding and daily new Udhar. It does not establish an approved business-wide accounts-receivable balance. Historical sale lines without a full-thaan snapshot are excluded from that specific count. Legacy unkeyed financial posting and the client startup, reboot, and restore rehearsal remain outside the verified paths.
## Manual acceptance follow-up

- Production build: `npm run build` exit 0 (43 routes generated). TypeScript passed in the build; standalone `node node_modules/typescript/bin/tsc --noEmit` also passed during the edit cycle. ESLint reported one existing unused helper warning in Reports.
- Disposable replica-set runs via `node --experimental-strip-types --test`: checkout HTTP 1/1; suit-sale/POS and statement comparison 1/1; Phase 0–2B, settings, valuation, barcode and journal 16/16; HTTPS Chromium 1/1. No matching sensitive fixture markers in server logs. The initial sandbox-only runs hit loopback EACCES and a Turbopack subprocess failure; both cleared on isolated rerun.
- Stock: a return without a loss reason was rejected without decrementing processor stock. The confirmed return left 9,400 m dyed and 600 m lost, with zero outstanding; replay returned HTTP 200 without another movement. No original manual challans were inspected because their disposable database was not identified.
- Receivables: the fixture reconciled Rs 20,000 credit sale minus Rs 8,000 recovery plus Rs 6,000 unpaid on a later sale to Rs 18,000. POS and statement agreed; paid sales added no debt. Historical worksheet figures still require independent reconciliation.
- Chromium checked statement navigation, a posted row, mobile width, print dispatch, A4/A5 PDF page dimensions, and existing POS print views. Hardware printing, barcode scanning, a single browser journey covering all stages through live sale, full platform visual acceptance, and customer Windows backup/restore and restart rehearsal remain pending.
- Live POS posting remains blocked pending accounting approval and transactional journal integration. No customer data was accessed.
