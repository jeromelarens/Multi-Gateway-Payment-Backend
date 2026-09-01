# Payment Reconciliation Engine

## Overview

In distributed payment systems, discrepancies can arise between an application's internal database state and the payment gateway's authoritative ledger due to dropped webhooks, expired sessions, or network failures.

The **Payment Reconciliation Engine** compares internal database records against gateway transaction states to detect and flag mismatches for resolution.

```
          Internal DB Payment                   Payment Gateway API
       (pay_123, ₹1000, PENDING)             (pi_123, ₹1000, SUCCESS)
                   │                                     │
                   └─────────────────┬───────────────────┘
                                     │
                                     ▼
                        [ Reconciliation Engine ]
                                     │
                              Status Compare
                              Amount Compare
                             Currency Compare
                                     │
                                     ▼
                   ┌───────────────────────────────────┐
                   │ ReconciliationRecord (MISMATCH)   │
                   │ Type: STATUS_MISMATCH             │
                   │ Internal: PENDING                 │
                   │ Gateway: SUCCESS                  │
                   └─────────────────┬─────────────────┘
                                     │
                                     ▼
                       [ Admin Resolution Flow ]
                     Requires justification reason
                                     │
                                     ▼
                    Record: RESOLVED + AuditLog entry
```

---

## Difference Types

| Difference Type | Condition | Action |
| :--- | :--- | :--- |
| `STATUS_MISMATCH` | Internal status (e.g. `PENDING`) $\neq$ Gateway status (e.g. `SUCCESS`) | Flagged for review; can be corrected by admin resolution or auto-transition |
| `AMOUNT_MISMATCH` | Internal amount $\neq$ Gateway captured amount | High-risk discrepancy; quarantined for manual investigation |
| `CURRENCY_MISMATCH` | Currency codes differ | Critical configuration error |
| `MISSING_GATEWAY_PAYMENT` | Internal record exists without matching gateway transaction ID | Check gateway logs or potential failed creation |
| `MISSING_INTERNAL_PAYMENT` | Gateway lists transaction not recorded in PostgreSQL | Potential orphaned payment |

---

## Scheduled & Manual Execution

Reconciliation can be triggered in two ways:
1. **Automated Cron**: Runs daily via the background worker queue (`RECONCILIATION_CRON="0 2 * * *"`).
2. **Admin On-Demand**: Triggered manually through BullMQ job submission.

---

## Admin Resolution API

Administrators can inspect open discrepancies and resolve them with mandatory auditing:

```http
GET /api/v1/admin/reconciliation
Authorization: Bearer <ADMIN_JWT>
Query Parameters: status=MISMATCH&gateway=STRIPE
```

```http
POST /api/v1/admin/reconciliation/:id/resolve
Authorization: Bearer <ADMIN_JWT>
Content-Type: application/json

{
  "resolution": "Gateway confirmed customer card charged; internal DB record updated to SUCCESS.",
  "action": "MARK_RESOLVED"
}
```

Resolution requests without a descriptive reason ($\ge 5$ characters) are rejected.
All resolutions produce an immutable `AuditLog` entry.
