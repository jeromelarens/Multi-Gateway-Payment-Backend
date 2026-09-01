import "./setup.js";
import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";

import authService from "../src/services/auth.service.js";
import userRepository from "../src/repositories/user.repository.js";
import { authenticate } from "../src/middlewares/auth.middleware.js";
import { createMockReqRes } from "./setup.js";
import { registerSchema } from "../src/validators/auth.validation.js";

describe("Authentication Test Suite", () => {
  // In-memory user store for mock testing
  const mockUsers = new Map();

  beforeEach(() => {
    mockUsers.clear();

    // Stub userRepository methods to use mockUsers map
    userRepository.findByEmail = async (email) => {
      return mockUsers.get(email.toLowerCase()) || null;
    };

    userRepository.findById = async (id) => {
      for (const user of mockUsers.values()) {
        if (user.id === id) return user;
      }
      return null;
    };

    userRepository.create = async (data) => {
      const user = {
        id: `usr_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        ...data,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockUsers.set(data.email.toLowerCase(), user);
      return user;
    };
  });

  test("Registration: successfully registers a new user with hashed password and safe claims", async () => {
    const registerPayload = {
      fullName: "Jane Doe",
      email: "jane.doe@example.com",
      password: "StrongPassword123!",
      phone: "+919876543210",
    };

    const result = await authService.register(registerPayload);

    assert.ok(result.user, "User object should be returned");
    assert.equal(result.user.email, "jane.doe@example.com");
    assert.equal(result.user.fullName, "Jane Doe");
    assert.equal(result.user.password, undefined, "Password hash must NEVER be returned in safe user response");
    assert.ok(result.token, "JWT token must be generated");

    // Verify user in store has hashed password
    const storedUser = mockUsers.get("jane.doe@example.com");
    assert.ok(storedUser, "User should be persisted");
    assert.notEqual(storedUser.password, registerPayload.password, "Plaintext password must not be stored");
    const isHashValid = await bcrypt.compare(registerPayload.password, storedUser.password);
    assert.ok(isHashValid, "Password hash must be verifiable via bcrypt");

    // Verify JWT claims
    const decoded = jwt.verify(result.token, process.env.JWT_SECRET);
    assert.equal(decoded.sub, result.user.id);
    assert.equal(decoded.role, "USER");
  });

  test("Registration: rejects duplicate email with 409 DUPLICATE_RESOURCE", async () => {
    await authService.register({
      fullName: "First User",
      email: "duplicate@example.com",
      password: "Password123!",
    });

    await assert.rejects(
      async () => {
        await authService.register({
          fullName: "Second User",
          email: "duplicate@example.com",
          password: "Password123!",
        });
      },
      (err) => {
        assert.equal(err.statusCode, 409);
        assert.equal(err.errorCode, "DUPLICATE_RESOURCE");
        return true;
      }
    );
  });

  test("Registration Validation: rejects weak password", () => {
    const weakPasswords = [
      "short", // too short
      "alllowercase123!", // no uppercase
      "ALLUPPERCASE123!", // no lowercase
      "NoNumbersHere!", // no digit
      "NoSpecialChars123", // no special char
    ];

    for (const pwd of weakPasswords) {
      const parsed = registerSchema.safeParse({
        fullName: "Test User",
        email: "test@example.com",
        password: pwd,
      });
      assert.equal(parsed.success, false, `Password '${pwd}' should fail validation`);
    }
  });

  test("Login: successfully authenticates with valid credentials", async () => {
    await authService.register({
      fullName: "Login Tester",
      email: "login@example.com",
      password: "SecurePassword456@",
    });

    const loginResult = await authService.login({
      email: "login@example.com",
      password: "SecurePassword456@",
    });

    assert.ok(loginResult.token, "Login should return JWT");
    assert.equal(loginResult.user.email, "login@example.com");
    assert.equal(loginResult.user.password, undefined);
  });

  test("Login: rejects invalid credentials (wrong password or non-existent email)", async () => {
    await authService.register({
      fullName: "Existing User",
      email: "existing@example.com",
      password: "ValidPassword123!",
    });

    // Wrong password
    await assert.rejects(
      async () => {
        await authService.login({
          email: "existing@example.com",
          password: "WrongPassword!",
        });
      },
      (err) => {
        assert.equal(err.statusCode, 401);
        assert.equal(err.errorCode, "AUTHENTICATION_ERROR");
        return true;
      }
    );

    // Non-existent email
    await assert.rejects(
      async () => {
        await authService.login({
          email: "nonexistent@example.com",
          password: "AnyPassword123!",
        });
      },
      (err) => {
        assert.equal(err.statusCode, 401);
        assert.equal(err.errorCode, "AUTHENTICATION_ERROR");
        return true;
      }
    );
  });

  test("JWT Middleware: authenticates valid token and attaches user to req.user", async () => {
    const { user, token } = await authService.register({
      fullName: "Auth Middleware User",
      email: "auth.mw@example.com",
      password: "StrongPassword123!",
    });

    const { req, res, next } = createMockReqRes({
      headers: { authorization: `Bearer ${token}` },
    });

    await authenticate(req, res, next);

    assert.ok(!req._error, "Should not produce error");
    assert.ok(req.user, "req.user should be attached");
    assert.equal(req.user.id, user.id);
    assert.equal(req.user.email, user.email);
    assert.equal(req.user.role, "USER");
  });

  test("JWT Middleware: rejects expired and invalid JWTs", async () => {
    // 1. Expired token
    const expiredToken = jwt.sign(
      { sub: "any-user", role: "USER" },
      process.env.JWT_SECRET,
      { expiresIn: "-1s" }
    );

    const expiredContext = createMockReqRes({
      headers: { authorization: `Bearer ${expiredToken}` },
    });

    await authenticate(expiredContext.req, expiredContext.res, expiredContext.next);
    assert.ok(expiredContext.req._error, "Expired token should produce error");
    assert.equal(expiredContext.req._error.statusCode, 401);
    assert.equal(expiredContext.req._error.errorCode, "TOKEN_EXPIRED");

    // 2. Tampered / invalid signature token
    const tamperedToken = expiredToken + "tampered";
    const invalidContext = createMockReqRes({
      headers: { authorization: `Bearer ${tamperedToken}` },
    });

    await authenticate(invalidContext.req, invalidContext.res, invalidContext.next);
    assert.ok(invalidContext.req._error, "Invalid token should produce error");
    assert.equal(invalidContext.req._error.statusCode, 401);
    assert.equal(invalidContext.req._error.errorCode, "INVALID_TOKEN");
  });

  test("Auth me: returns sanitized profile", async () => {
    const { user } = await authService.register({
      fullName: "Profile User",
      email: "profile@example.com",
      password: "StrongPassword123!",
    });

    const profile = await authService.getMe(user.id);
    assert.equal(profile.id, user.id);
    assert.equal(profile.email, "profile@example.com");
    assert.equal(profile.password, undefined);
  });
});
