import { z } from "zod";

const refundReasons = [
  "duplicate",
  "fraudulent",
  "requested_by_customer",
];

export const refundSchema = z.object({
  paymentId: z
    .string({
      required_error: "Payment ID is required.",
      invalid_type_error: "Payment ID must be a string.",
    })
    .trim()
    .min(1, "Payment ID is required."),

  amount: z
    .coerce
    .number({
      invalid_type_error: "Refund amount must be a valid number.",
    })
    .positive("Refund amount must be greater than zero.")
    .optional(),

  reason: z
    .enum(refundReasons, {
      invalid_type_error: `Refund reason must be one of: ${refundReasons.join(
        ", "
      )}.`,
    })
    .optional(),

  idempotencyKey: z
    .string({
      invalid_type_error: "Idempotency key must be a string.",
    })
    .trim()
    .min(1, "Idempotency key cannot be empty.")
    .max(255, "Idempotency key cannot exceed 255 characters.")
    .optional(),
});

export default refundSchema;