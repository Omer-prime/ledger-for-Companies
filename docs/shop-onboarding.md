# Shop onboarding and opening finished stock

Use **Shop Setup** on the administrator sidebar. Complete Business Settings, then Financial Setup, Opening Stock, Customers & Suppliers, and the printer and readiness checks. Staff Accounts remains under Advanced.

1. In Financial Setup, select existing GL accounts where possible. For missing roles, create a guided account. This creates no financial entry or opening balance and does not change any active approval. Existing unclassified GL accounts require accountant confirmation; guided accounts cannot be mapped to a different role.
2. Physically count existing finished stock. In Opening Stock enter a unique batch and count date. Choose **Add one item** for a single thaan or loose suit, or **Import CSV** to paste or upload a list. Use distinct identifiers across all stock and active Business Settings grade codes. A full thaan must match the standard suit count; a partial contains fewer, and a loose item contains one.
3. Stage each item, then use **Preview batch** to validate the whole count. You can edit or remove staged items before confirming. For CSV, correct the source rows and preview again. Review each identifier, fabric, grade, suit count, length, historical cost and optional selling price. Confirm, then verify the count and total historical cost per identifier using the invoice or costing schedule. Supply omitted costs during verification. Selling price never becomes cost or sets a sale price. Evidence fields store document references rather than uploaded files. Size is descriptive text.
4. Have the accountant reconcile the batch against existing GL finished inventory and approve the carrying value and opening receivables. In Financial Setup, select the mappings and choose **Review and confirm approval**. Enter the verified batch and approval document references, retaining any approved production references. Do not use this process for stock missing from the GL; an accountant must post and reconcile any required opening entry separately. Import and approval create no opening journals. Only approved opening stock is selectable in POS.
5. Rehearse in an isolated database before shop use: sell one loose suit for cash; sell one suit from a full thaan and confirm three remain; sell a separate full thaan; then record a partially paid sale to a named customer and check the statement. Use distinct sale references. For each, compare inventory, daily report, journal and receipts. For a single-stock line the receipt shows unit value; multi-stock sales currently record a document total, not per-line prices.
6. In POS, print A4, A5 and 80 mm receipts and a 50 × 30 mm sticker using Save as PDF. Validate margins and scan on actual hardware before acceptance. Rehearse Windows reboot, local HTTPS, and encrypted backup and restore separately.

Example only (do not load into a customer database):

```csv
identifier,kind,fabric,design,size,grade,suits,meters,costPkr,sellingPricePkr,source,evidence
DEMO-FULL-1,full,Cotton,Blue,,A,4,6,2400,,Physical count,Invoice A
DEMO-PART-1,partial,Cotton,Green,,A,2,6,1200,,Physical count,Invoice A
DEMO-LOOSE-1,loose,Cotton,White,,A,1,6,600,,Physical count,Invoice A
```

Cost policy: the verified total in paisa for each package is allocated by cumulative rounded suit proportion. Thus four sequential suit sales expense the same cost as one whole-thaan sale. Opening items share the production stock ID namespace, stock deduction and atomic journal path, but never create a cutting, greige or dyeing record. Replaying the same import and batch reference is safe; reusing a reference with changed contents is rejected. Keep original count and cost documents for audit. No automated opening journal, inventory adjustments after verification, tax/returns support or customer data migration is included.

## Verification

- `npm run build` (48 routes), `node node_modules/typescript/bin/tsc --noEmit`, and `npm run lint -- src tests`: exit 0; one existing Reports warning.
- `node --experimental-strip-types --test tests/checkout-http.test.mjs`: 1/1.
- `node --experimental-strip-types --test tests/pos-suit-acceptance.test.mjs`: 1/1, including guided account retry and role checks, CSV preview/import/replay, unapproved stock rejection, loose/full/partial and part-paid sales, last-suit concurrency, and balanced sale journals.
- `node --experimental-strip-types --test tests/warehouse-values.test.mjs tests/checkout-print.test.mjs tests/textile-production.test.mjs tests/business-settings.test.mjs tests/phase0-security.test.mjs tests/phase0-foundation.test.mjs tests/phase0-http.test.mjs tests/phase0-journal.test.mjs`: 16/16.
- `node --experimental-strip-types --test tests/phase0-browser.test.mjs`: 1/1 on HTTPS Chromium; guided setup and opening CSV, existing warehouse/POS and A4/A5/80 mm receipts and 50 × 30 mm label dimensions.
- Fixtures were separate, newly designated loopback replica-set databases. No customer records or port 3000 were accessed. No physical print test or Windows installation acceptance was performed.
