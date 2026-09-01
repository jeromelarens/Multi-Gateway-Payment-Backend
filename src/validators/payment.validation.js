import { z } from "zod";

/**
 * Unified Payment Creation Schema (Phase 1)
 */
export const createPaymentSchema = z.object({
  amount: z
    .number({
      required_error: "Amount is required.",
      invalid_type_error: "Amount must be a numeric value.",
    })
    .positive("Amount must be greater than zero.")
    .refine(
      (val) => {
        const parts = val.toString().split(".");
        return parts.length === 1 || parts[1].length <= 2;
      },
      { message: "Amount cannot have more than 2 decimal places." }
    ),

  currency: z
    .string()
    .trim()
    .toUpperCase()
    .default("INR")
    .refine((val) => val === "INR", {
      message: "Only 'INR' currency is supported for this configuration.",
    }),

  gateway: z
    .enum(["STRIPE", "CASHFREE"], {
      errorMap: () => ({
        message: "Payment gateway must be either 'STRIPE' or 'CASHFREE'.",
      }),
    })
    .default("STRIPE"),

  description: z
    .string()
    .trim()
    .max(255, "Description cannot exceed 255 characters.")
    .optional()
    .default("Payment order"),

  returnUrl: z
    .string()
    .url("Return URL must be a valid URL.")
    .optional(),

  notifyUrl: z
    .string()
    .url("Notify URL must be a valid URL.")
    .optional(),

  metadata: z
    .record(z.any())
    .optional()
    .default({}),
});

/**
 * Legacy Create Order Schema (Backward Compatibility)
 */
export const createOrderSchema = z.object({
  userId: z
    .string()
    .min(1, "User ID is required")
    .optional(),

  amount: z
    .number({
      required_error: "Amount is required",
    })
    .positive("Amount must be greater than zero"),

  currency: z
    .string()
    .default("INR"),

  gateway: z
    .enum(["STRIPE", "CASHFREE"])
    .optional()
    .default("STRIPE"),

  description: z
    .string()
    .max(255)
    .optional(),
});

export const createPaymentIntentSchema = z.object({
  orderId: z
    .string()
    .min(1, "Order ID is required"),
});

export const paymentHistorySchema = z.object({
  userId: z
    .string()
    .min(1, "User ID is required")
    .optional(),

  page: z
    .coerce
    .number()
    .int()
    .positive()
    .optional()
    .default(1),

  limit: z
    .coerce
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .default(20),
});

export const paymentDetailsSchema = z.object({
  paymentId: z
    .string()
    .min(1, "Payment ID is required"),
});