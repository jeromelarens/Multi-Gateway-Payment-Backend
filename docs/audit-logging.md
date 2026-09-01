# Immutable Audit Trail

## Overview

The **Audit Trail** provides an append-only log of sensitive financial and administrative operations to ensure compliance, non-repudiation, and operational traceability.

---

## Audited Actions

| Action | Entity Type | Trigger |
| :--- | :--- | :--- |
| `PAYMENT_CREATED` | `PAYMENT` | User initiates payment checkout |
| `PAYMENT_STATE_TRANSITION` | `PAYMENT` | Payment transitions (e.g. `PENDING` -> `SUCCESS`) |
| `REFUND_CREATED` | `REFUND` | Refund initiated via Stripe or Cashfree |
| `WEBHOOK_REPROCESSED` | `WEBHOOK` | Administrator manually replays dead-letter webhook |
| `RECONCILIATION_RESOLVED` | `RECONCILIATION` | Administrator resolves a reconciliation mismatch |
| `LEDGER_CREDIT_RECORDED` | `LEDGER` | Credit entry appended to financial journal |
| `LEDGER_DEBIT_RECORDED` | `LEDGER` | Debit entry appended to financial journal |

---

## Security & Credential Stripping

Before persisting any audit entry, `auditService.log` sanitizes the metadata payload:
* Automatically deletes `password`, `token`, `secretKey`, and `webhookSecret`.
* Prevents leakage of client secrets, PAN numbers, or CVVs into long-term logs.

---

## Schema

```prisma
model AuditLog {
  id          String   @id @default(cuid())
  actorUserId String?  // Null for automated background workers
  action      String   // e.g. "WEBHOOK_REPROCESSED"
  entityType  String   // e.g. "WEBHOOK", "PAYMENT"
  entityId    String?  // Target record identifier
  requestId   String?  // Trace correlation ID
  ipAddress   String?  // Client IP (if HTTP request)
  userAgent   String?  // Client user-agent
  metadata    Json?    // Sanitized context snapshot
  createdAt   DateTime @default(now())

  actor       User?    @relation(fields: [actorUserId], references: [id], onDelete: SetNull)

  @@index([actorUserId])
  @@index([entityType, entityId])
  @@index([action])
  @@index([createdAt])
}
```

Audit records cannot be edited or deleted through application APIs.
