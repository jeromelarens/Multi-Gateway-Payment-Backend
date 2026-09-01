# Unified Payment Flow & Lifecycle (Phase 1)

## Overview

This document details the lifecycle of a payment transaction from client initiation to gateway processing, database persistence, and distributed failure handling.

---

## Payment Creation Sequence Diagram

```mermaid
sequenceDiagram
    autonumber
    actor Client
    participant MW as Auth & Idempotency Middlewares
    participant Ctrl as PaymentController
    participant Svc as PaymentService
    participant Resolver as GatewayResolver
    participant Adapter as Gateway Adapter (Stripe/Cashfree)
    participant Provider as External Gateway API
    participant DB as PostgreSQL (Prisma)

    Client->>MW: POST /api/v1/payments (JWT + Idempotency-Key + Body)
    Note over MW: Validate JWT & verify user<br/>Compute SHA-256 fingerprint<br/>Atomic reservation in IdempotencyKey table

    alt Idempotency Hit (Completed)
        MW-->>Client: Return cached 201 response (Idempotent-Replay: true)
    else Concurrent In-Progress
        MW-->>Client: 409 CONCURRENT_REQUEST_IN_PROGRESS
    else New Request
        MW->>Ctrl: Forward to controller
        Ctrl->>Svc: createPayment({ userId: req.user.id, amount, gateway, ... })
        
        Note over Svc: Validate amount > 0, precision <= 2 decimals<br/>Validate currency == INR<br/>Generate internal orderNumber

        Svc->>Resolver: resolve(gateway)
        Resolver-->>Svc: GatewayAdapter instance

        Svc->>Adapter: createPayment(paymentData)
        Adapter->>Provider: Call provider API (PaymentIntent / Order)
        Provider-->>Adapter: Gateway transaction result
        Adapter-->>Svc: Unified Gateway Response

        Svc->>DB: prisma.$transaction(create Order & Payment)
        
        alt DB Transaction Succeeds
            DB-->>Svc: Persisted Order & Payment
            Svc-->>Ctrl: Unified Payment Result
            Ctrl-->>MW: 201 Created Response
            MW->>DB: Update IdempotencyKey to COMPLETED
            MW-->>Client: 201 Created (JSON Response)
        else DB Transaction Fails
            DB--xSvc: DB Error
            Note over Svc: Distributed Failure Compensation
            Svc->>Adapter: cancelPayment(gatewayId)
            Adapter->>Provider: Cancel / void payment
            MW->>DB: Update IdempotencyKey to FAILED
            Svc-->>Client: 500 DATABASE_TRANSACTION_FAILED
        end
    end
```

---

## Server-Side Validation Rules

1. **Amount Precision & Bounds**:
   - Must be a strictly positive number (`amount > 0`).
   - Must not contain more than 2 decimal places (representing rupees and paise).
   - Financial conversions use exact minor currency units (paise) to eliminate IEEE 754 floating-point inaccuracies.
2. **Currency Rules**:
   - Phase 1 strictly enforces `currency === 'INR'`.
3. **Identity Derivation**:
   - The user ID is **never** accepted from the client request body. It is derived strictly from the verified JWT: `req.user.id`.

---

## Distributed Failure Compensation

Because external payment gateways (Stripe/Cashfree) and the PostgreSQL database reside in separate fault domains, two-phase commits are impossible. 

The payment service handles this with **compensating transactions**:
1. When a gateway call succeeds (e.g. creating a PaymentIntent on Stripe or an Order on Cashfree), an external liability is created.
2. If the subsequent database transaction fails to commit the `Order` and `Payment` records, a `catch` block intercepts the failure:
   - Invokes `gatewayAdapter.cancelPayment(gatewayId)` to void or terminate the external transaction.
   - Logs an audit event: `ORPHAN_GATEWAY_PAYMENT_CANCELLED`.
   - Idempotency status is marked `FAILED` to allow client retries.
