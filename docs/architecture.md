# Multi-Gateway Payment & Financial Infrastructure Architecture

## Overview

The Payment Integration Backend is built on a layered, modular, provider-agnostic financial architecture using **Node.js**, **Express**, **PostgreSQL**, **Prisma ORM**, **Redis**, and **BullMQ**.

Business logic remains strictly decoupled from external payment provider SDKs, while asynchronous queues, state machine guards, immutable ledger journals, and automated reconciliation guarantee operational durability and data integrity.

---

## Architectural Diagram

```mermaid
flowchart TD
    Client([Client Application]) -->|HTTPS + JWT + Idempotency-Key| API[Express API Gateway]

    subgraph Security & Ingestion Layer
        API --> AuthMW[Authentication & RBAC Middleware]
        AuthMW --> IdemMW[Idempotency Fingerprinting Middleware]
        IdemMW --> ValMW[Zod Validation Middleware]
    end

    subgraph Core Payment Processing
        ValMW --> Ctrl[Payment Controller]
        Ctrl --> Svc[Unified Payment Service]
        Svc --> Resolver[Gateway Resolver]

        Resolver --> Interface{PaymentGateway Interface}
        Interface -->|STRIPE| StripeAdapter[Stripe Gateway Adapter]
        Interface -->|CASHFREE| CashfreeAdapter[Cashfree Gateway Adapter]

        StripeAdapter --> StripeAPI[(Stripe Cloud API)]
        CashfreeAdapter --> CashfreeAPI[(Cashfree Cloud API)]
    end

    subgraph Asynchronous Queue & Worker Pipeline
        WebhookEndpoint[Webhook Ingestion] -->|Fast ACK < 50ms| WebhookEventStore[(PostgreSQL WebhookEvent)]
        WebhookEndpoint -->|Job Enqueue| Redis[(Redis / BullMQ)]

        Redis --> WebhookWorker[Webhook Worker]
        WebhookWorker --> StateMachine[Payment State Machine]
        WebhookWorker --> LedgerSvc[Transaction Ledger Service]

        Redis --> NotifWorker[Notification Worker]
        Redis --> InvoiceWorker[Invoice Worker]
        Redis --> ReconWorker[Reconciliation Worker]
    end

    subgraph Reliability & Auditing
        ReconWorker --> ReconEngine[Reconciliation Engine]
        ReconEngine --> DiscrepancyStore[(ReconciliationRecord Store)]
        AdminAPI[Admin Controller] --> AuditSvc[Audit Service]
        AuditSvc --> AuditStore[(Immutable AuditLog)]
    end

    subgraph Persistence Layer
        Svc --> Prisma[(Prisma ORM & PostgreSQL)]
        LedgerSvc --> Prisma
        IdemMW --> Prisma
    end
```

---

## Architecture Layers

### 1. Ingestion & Security Layer
* **JWT Authentication**: Validates Bearer tokens, establishes caller identity on `req.user`.
* **IDOR Protection & RBAC**: Asserts ownership of resources or requires `ADMIN` privileges before handler invocation.
* **Idempotency Guard**: Hashes canonical request parameters (`userId`, `endpoint`, request body) and locks concurrent identical requests via PostgreSQL unique index.

### 2. Provider Abstraction Layer
* **PaymentGateway Contract**: Abstract class specifying `createPayment`, `getPayment`, `cancelPayment`, `verifyWebhook`, and `mapStatus`.
* **Gateway Resolver**: Dynamic registry returning the appropriate gateway adapter at runtime based on caller parameters or payment record metadata.

### 3. Asynchronous Worker Layer (BullMQ)
* **Job Enqueueing**: Network-bound side effects (customer emails, PDF invoicing, webhook replay) run in dedicated worker processes.
* **Dead Letter Recovery**: Exhausted webhook retries are quarantined for administrative inspection and can be reprocessed manually.

### 4. Financial Consistency Layer
* **Payment State Machine**: Rejects non-linear or illegal payment status transitions.
* **Append-Only Ledger**: Records debit and credit movements, enforcing double-entry traceability and preventing historical tampering.
* **Reconciliation Engine**: Identifies out-of-sync payment states between internal database records and gateway providers.
