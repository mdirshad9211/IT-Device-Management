import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),

  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  TEST_DATABASE_URL: z.string().optional(),

  JWT_SECRET: z.string().min(16, "JWT_SECRET must be at least 16 characters"),
  AGENT_JWT_SECRET: z.string().min(16, "AGENT_JWT_SECRET must be at least 16 characters"),
  ADMIN_SECRET_PASSWORD_HASH: z.string().min(1, "ADMIN_SECRET_PASSWORD_HASH is required"),

  /** Max age of Agent.lastPollAt before QR resolve returns a stale_warning (default 24h). */
  QR_STALE_POLL_THRESHOLD_MS: z.coerce.number().int().positive().default(24 * 60 * 60 * 1000),

  SMTP_HOST: z.string().optional().default(""),
  SMTP_PORT: z.coerce.number().int().positive().optional().default(587),
  SMTP_USER: z.string().optional().default(""),
  SMTP_PASSWORD: z.string().optional().default(""),
  SMTP_FROM: z.string().optional().default("inventory@yourcompany.com"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error("❌ Invalid environment configuration:");
  // eslint-disable-next-line no-console
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export type Env = typeof env;
