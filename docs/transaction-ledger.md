# Immutable Transaction Ledger

## Overview

Financial transactions require an audit-proof, immutable journal of all value movement. The **Transaction Ledger** follows double-entry style accounting principles, ensuring that money into the platform, money out (refunds), and corrections are preserved permanently in an append-only table.

```
                      [ Payment Success ]
                               │
                               ▼
               ┌───────────────────────────────┐
               │  TransactionLedger: CREDIT    │
               │  Type: PAYMENT                │
               │  Amount: ₹1,000.00            │
               │  Idempotency: STRIPE:evt_1:PAY│
               └───────────────┬───────────────┘
                               │
                [ Partial Refund Request ₹300 ]
                               │
                               ▼
               ┌───────────────────────────────┐
               │  TransactionLedger: DEBIT     │
               │  Type: PARTIAL_REFUND         │
               │  Amount: ₹300.00              │
               │  Idempotency: STRIPE:ref_1:REF│
               └───────────────┬───────────────┘
                               │
                               ▼
                   [ Net Settled: ₹700.00 ]
                   [ Remaining Refundable: ₹700.00 ]
```

---

## Ledger Entry Schema

| Field | Type | Description |
| :--- | :--- | :--- |
| `id` | String (CUID) | Unique primary key |
| `userId` | String | Account owner associated with the financial event |
| `orderId` | String? | Associated order reference |
| `paymentId` | String? | Associated internal payment record |
| `refundId` | String? | Associated refund record (if debit) |
| `type` | Enum | `PAYMENT`, `REFUND`, `PARTIAL_REFUND`, `ADJUSTMENT`, `FEE` |
| `direction` | Enum | `CREDIT` (money received) or `DEBIT` (money returned/paid out) |
| `amount` | Decimal(12, 2) | Exact currency amount (fixed precision; floating point arithmetic prohibited) |
| `currency` | String | ISO 4217 currency code (default `INR`) |
| `gateway` | Enum | `STRIPE` or `CASHFREE` |
| `idempotencyRef` | String (Unique) | Deterministic composite business key preventing duplicate entries |
| `externalReference` | String? | Gateway payment ID, charge ID, or webhook event ID |
| `description` | String? | Human-readable explanation of the entry |
| `metadata` | JSON? | Gateway metadata snapshot |
| `createdAt` | DateTime | Timestamp when entry was committed |

---

## Immutability Safeguards

1. **No UPDATE or DELETE Methods**: The `LedgerRepository` intentionally does not expose `update`, `updateMany`, `delete`, or `deleteMany`.
2. **Corrections Via Adjustment**: If an accounting discrepancy is identified, an `ADJUSTMENT` entry with `direction: CREDIT` or `direction: DEBIT` must be appended. Historical entries are never modified.
3. **Database Constraints**: `idempotencyRef` has a PostgreSQL unique constraint (`@@unique([idempotencyRef])`). Concurrent attempts to record the same event return the existing record without modifying financial state.

---

## Refund Balance Calculation

When a refund is processed:
1. `ledgerService.getPaymentBalance(paymentId)` queries all entries for that payment.
2. Sums total credits: $\sum \text{CREDIT}$.
3. Sums total debits: $\sum \text{DEBIT}$.
4. Computes $\text{Remaining Refundable} = \sum \text{CREDIT} - \sum \text{DEBIT}$.
5. Rejects any refund request where $\text{amount} > \text{Remaining Refundable}$.
6. If the new cumulative refunds equal the initial credit, the payment transitions to `REFUNDED`. If less, it transitions to `PARTIALLY_REFUNDED`.
