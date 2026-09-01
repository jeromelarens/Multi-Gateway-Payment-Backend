# Authentication & Authorization (Phase 1)

## Overview

The authentication system uses JSON Web Tokens (JWT) and bcrypt password hashing. It provides role-based access control (RBAC) and explicit resource ownership verification to prevent Insecure Direct Object References (IDOR).

---

## Registration

- **Endpoint**: `POST /api/v1/auth/register`
- **Password Strength**: Minimum 8 characters, at least 1 uppercase letter, 1 lowercase letter, 1 number, and 1 special character (`@$!%*?&`).
- **Hashing**: Passwords are encrypted using `bcryptjs` with 12 salt rounds.
- **Normalization**: Email addresses are trimmed and lowercased before unique constraint checking.
- **Safety**: Password hashes are stripped before returning the user profile.

---

## Login

- **Endpoint**: `POST /api/v1/auth/login`
- **Timing Attack Mitigation**: Performs dummy hash comparisons when a requested email does not exist, ensuring uniform response latency.
- **JWT Claims**:
  ```json
  {
    "sub": "usr_ckv123456789",
    "role": "USER",
    "iat": 1756641600,
    "exp": 1757246400
  }
  ```
- **Configuration**:
  - `JWT_SECRET`: 256-bit cryptographically secure string.
  - `JWT_EXPIRES_IN`: Defaults to `7d`.

---

## Authorization & IDOR Protection

### Middlewares

1. **`authenticate`**:
   - Parses the `Authorization: Bearer <token>` header.
   - Verifies signature and expiration.
   - Loads the active user from the database.
   - Attaches `req.user = { id, email, role, fullName }`.

2. **`requireRole(...roles)`**:
   - Ensures `roles.includes(req.user.role)`.
   - Used to protect administrative endpoints.

3. **`requireOwnership(getOwnerIdFn)`**:
   - Ensures `getOwnerIdFn(req) === req.user.id` or `req.user.role === 'ADMIN'`.
   - Eliminates IDOR attacks where a user passes another user's `orderId` or `userId`.

---

## Protected APIs

| Route | Method | Access Level | Description |
|---|---|---|---|
| `/api/v1/auth/me` | `GET` | Authenticated | Current user profile |
| `/api/v1/payments` | `POST` | Authenticated | Create payment for authenticated user |
| `/api/v1/payments/history` | `GET` | Authenticated | View own payment history |
| `/api/v1/payments/:id` | `GET` | Authenticated (Owner / Admin) | View payment details |
