# Textile POS accounting release gate

New postings are off until an administrator records the owner/accountant approval reference under Business Settings → Textile POS accounting. Choose six distinct active general-ledger accounts: cash, bank clearing, receivables control, sales revenue, finished inventory, and COGS. Account classification is an approval responsibility: the existing chart model identifies GL accounts but does not distinguish these accounting roles. No accounts or settings are created automatically. Revoking approval blocks new postings; an already committed reference can still be replayed. A posting already in progress uses its transaction snapshot and records that revision.

Approve only completed cutting orders whose inventory carrying value has already been reconciled and capitalized in the approved ledger. Enter the verified order references explicitly; a new order is not automatically approved. Opening receivables must reconcile to the control account before approving Udhar. Never import old worksheet figures or retroactively journal old checkout documents without a separate reconciliation. Existing legacy reports remain separate.

The implemented policy assigns the verified historical PKR raw-fabric price per meter to sold suit length, tracing thaan → cutting batch → raw lot. For each thaan, round cumulative cost to whole paisa and post the difference for each sale; splitting a thaan does not change total COGS. Missing, inconsistent, zero, or foreign-currency cost blocks a sale. Conversion costs, loss allocation, taxes, discounts, returns and reversals require separately approved workflows. Raw-length valuation is appropriate only when the accountant verifies it matches the actual booked carrying value; see [IAS 2 inventory cost guidance](https://www.ifrs.org/issued-standards/list-of-standards/ias-2-inventories/). If dyeing, labor, freight or other eligible costs are material and unaccounted for, do not approve those orders.

Each supported operation appends to the existing journal in the same replica-set transaction as the checkout record, stock update, receipt and applicable customer rows. Sales debit cash/bank and/or receivables and credit revenue; sold stock debits COGS and credits finished inventory. Recovery of old Udhar debits cash/bank and credits receivables; it does not create revenue. Walk-ins have no customer account. A deterministic journal ID and checkout ID link the records; historical checkout records with no link are not newly journaled on replay.

For date reconciliation, an administrator can read GET /api/pos-accounting?date=YYYY-MM-DD. It shows POS-only GL debit and credit movements per account in paisa, not whole-ledger balances. Reconcile revenue to daily sales, cash/bank to receipts, receivables movement to new debt less old-debt payments, and inventory credits to the documented sold costs. To reconcile balances, add verified opening balances and separately approved capitalization and other accounting movements. Warehouse valuation is operational and does not post capitalization entries.

Before customer use: confirm the approval reference, chart, capitalization and tax policy; reconcile opening receivables and inventory; test encrypted backup/restore and Windows reboot recovery; and validate physical printers, paper sizes, and Code 128 scanning. Do not enable customer posting as a way to rehearse.

## Verification commands

- `npm run build`
- `node node_modules/typescript/bin/tsc --noEmit`
- `npm run lint -- src tests`
- `node --experimental-strip-types --test tests/checkout-http.test.mjs`
- `node --experimental-strip-types --test tests/pos-suit-acceptance.test.mjs`
- `node --experimental-strip-types --test tests/warehouse-values.test.mjs tests/checkout-print.test.mjs tests/textile-production.test.mjs tests/business-settings.test.mjs tests/phase0-security.test.mjs tests/phase0-foundation.test.mjs tests/phase0-http.test.mjs tests/phase0-journal.test.mjs`
- `node --experimental-strip-types --test tests/phase0-browser.test.mjs`

The HTTP and Chromium runs require fresh, explicitly named loopback MongoDB replica-set fixtures and a local HTTPS proxy. The POS fixtures now use the real administrator approval API, not an environment bypass. The daily fixture reconciles Rs 45,000 revenue, Rs 23,000 cash receipts, Rs 4,000 bank receipts and Rs 18,000 net receivables; COGS and inventory credits agree with sold cost. Unapproved mappings, inconsistent cost and forced journal failure are tested with no partial writes.

Final run: build (44 routes), TypeScript and ESLint exited 0; ESLint retained one existing Reports warning. Checkout HTTP 1/1, suit-sale HTTP 1/1, Phase 0–2B/unit/HTTP 16/16, and HTTPS Chromium 1/1 (19 passed, 0 failed). Chromium used real stock from the warehouse and production fixture, posted a walk-in sale, lost and retried the response, and checked the daily report, statements and printed PDFs. No sensitive fixture markers were found in the server logs.
