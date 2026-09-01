import { z } from "zod";

export const webhookSchema = z.object({
  id: z.string(),

  type: z.string(),

  created: z.number(),

  livemode: z.boolean(),

  object: z.object({
    id: z.string().optional(),
  }).passthrough(),
}).passthrough();