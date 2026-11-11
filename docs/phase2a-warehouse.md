# Phase 2A warehouse foundation

The warehouse uses the existing installation database. Its records are additive and separate from the legacy inventory and ledger. Suppliers and dyeing processors resolve to active existing supplier or party accounts at posting time. Names are snapshotted so archived or renamed master data does not obscure history.

| Collection | Identity and purpose |
| --- | --- |
| warehouse_lots | Receipt reference as the lot ID. Supplier, fabric, received length, stage balances, original cost and currency, settings revision and receipt timestamp. |
| warehouse_dye_jobs | Dispatch reference as the job ID. Source lot, processor, dispatched and outstanding length, settings revision and dispatch timestamp. |
| warehouse_movements | Operation type and normalized document reference as the unique ID. Immutable receipt, dispatch or return legs, lot and job, actor, timestamp, revision, and exception reason. Partial returns remain individual records. |

All lengths are integer micrometers. A meter is 1,000,000 micrometers and a yard is 914,400. Input that cannot be represented exactly is rejected. Suits and thaans are outside this stock model. Stages are greige, processor, dyed, damaged, rejected and lost. Processor stock is excluded from warehouse-available greige stock. Damage and rejection go to separate quarantine stages and recorded loss leaves usable stock. The terminal stages remain in the material conservation equation for audit purposes.

The receipt records original currency and integer minor units per meter. The dashboard reports stage valuation grouped by currency at original receipt cost. Stored quantity and the cost numerator support exact allocation before display. Quarantine and loss values are shown for traceability and do not represent available stock. No dyeing service costs, currency conversion, journal entries or automated write-offs are posted.

Each mutation uses a replica-set transaction. Conditional updates prevent negative stock and a return above job outstanding. Retrying the same normalized reference and validated payload returns the original event with a replay indicator. A changed payload under the same reference returns a conflict. References are unique within each operation type per installation. A lost response can be retried with the same fields and reference. Snapshot dashboard reads keep aggregate balances and lists consistent.

Each event carries the current Business Settings revision at posting. A lot keeps the receipt revision, cost and currency for its entire life. Revision 0 means the installation defaults were used. Subsequent changes to display units or currency do not change stored amounts.

## Scope and limitations

The dashboard aggregates all lots and shows the latest 100 lots, open jobs and events. A known older lot or job reference can be entered directly. Stages serve as logical locations. This milestone has no bin tracking, approval queue, backdated postings, standalone correction or reversal workflow, processor billing, or chart-of-accounts mapping. Exception legs record material adjustments during returns. Cutting, grading, packing, finished inventory and POS are separate milestones. No legacy records are migrated.
