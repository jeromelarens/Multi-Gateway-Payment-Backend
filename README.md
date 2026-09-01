<div align="center">

# 💳 Multi-Gateway Payment Infrastructure Backend

### Production-oriented payments engine with Stripe + Cashfree, built for correctness under failure

[![Node.js](https://img.shields.io/badge/Node.js-Backend-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org)
[![Express](https://img.shields.io/badge/Express.js-REST%20API-000000?style=for-the-badge&logo=express&logoColor=white)](https://expressjs.com)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Database-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)](https://www.postgresql.org)
[![Prisma](https://img.shields.io/badge/Prisma-ORM-2D3748?style=for-the-badge&logo=prisma&logoColor=white)](https://www.prisma.io)
[![Redis](https://img.shields.io/badge/Redis-Queues-DC382D?style=for-the-badge&logo=redis&logoColor=white)](https://redis.io)
[![BullMQ](https://img.shields.io/badge/BullMQ-Jobs-FF4438?style=for-the-badge)](https://docs.bullmq.io)
[![Stripe](https://img.shields.io/badge/Stripe-Gateway-635BFF?style=for-the-badge&logo=stripe&logoColor=white)](https://stripe.com)
[![Cashfree](https://img.shields.io/badge/Cashfree-Gateway-00B899?style=for-the-badge)](https://www.cashfree.com)

[![Tests](https://img.shields.io/badge/tests-84%20passed-brightgreen?style=flat-square)](#-automated-testing)
[![Suites](https://img.shields.io/badge/test%20suites-15-brightgreen?style=flat-square)](#-automated-testing)
[![Coverage](https://img.shields.io/badge/failures-0-success?style=flat-square)](#-automated-testing)
[![Status](https://img.shields.io/badge/status-Production--Oriented-blueviolet?style=flat-square)](#-current-project-status)
[![License](https://img.shields.io/badge/license-MIT-lightgrey?style=flat-square)](#-license)

</div>

<br>

A production-oriented payment infrastructure backend built with **Node.js, Express.js, PostgreSQL, Prisma, Redis, and BullMQ**, supporting **Stripe and Cashfree** through a gateway-independent payment architecture.

The system is designed around real-world payment engineering concerns such as **idempotency, secure webhook processing, payment state management, refunds, immutable financial ledgering, reconciliation, auditability, asynchronous processing, retry handling, and administrative observability**.

<br>

<div align="center">

### 📚 Table of Contents

| | | |
|---|---|---|
| [🚀 Overview](#-overview) | [✨ Key Features](#-key-features) | [💳 Gateway Architecture](#-multi-gateway-payment-architecture) |
| [🏗️ Backend Architecture](#️-backend-architecture) | [🔄 Payment Lifecycle](#-payment-lifecycle) | [🔁 Idempotency](#-request-idempotency) |
| [🔐 Webhook Security](#-webhook-security) | [☠️ Dead Letter Queue](#️-dead-letter-queue) | [🔄 State Machine](#-payment-state-machine) |
| [💸 Refunds](#-refund-management) | [📒 Ledger](#-immutable-transaction-ledger) | [🔍 Reconciliation](#-payment-reconciliation) |
| [📝 Audit Trail](#-audit-trail) | [⚙️ Async Processing](#️-asynchronous-processing) | [🔐 Security](#-security) |
| [🗄️ Database Design](#️-database-design) | [🧪 Testing](#-automated-testing) | [🚀 Installation](#-installation) |
| [📡 API Flow](#-example-api-flow) | [📌 Project Status](#-current-project-status) | [⭐ Summary](#-summary) |

</div>

---

## 🚀 Overview

Payment systems cannot be treated as simple CRUD applications.

Real-world payment processing must handle:

* duplicate requests
* duplicate webhooks
* asynchronous provider events
* failed background jobs
* partial refunds
* inconsistent payment states
* gateway/database mismatches
* financial traceability
* authorization and IDOR protection
* audit requirements
* transient failures
* retry and recovery workflows

This project implements these concerns as a unified backend payment infrastructure.

The architecture separates the core payment domain from gateway-specific implementations, allowing **Stripe and Cashfree** to operate behind a common payment abstraction.

---

## ✨ Key Features

### 🔐 Authentication & Authorization

* JWT-based authentication
* User registration and login
* Secure password hashing with bcrypt
* JWT expiration handling
* Role-based authorization
* Admin-only operations
* Resource ownership validation
* IDOR protection
* Authenticated identity derived from JWT
* Protection against client-supplied user identity manipulation

Users can only access their own:

* payments
* orders
* refunds
* invoices
* payment history

Administrative operations require the `ADMIN` role.

---

## 💳 Multi-Gateway Payment Architecture

The system supports:

* **Stripe**
* **Cashfree**

Both providers are implemented behind a common gateway abstraction.

### Architecture

```text
                    Payment Service
                          │
                          ▼
                   Gateway Resolver
                    │             │
                    ▼             ▼
                 Stripe        Cashfree
                 Adapter        Adapter
                    │             │
                    ▼             ▼
               Stripe API     Cashfree API
```

The core payment service does not depend directly on provider-specific SDK implementation details.

This makes the architecture extensible for additional payment providers in the future.

---

## 🏗️ Backend Architecture

```text
Client
  │
  ▼
Express API
  │
  ├── Authentication
  ├── Authorization
  ├── Validation
  │
  ▼
Controllers
  │
  ▼
Services
  │
  ├───────────────┐
  ▼               ▼
Repositories    Gateway Resolver
  │               │
  ▼          ┌────┴────┐
PostgreSQL   ▼         ▼
           Stripe    Cashfree
           Adapter   Adapter
```

Asynchronous processing:

```text
Webhook / Payment Event
          │
          ▼
      PostgreSQL
          │
          ▼
      BullMQ Queue
          │
          ▼
       Worker
          │
    ┌─────┼─────┐
    ▼     ▼     ▼
 Payment Ledger Notification
```

---

## 🧰 Technology Stack

| Technology          | Purpose                     |
| ------------------- | ---------------------------- |
| Node.js             | Backend runtime             |
| Express.js          | REST API framework          |
| PostgreSQL          | Primary relational database |
| Prisma              | ORM and database access     |
| Redis               | Queue infrastructure        |
| BullMQ              | Background job processing   |
| JWT                 | Authentication              |
| bcrypt              | Password hashing            |
| Stripe              | Payment gateway             |
| Cashfree            | Payment gateway             |
| Winston             | Structured logging          |
| Zod                 | Request validation          |
| PDF generation      | Invoice generation          |
| Node.js Test Runner | Automated testing           |

---

## 📁 Project Structure

```text
payment-integration/
│
├── src/
│   ├── config/
│   │   ├── env.js
│   │   ├── logger.js
│   │   └── redis.js
│   │
│   ├── controllers/
│   │   ├── admin.controller.js
│   │   ├── auth.controller.js
│   │   ├── payment.controller.js
│   │   ├── refund.controller.js
│   │   └── invoice.controller.js
│   │
│   ├── integrations/
│   │   ├── payment/
│   │   │   ├── paymentGateway.interface.js
│   │   │   ├── gatewayResolver.js
│   │   │   ├── stripe/
│   │   │   └── cashfree/
│   │   │
│   │   ├── email/
│   │   └── pdf/
│   │
│   ├── middlewares/
│   │   ├── authenticate.js
│   │   ├── authorization.js
│   │   └── validation.js
│   │
│   ├── queues/
│   │   ├── queue.config.js
│   │   ├── payment.queue.js
│   │   ├── webhook.queue.js
│   │   ├── notification.queue.js
│   │   ├── invoice.queue.js
│   │   └── reconciliation.queue.js
│   │
│   ├── workers/
│   │   ├── index.js
│   │   ├── payment.worker.js
│   │   ├── webhook.worker.js
│   │   ├── notification.worker.js
│   │   ├── invoice.worker.js
│   │   └── reconciliation.worker.js
│   │
│   ├── repositories/
│   │   ├── payment.repository.js
│   │   ├── refund.repository.js
│   │   ├── webhook.repository.js
│   │   ├── ledger.repository.js
│   │   ├── reconciliation.repository.js
│   │   └── audit.repository.js
│   │
│   ├── services/
│   │   ├── payment.service.js
│   │   ├── refund.service.js
│   │   ├── webhook.service.js
│   │   ├── paymentStateMachine.js
│   │   ├── ledger.service.js
│   │   ├── reconciliation.service.js
│   │   ├── audit.service.js
│   │   └── invoice.service.js
│   │
│   ├── routes/
│   └── app.js
│
├── prisma/
│   ├── schema.prisma
│   └── migrations/
│
├── tests/
│
├── docs/
│   ├── architecture.md
│   ├── async-processing.md
│   ├── webhook-reliability.md
│   ├── transaction-ledger.md
│   ├── reconciliation.md
│   ├── audit-logging.md
│   └── queue-architecture.md
│
├── .env.example
├── .gitignore
├── package.json
└── README.md
```

---

## 🔄 Payment Lifecycle

The payment lifecycle is designed around asynchronous provider confirmation.

```text
Create Payment
      │
      ▼
Validate Request
      │
      ▼
Calculate / Validate Amount
      │
      ▼
Resolve Gateway
      │
      ├───────────────┐
      ▼               ▼
   Stripe          Cashfree
      │               │
      └───────┬───────┘
              ▼
        Persist Payment
              │
              ▼
       Client completes payment
              │
              ▼
        Gateway Webhook
              │
              ▼
       Verify Signature
              │
              ▼
      Persist Webhook Event
              │
              ▼
          BullMQ
              │
              ▼
       Webhook Worker
              │
              ▼
      State Machine
              │
              ▼
        Ledger Entry
              │
        ┌─────┴─────┐
        ▼           ▼
     Invoice     Notification
       Job           Job
```

---

## 🔁 Request Idempotency

Payment creation supports request-level idempotency.

Clients provide:

```http
Idempotency-Key: <unique-key>
```

The system stores the request identity and result so repeated requests can safely replay the same logical result.

### Same request

```text
Request 1
Idempotency-Key: abc123
       ↓
Payment created

Request 2
Idempotency-Key: abc123
       ↓
Same logical result
       ↓
No duplicate payment
```

### Same key with different request

```text
Request 1
Key: abc123
Amount: ₹500

Request 2
Key: abc123
Amount: ₹1000

       ↓

409 Idempotency Conflict
```

### Concurrency

The implementation also protects against concurrent duplicate requests using database constraints and transactional/concurrency-safe logic.

Automated stress tests cover concurrent payment creation.

---

## 🔐 Webhook Security

Webhook requests are treated as untrusted external input.

**Stripe** — signatures are verified using the raw request body and the configured webhook secret.

**Cashfree** — signatures are verified using HMAC-SHA256 and timing-safe comparison.

```text
Gateway
   │
   ▼
Raw Webhook
   │
   ▼
Signature Verification
   │
   ├── Invalid → Reject
   │
   ▼
Valid Event
```

A database uniqueness constraint on `gateway + eventId` prevents duplicate webhook processing.

---

## ⚡ Webhook Reliability

Webhook processing follows an asynchronous pipeline.

```text
Webhook Received
      │
      ▼
Signature Verification
      │
      ▼
Persist Event
      │
      ▼
Queue Job
      │
      ▼
Fast HTTP ACK
      │
      ▼
Background Worker
      │
      ▼
Process Event
```

The webhook endpoint does not perform expensive downstream work synchronously.

---

## 🔁 Webhook Retry

Transient processing failures are retried using exponential backoff.

Configured retry intervals include:

```text
5 seconds
30 seconds
2 minutes
10 minutes
30 minutes
```

The maximum attempt count is configurable. Permanent or exhausted failures are moved into a Dead Letter state.

---

## ☠️ Dead Letter Queue

Failed webhook events are preserved rather than silently discarded.

```text
Webhook → Processing → Failure → Retry → Retry → Maximum Attempts → DEAD_LETTER
```

Dead-letter records retain failure information and can be manually reprocessed by authorized administrators.

---

## 🛠️ Manual Webhook Reprocessing

```http
POST /api/v1/admin/webhooks/:eventId/reprocess
```

Requirements:

* authenticated user
* `ADMIN` role
* existing webhook event
* safe/idempotent processing
* audit logging

This provides an operational recovery path for quarantined events.

---

## 🔄 Payment State Machine

Payment state transitions are centralized.

```text
             ┌───────────┐
             │  PENDING  │
             └─────┬─────┘
                   │
            ┌──────┴──────┐
            ▼             ▼
        SUCCESS         FAILED
            │
      ┌─────┴─────────────┐
      ▼                   ▼
PARTIALLY_REFUNDED     REFUNDED
      │
      ▼
  REFUNDED
```

Invalid transitions are rejected instead of allowing arbitrary status manipulation, e.g.:

```text
FAILED → REFUNDED
REFUNDED → SUCCESS
REFUNDED → PENDING
```

---

## 💸 Refund Management

The backend supports:

* full refunds
* partial refunds
* multiple partial refunds
* remaining refundable balance calculation
* refund validation
* refund state transitions
* gateway refund integration
* refund ledger entries
* duplicate protection

### Example

```text
Original Payment: ₹1000

Refund #1: ₹300
Remaining: ₹700

Refund #2: ₹700
Remaining: ₹0

Final Payment State: REFUNDED
```

The system prevents refunds from exceeding the remaining refundable amount.

---

## 📒 Immutable Transaction Ledger

The project maintains an append-only financial transaction ledger.

The ledger records financial events such as:

```text
PAYMENT
REFUND
PARTIAL_REFUND
ADJUSTMENT
```

Example:

```text
Payment  ₹1000  CREDIT
Refund   ₹300   DEBIT
```

Net settled balance: `₹1000 - ₹300 = ₹700`

### Ledger Immutability

Historical ledger entries are append-only — there are no normal update/delete operations for ledger records. Corrections are represented as new journal entries rather than modifying historical financial data.

Each ledger entry contains a deterministic idempotency reference to prevent duplicate financial records, e.g.:

```text
STRIPE:event_123:PAYMENT
```

This ensures repeated webhook processing does not create duplicate ledger entries.

---

## 🧮 Financial Data Safety

Monetary values use `Decimal(12,2)` rather than unsafe floating-point representation. This applies to:

* Order amount
* Payment amount
* Refund amount
* Ledger amount
* Reconciliation internal amount
* Reconciliation gateway amount

---

## 🔍 Payment Reconciliation

The reconciliation engine compares internal payment records against gateway information.

```text
Internal Database
       │
       ↕
Gateway
       │
       ▼
Reconciliation Engine
       │
       ├── MATCH
       │
       └── MISMATCH
```

It can identify discrepancies such as:

* `STATUS_MISMATCH`
* `AMOUNT_MISMATCH`
* `CURRENCY_MISMATCH`
* `MISSING_INTERNAL_PAYMENT`
* `MISSING_GATEWAY_PAYMENT`

### Reconciliation Records

A reconciliation record can contain:

* internal payment status
* gateway payment status
* internal amount
* gateway amount
* gateway
* payment reference
* difference type
* reconciliation status
* resolution information

Financial states are not blindly changed based on uncertain reconciliation results.

### Admin Reconciliation

```http
GET  /api/v1/admin/reconciliation
GET  /api/v1/admin/reconciliation/:id
POST /api/v1/admin/reconciliation/:id/resolve
```

Resolution requires authentication, `ADMIN` role, justification, and audit logging — creating an explicit operational trail for manual resolution.

---

## 📝 Audit Trail

The system maintains an append-only audit trail for important operational actions, including:

```text
PAYMENT_CREATED
PAYMENT_CONFIRMED
PAYMENT_FAILED
REFUND_CREATED
REFUND_COMPLETED
WEBHOOK_REPROCESSED
RECONCILIATION_RESOLVED
ADMIN_ACTION
```

Audit records contain contextual information such as actor, action, entity, entity ID, request ID, metadata, and timestamp. Sensitive credentials are sanitized.

---

## ⚙️ Asynchronous Processing

Expensive or retryable operations are moved into background workers.

**Queues:** Webhook, Payment, Notification, Invoice, Reconciliation

**Workers:** Webhook, Payment, Notification, Invoice, Reconciliation

### Background Notifications

```text
Payment Success → Notification Queue → Notification Worker → Email Provider
```

A notification failure does not invalidate an otherwise successful payment. Notification jobs can be retried independently.

### Background Invoice Generation

```text
Payment Success → Invoice Queue → Invoice Worker → Generate PDF → Invoice Persistence → Notification Queue
```

This prevents expensive PDF generation from blocking the core payment processing path.

---

## 📊 Admin & Operational APIs

```http
GET /api/v1/admin/payments
GET /api/v1/admin/payments/:id

GET /api/v1/admin/webhooks
POST /api/v1/admin/webhooks/:eventId/reprocess

GET /api/v1/admin/reconciliation
GET /api/v1/admin/reconciliation/:id
POST /api/v1/admin/reconciliation/:id/resolve

GET /api/v1/admin/audit-logs
GET /api/v1/admin/queue-failures
```

All administrative endpoints require authentication and the `ADMIN` role.

---

## ❤️ Health Checks

```http
GET /api/health/live
GET /api/health/ready
```

**Liveness** checks application process health. **Readiness** checks critical dependencies including PostgreSQL and Redis. Unhealthy dependency states return an appropriate non-success response without exposing credentials or connection details.

---

## 🛑 Graceful Shutdown

The backend handles `SIGINT` and `SIGTERM`.

```text
Stop accepting new HTTP work → Close workers → Close Redis → Disconnect Prisma → Exit
```

A timeout safeguard is used to prevent indefinite shutdown.

---

## 🔐 Security

* JWT authentication
* bcrypt password hashing
* role-based authorization
* IDOR prevention
* ownership validation
* request validation
* Helmet
* CORS controls
* rate limiting
* webhook signature verification
* database uniqueness constraints
* idempotency
* sensitive logging protection
* admin endpoint protection
* secure environment configuration

### IDOR Protection

Resource ownership is enforced using authenticated identity.

```text
User A → Own Payment → 200
User A → User B's Payment → 403
```

This protection is implemented across payments, orders, refunds, and invoices. Administrative users can access broader operational resources through explicit authorization.

---

## 🗄️ Database Design

```text
User
 │
 └── Order
      │
      ├── Payment
      │     │
      │     └── Refund
      │
      └── Invoice

WebhookEvent
IdempotencyKey
TransactionLedger
ReconciliationRecord
AuditLog
```

Important database constraints:

```text
IdempotencyKey    → unique(userId, key)
WebhookEvent      → unique(gateway, eventId)
TransactionLedger → unique(idempotencyRef)
```

Financial fields use `Decimal(12,2)` for safe monetary representation.

---

## 🧪 Automated Testing

```text
84 Tests
84 Passed
0 Failed
0 Skipped
15 Test Suites
```

### Test Coverage

| Test Suite                          |  Tests |
| ------------------------------------ | -----: |
| Authentication                      |      8 |
| Authorization & IDOR                |      8 |
| Cashfree Gateway Adapter            |      7 |
| High-Concurrency & Stress           |      4 |
| Request-Level Idempotency           |      6 |
| Immutable Transaction Ledger        |      5 |
| Unified Payment Service             |      7 |
| Queue & Worker Architecture         |      3 |
| Payment Reconciliation              |      5 |
| Payment State Machine               |     10 |
| Stripe Gateway Adapter              |      5 |
| Webhook Reliability & DLQ           |      4 |
| Refund Lifecycle & Accounting       |      7 |
| Gateway-Independent Webhook Service |      4 |
| Admin Observability & Audit         |      2 |
| **Total**                           | **84** |

### Concurrency Testing

```text
100 concurrent identical webhook requests   → 1 event record
100 concurrent ledger creation attempts     → 1 ledger entry
100 concurrent refund debit attempts        → 1 financial debit
```

These tests verify database-level protection against duplicate financial side effects.

### Testing Strategy

Stripe and Cashfree provider interactions are tested through mocked/isolation-based scenarios covering request construction, response mapping, validation, signature verification, error normalization, and provider behaviour — so the suite runs without exposing or storing real payment credentials.

### ⚠️ External Provider Testing Limitation

Real Stripe and Cashfree sandbox end-to-end testing is intentionally not included because provider credentials are not bundled with this repository:

```text
Stripe E2E     → Not executed
Cashfree E2E   → Not executed
```

This does **not** mean the provider adapters are placeholders — the adapters and their behaviour are covered by automated tests. Real provider sandbox testing can be performed separately when valid sandbox credentials are available.

---

## 🐳 Docker

Docker is intentionally outside the scope of this project. The application does not require Docker as part of its documented development workflow.

---

## ⚙️ Environment Configuration

Create a local `.env` file based on `.env.example`:

```env
NODE_ENV=
PORT=

DATABASE_URL=

JWT_SECRET=
JWT_EXPIRES_IN=

STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=

CASHFREE_APP_ID=
CASHFREE_SECRET_KEY=
CASHFREE_ENVIRONMENT=
CASHFREE_WEBHOOK_SECRET=

REDIS_URL=

SMTP_HOST=
SMTP_PORT=
SMTP_USER=
SMTP_PASSWORD=
SMTP_FROM=
```

Never commit the real `.env` file. Only `.env.example` should be committed.

---

## 🚀 Installation

**1. Clone the repository**

```bash
git clone <your-repository-url>
cd payment-integration
```

**2. Install dependencies**

```bash
npm install
```

**3. Configure environment variables**

```bash
cp .env.example .env
```

Update the required local configuration.

**4. Validate Prisma**

```bash
npx prisma validate
```

**5. Generate Prisma Client**

```bash
npx prisma generate
```

**6. Run the application**

```bash
npm run dev
```

---

## 🧪 Running Tests

```bash
npm test
```

Expected current verification:

```text
84 tests
84 passed
0 failed
0 skipped
```

---

## 🗃️ Database Migrations

The project uses Prisma migrations. For an existing migration-based environment:

```bash
npx prisma migrate deploy
```

Do not use destructive database commands against production data.

---

## 📡 Example API Flow

**Register**
```http
POST /api/v1/auth/register
```

**Login**
```http
POST /api/v1/auth/login
```

**Create Payment**
```http
POST /api/v1/payments
Authorization: Bearer <JWT>
Idempotency-Key: <unique-key>
```

Stripe example:
```json
{
  "amount": 999,
  "currency": "INR",
  "gateway": "STRIPE",
  "description": "Order payment"
}
```

Cashfree example:
```json
{
  "amount": 999,
  "currency": "INR",
  "gateway": "CASHFREE",
  "description": "Order payment"
}
```

**Get Payment**
```http
GET /api/v1/payments/:paymentId
Authorization: Bearer <JWT>
```

**Payment History**
```http
GET /api/v1/payments/history
Authorization: Bearer <JWT>
```

**Refund**
```http
POST /api/v1/refunds
Authorization: Bearer <JWT>
```

**Stripe Webhook**
```http
POST /api/v1/webhooks/stripe
```

**Cashfree Webhook**
```http
POST /api/v1/webhooks/cashfree
```

---

## 📚 Documentation

Additional architecture documentation is available under `docs/`:

* `architecture.md`
* `async-processing.md`
* `webhook-reliability.md`
* `transaction-ledger.md`
* `reconciliation.md`
* `audit-logging.md`
* `queue-architecture.md`

---

## 🧠 Engineering Principles

```text
Correctness · Security · Idempotency · Consistency · Durability
Traceability · Recoverability · Observability · Maintainability · Extensibility
```

The implementation intentionally avoids unnecessary distributed-system complexity. The goal is not to maximize the number of technologies used — it's to correctly handle real-world payment failure scenarios.

---

## 🚨 Failure Scenarios Considered

**Duplicate payment request** → Idempotency → No duplicate payment

**Duplicate webhook** → Unique constraint → No duplicate financial effect

**Worker failure** → Retry → Successful processing

**Repeated worker execution** → Idempotent processing → No duplicate financial effect

**Partial refund**
```text
₹1000 → ₹300 refund → ₹700 remaining → ₹700 refund → ₹0 remaining
```

**Gateway/database mismatch**
```text
Internal DB ↕ Gateway → Reconciliation → Mismatch Record → Admin Review
```

---

## 📈 What Makes This Project Different

This goes beyond a basic `Create Order → Pay → Save Status` implementation. It focuses on the difficult parts of payment infrastructure:

* idempotent financial operations
* asynchronous provider events
* webhook reliability
* retry recovery
* dead-letter handling
* explicit state transitions
* immutable financial records
* reconciliation
* operational audit trails
* concurrency safety
* resource ownership
* gateway abstraction
* background processing

---

## 🔮 Future Improvements

* production deployment infrastructure
* real provider sandbox E2E validation
* advanced observability
* CI/CD automation
* centralized metrics dashboards
* additional payment providers
* advanced reporting

These are intentionally outside the current Phase 1 + Phase 2 implementation scope.

---

## 📌 Current Project Status

<div align="center">

| Module | Status | | Module | Status |
|---|:---:|---|---|:---:|
| Authentication | ✅ | | Payment State Machine | ✅ |
| Authorization / RBAC | ✅ | | Refunds | ✅ |
| IDOR Protection | ✅ | | Partial Refunds | ✅ |
| Stripe Integration | ✅ | | Immutable Ledger | ✅ |
| Cashfree Integration | ✅ | | Reconciliation | ✅ |
| Gateway Abstraction | ✅ | | Audit Logging | ✅ |
| Payment Lifecycle | ✅ | | Async Processing | ✅ |
| Request Idempotency | ✅ | | BullMQ Queues | ✅ |
| Concurrency Protection | ✅ | | Background Workers | ✅ |
| Secure Webhooks | ✅ | | Admin APIs | ✅ |
| Webhook Retry | ✅ | | Health Checks | ✅ |
| Dead Letter Handling | ✅ | | Graceful Shutdown | ✅ |
| Invoice Processing | ✅ | | Async Notifications | ✅ |
| Automated Tests | ✅ | | Documentation | ✅ |

</div>

---

## ⚠️ Known Environment Limitations

**Stripe / Cashfree** — real provider sandbox credentials are not included:

```text
Real Stripe E2E     → Not executed
Real Cashfree E2E   → Not executed
```

**Redis** — the automated test environment uses isolated/in-memory queue infrastructure. Live BullMQ runtime testing requires a compatible Redis version.

These are environment/testing limitations, not missing payment-domain functionality.

---

## 🔒 Security & Secrets

Never commit:

```text
.env
Stripe secret keys
Cashfree secret keys
JWT secrets
Database credentials
SMTP passwords
Webhook secrets
```

The repository is configured to ignore local environment files and sensitive development artifacts.

---

## 👨‍💻 Project Focus

This project demonstrates practical backend engineering concepts including REST API development, authentication, authorization, database design, Prisma ORM, PostgreSQL, payment gateway integration, distributed event handling, idempotency, concurrency control, asynchronous processing, queue architecture, retry strategies, financial data integrity, reconciliation, auditability, and production-oriented security.

---

## 📄 License

Add your preferred license here.

```text
MIT License
```

---

## ⭐ Summary

<div align="center">

A **production-oriented multi-gateway payment backend** designed with real-world reliability and financial integrity in mind.

`Stripe` `Cashfree` `JWT Auth` `RBAC` `Idempotency` `Secure Webhooks` `Redis` `BullMQ`
`Retry / DLQ` `State Machine` `Immutable Ledger` `Refunds` `Reconciliation` `Audit Logging` `PostgreSQL` `Prisma`

**Verified with 84 automated tests across 15 test suites — zero failures.**

<br>

### Built as a backend engineering project focused on correctness, reliability, security, and financial consistency.

<br>

⭐ If this project helped you understand payment system design, consider starring the repo!

</div>

---

<div align="center">
<sub>Made with care for real-world payment infrastructure engineering.</sub>
</div>
