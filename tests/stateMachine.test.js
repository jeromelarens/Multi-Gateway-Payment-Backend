import { describe, it } from "node:test";
import assert from "node:assert/strict";
import paymentStateMachine from "../src/services/paymentStateMachine.js";
import ApiError from "../src/utils/ApiError.js";

describe("Payment State Machine Test Suite", () => {
  it("Allowed: PENDING -> SUCCESS", () => {
    assert.equal(paymentStateMachine.canTransition("PENDING", "SUCCESS"), true);
  });

  it("Allowed: PENDING -> FAILED", () => {
    assert.equal(paymentStateMachine.canTransition("PENDING", "FAILED"), true);
  });

  it("Allowed: SUCCESS -> PARTIALLY_REFUNDED", () => {
    assert.equal(paymentStateMachine.canTransition("SUCCESS", "PARTIALLY_REFUNDED"), true);
  });

  it("Allowed: SUCCESS -> REFUNDED", () => {
    assert.equal(paymentStateMachine.canTransition("SUCCESS", "REFUNDED"), true);
  });

  it("Allowed: PARTIALLY_REFUNDED -> PARTIALLY_REFUNDED", () => {
    assert.equal(paymentStateMachine.canTransition("PARTIALLY_REFUNDED", "PARTIALLY_REFUNDED"), true);
  });

  it("Allowed: PARTIALLY_REFUNDED -> REFUNDED", () => {
    assert.equal(paymentStateMachine.canTransition("PARTIALLY_REFUNDED", "REFUNDED"), true);
  });

  it("Prohibited: FAILED -> REFUNDED throws ApiError", () => {
    assert.equal(paymentStateMachine.canTransition("FAILED", "REFUNDED"), false);
    assert.throws(
      () => paymentStateMachine.validateTransition("FAILED", "REFUNDED"),
      (err) => err instanceof ApiError && err.errorCode === "INVALID_STATE_TRANSITION"
    );
  });

  it("Prohibited: REFUNDED -> SUCCESS throws ApiError", () => {
    assert.equal(paymentStateMachine.canTransition("REFUNDED", "SUCCESS"), false);
    assert.throws(
      () => paymentStateMachine.validateTransition("REFUNDED", "SUCCESS"),
      (err) => err instanceof ApiError && err.errorCode === "INVALID_STATE_TRANSITION"
    );
  });

  it("Prohibited: REFUNDED -> PENDING throws ApiError", () => {
    assert.equal(paymentStateMachine.canTransition("REFUNDED", "PENDING"), false);
    assert.throws(
      () => paymentStateMachine.validateTransition("REFUNDED", "PENDING"),
      (err) => err instanceof ApiError && err.errorCode === "INVALID_STATE_TRANSITION"
    );
  });

  it("Idempotent: same state transition is allowed as a no-op", () => {
    assert.equal(paymentStateMachine.canTransition("SUCCESS", "SUCCESS"), true);
    assert.equal(paymentStateMachine.canTransition("PENDING", "PENDING"), true);
  });
});
