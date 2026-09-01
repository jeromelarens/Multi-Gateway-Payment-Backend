import { z } from "zod";

export const invoiceSchema = z.object({
  orderId: z
    .string({
      required_error: "Order ID is required.",
      invalid_type_error: "Order ID must be a string.",
    })
    .trim()
    .min(1, "Order ID is required."),
});

export default invoiceSchema;