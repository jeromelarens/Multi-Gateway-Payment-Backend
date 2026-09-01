# Multi-Gateway Payment Architecture

## Overview

The multi-gateway architecture decouples business logic from external payment service providers. The core application logic never directly imports or calls provider-specific SDKs. Instead, all payment gateway operations conform to a common abstract contract: `PaymentGateway`.

---

## Directory Structure

```text
src/integrations/payment/
├── paymentGateway.interface.js       # Abstract contract definition
├── gatewayResolver.js                # Dynamic gateway factory & registry
│
├── stripe/
│   ├── stripe.gateway.js            # Stripe adapter implementation
│   ├── stripe.mapper.js             # DTO mapping and error translation
│   └── stripe.webhook.js            # Signature verification & event parser
│
└── cashfree/
    ├── cashfree.gateway.js          # Cashfree server-side REST implementation
    ├── cashfree.mapper.js           # DTO mapping and error translation
    └── cashfree.webhook.js          # HMAC-SHA256 signature verification
```

---

## The `PaymentGateway` Contract

Every payment gateway adapter must inherit from `PaymentGateway` and implement the following methods:

```javascript
class PaymentGateway {
  get name() {}
  async createCustomer(customerData) {}
  async createPayment(paymentData) {}
  async getPayment(gatewayPaymentId) {}
  async cancelPayment(gatewayPaymentId) {}
  async refundPayment(refundData) {}
  verifyWebhook(payload, headers) {}
}
```

---

## Gateway Resolver

The `gatewayResolver` acts as a dynamic factory and registry.

```javascript
import gatewayResolver from "./integrations/payment/gatewayResolver.js";

// Resolves registered adapter:
const adapter = gatewayResolver.resolve("STRIPE"); // Returns StripeGateway
const adapter2 = gatewayResolver.resolve("CASHFREE"); // Returns CashfreeGateway

// Rejects unknown gateway with 400 UNSUPPORTED_GATEWAY:
gatewayResolver.resolve("UNKNOWN"); // Throws ApiError(400)
```

---

## Supported Payment Gateways

### 1. Stripe Adapter (`stripe.gateway.js`)
- **Protocol**: Stripe Node.js SDK
- **Customer Handling**: Automatically checks user record for `stripeCustomerId`; creates and persists Stripe Customer if not present.
- **Payment Creation**: Uses `stripe.paymentIntents.create` with `automatic_payment_methods: { enabled: true }`.
- **Amount Units**: Minor currency units (paise for INR, cents for USD).
- **Webhook Verification**: Native Stripe signature verification via `stripe.webhooks.constructEvent`.
- **Response Mapping**: Returns unified DTO with `clientSecret`, `gatewayPaymentId: paymentIntent.id`, and normalized status (`PENDING`, `SUCCESS`, `FAILED`).

### 2. Cashfree Adapter (`cashfree.gateway.js`)
- **Protocol**: Cashfree PG REST API (v2023-08-01)
- **Environment**: Dynamically routes between:
  - Sandbox: `https://sandbox.cashfree.com/pg`
  - Production: `https://api.cashfree.com/pg`
- **Authentication**: Custom HTTP headers (`x-client-id`, `x-client-secret`, `x-api-version`).
- **Payment Creation**: Calls `POST /orders` with `order_id`, `order_amount`, `order_currency: INR`, and `customer_details`.
- **Webhook Verification**: Verifies `x-webhook-signature` using HMAC-SHA256 of `${timestamp}${rawBody}` with `CASHFREE_WEBHOOK_SECRET`.
- **Response Mapping**: Returns unified DTO with `clientSecret: payment_session_id`, `gatewayOrderId: cf_order_id`, and normalized status.

---

## How to Add a New Gateway (e.g. Razorpay, PayPal)

To add another payment gateway in the future:

1. **Create Directory**: `src/integrations/payment/<gateway-name>/`
2. **Implement Adapter**: Create `<gateway-name>.gateway.js` extending `PaymentGateway`.
3. **Implement Mapper & Webhook**: Translate provider-specific DTOs, errors, and signature verifications.
4. **Register in Resolver**: In `gatewayResolver.js`:
   ```javascript
   import razorpayGateway from "./razorpay/razorpay.gateway.js";
   this.register("RAZORPAY", razorpayGateway);
   ```
5. **Update Schema Enum**: Add `RAZORPAY` to `PaymentGateway` enum in `schema.prisma`.

*Zero changes to `PaymentService` or `PaymentController` are required!*
