import { z } from "zod";

/** Canonical error envelope documented in OpenAPI and enforced by error-handler. */
export const errorBodySchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});
