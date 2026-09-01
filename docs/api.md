# API Specification (Phase 1)

## Base URL
```text
http://localhost:5000/api
```

---

## 1. Authentication APIs

### Register User
- **Method**: `POST`
- **Path**: `/api/v1/auth/register`
- **Request Body**:
  ```json
  {
    "fullName": "Jane Doe",
    "email": "jane@example.com",
    "password": "StrongPassword123!",
    "phone": "+919876543210"
  }
  ```
- **Response (201 Created)**:
  ```json
  {
    "success": true,
    "message": "User registered successfully.",
    "data": {
      "user": {
        "id": "usr_ckv123456",
        "fullName": "Jane Doe",
        "email": "jane@example.com",
        "phone": "+919876543210",
        "role": "USER",
        "createdAt": "2026-08-31T12:00:00.000Z"
      },
      "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
    }
  }
  ```

---

### Login User
- **Method**: `POST`
- **Path**: `/api/v1/auth/login`
- **Request Body**:
  ```json
  {
    "email": "jane@example.com",
    "password": "StrongPassword123!"
  }
  ```
- **Response (200 OK)**:
  ```json
  {
    "success": true,
    "message": "Logged in successfully.",
    "data": {
      "user": {
        "id": "usr_ckv123456",
        "fullName": "Jane Doe",
        "email": "jane@example.com",
        "role": "USER"
      },
      "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
    }
  }
  ```

---

### Get Current Profile
- **Method**: `GET`
- **Path**: `/api/v1/auth/me`
- **Headers**:
  ```http
  Authorization: Bearer <JWT>
  ```
- **Response (200 OK)**:
  ```json
  {
    "success": true,
    "message": "User profile retrieved successfully.",
    "data": {
      "user": {
        "id": "usr_ckv123456",
        "fullName": "Jane Doe",
        "email": "jane@example.com",
        "role": "USER"
      }
    }
  }
  ```

---

## 2. Unified Payment APIs

### Create Payment
- **Method**: `POST`
- **Path**: `/api/v1/payments`
- **Headers**:
  ```http
  Authorization: Bearer <JWT>
  Idempotency-Key: <unique-uuid-or-string>
  Content-Type: application/json
  ```
- **Request Body (Stripe Example)**:
  ```json
  {
    "amount": 999.00,
    "currency": "INR",
    "gateway": "STRIPE",
    "description": "Premium Subscription"
  }
  ```
- **Request Body (Cashfree Example)**:
  ```json
  {
    "amount": 999.00,
    "currency": "INR",
    "gateway": "CASHFREE",
    "description": "Order Checkout"
  }
  ```
- **Response (201 Created)**:
  ```json
  {
    "success": true,
    "message": "Payment initialized successfully.",
    "data": {
      "paymentId": "pay_ckv987654",
      "orderId": "ord_ckv456789",
      "orderNumber": "ORD-1756641600-4821",
      "gateway": "STRIPE",
      "status": "PENDING",
      "amount": 999,
      "currency": "INR",
      "clientSecret": "pi_3..._secret_...",
      "gatewayOrderId": null,
      "gatewayPaymentId": "pi_3...",
      "requiresAction": false
    }
  }
  ```

---

### Get Payment by ID
- **Method**: `GET`
- **Path**: `/api/v1/payments/:paymentId`
- **Headers**:
  ```http
  Authorization: Bearer <JWT>
  ```
- **Response (200 OK)**:
  ```json
  {
    "success": true,
    "message": "Payment retrieved successfully.",
    "data": {
      "paymentId": "pay_ckv987654",
      "orderId": "ord_ckv456789",
      "orderNumber": "ORD-1756641600-4821",
      "gateway": "STRIPE",
      "amount": 999,
      "currency": "INR",
      "status": "SUCCESS",
      "createdAt": "2026-08-31T12:00:00.000Z"
    }
  }
  ```

---

### Get Authenticated User Payment History
- **Method**: `GET`
- **Path**: `/api/v1/payments/history?page=1&limit=20`
- **Headers**:
  ```http
  Authorization: Bearer <JWT>
  ```
- **Response (200 OK)**:
  ```json
  {
    "success": true,
    "message": "Payment history retrieved successfully.",
    "data": {
      "payments": [
        {
          "paymentId": "pay_ckv987654",
          "orderNumber": "ORD-1756641600-4821",
          "gateway": "STRIPE",
          "amount": 999,
          "currency": "INR",
          "status": "SUCCESS",
          "createdAt": "2026-08-31T12:00:00.000Z"
        }
      ],
      "pagination": {
        "total": 1,
        "page": 1,
        "limit": 20,
        "totalPages": 1
      }
    }
  }
  ```

---

## 3. Normalized Error Responses

When an error occurs, the API returns a consistent JSON payload:

```json
{
  "success": false,
  "errorCode": "IDEMPOTENCY_KEY_REUSED",
  "message": "Idempotency key has already been used with different request parameters.",
  "errors": []
}
```

### Standard Error Codes

| HTTP Status | Error Code | Description |
|---|---|---|
| 400 | `BAD_REQUEST` | Malformed request or syntax error |
| 400 | `VALIDATION_ERROR` | Schema validation failure (Zod) |
| 400 | `IDEMPOTENCY_KEY_REQUIRED` | Missing `Idempotency-Key` header |
| 400 | `UNSUPPORTED_GATEWAY` | Gateway is not `STRIPE` or `CASHFREE` |
| 400 | `UNSUPPORTED_CURRENCY` | Currency is not `INR` |
| 401 | `AUTHENTICATION_ERROR` | Missing or invalid JWT |
| 401 | `TOKEN_EXPIRED` | JWT token has expired |
| 403 | `AUTHORIZATION_ERROR` | Insufficient permissions or IDOR violation |
| 404 | `RESOURCE_NOT_FOUND` | User, Order, or Payment does not exist |
| 409 | `DUPLICATE_RESOURCE` | Duplicate user email |
| 409 | `IDEMPOTENCY_KEY_REUSED` | Reused key with different request payload |
| 409 | `CONCURRENT_REQUEST_IN_PROGRESS` | Simultaneous request with same key |
| 502 | `PAYMENT_GATEWAY_ERROR` | Upstream gateway provider failure |
| 500 | `DATABASE_TRANSACTION_FAILED` | Internal database failure (triggers compensation) |
| 400 | `INVALID_STATE_TRANSITION` | Illegal payment state transition attempt |
| 400 | `RESOLUTION_REASON_REQUIRED` | Missing required reconciliation justification note |

---

## 4. Admin & Operational APIs (Phase 2)

All `/api/v1/admin/*` endpoints require `Authorization: Bearer <JWT>` with role `ADMIN`.

### System Metrics
- **Method**: `GET`
- **Path**: `/api/v1/admin/metrics`
- **Response (200 OK)**:
  ```json
  {
    "success": true,
    "message": "Operational metrics retrieved successfully.",
    "data": {
      "payments": {
        "total": 1250,
        "successful": 1180,
        "failed": 45,
        "pending": 15,
        "refunded": 10,
        "successRatePercent": 94.40,
        "failureRatePercent": 3.60
      },
      "gatewayDistribution": {
        "stripe": 800,
        "cashfree": 450
      },
      "reliability": {
        "deadLetterWebhooks": 0,
        "openReconciliationMismatches": 2
      }
    }
  }
  ```

### List Payments (Admin)
- **Method**: `GET`
- **Path**: `/api/v1/admin/payments?page=1&limit=20&status=SUCCESS&gateway=STRIPE`

### List Webhook Events & Dead Letter Queue
- **Method**: `GET`
- **Path**: `/api/v1/admin/webhooks?status=DEAD_LETTER`

### Manual Reprocess Webhook Event
- **Method**: `POST`
- **Path**: `/api/v1/admin/webhooks/:eventId/reprocess`
- **Response (200 OK)**:
  ```json
  {
    "success": true,
    "message": "Webhook event reprocessed successfully.",
    "data": {
      "webhook": {
        "id": "evt_rec_123",
        "status": "PROCESSED",
        "attempts": 6
      }
    }
  }
  ```

### Reconciliation Management
- **List Discrepancies**: `GET /api/v1/admin/reconciliation?status=MISMATCH`
- **Resolve Discrepancy**: `POST /api/v1/admin/reconciliation/:id/resolve`
  ```json
  {
    "resolution": "Confirmed gateway settlement via external support portal; internal record marked resolved.",
    "action": "MARK_RESOLVED"
  }
  ```

### Audit Logs
- **Method**: `GET`
- **Path**: `/api/v1/admin/audit-logs?entityType=PAYMENT&page=1&limit=50`

---

## 5. Health Probes

- **Liveness**: `GET /api/health/live` (HTTP 200 `{ "status": "LIVE" }`)
- **Readiness**: `GET /api/health/ready` (HTTP 200/503 `{ "status": "READY", "services": { "database": "UP", "redis": "UP" } }`)

