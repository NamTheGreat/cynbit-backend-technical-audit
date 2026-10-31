import { z } from "zod";

const EnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().default(3000),
    PUBLIC_PORTAL_BASE_URL: z.string().url(),
    DATABASE_URL: z.string().startsWith("postgresql://"),
    REDIS_URL: z.string().startsWith("redis"),
    PORTAL_SESSION_SECRET: z.string().min(32, "PORTAL_SESSION_SECRET must be at least 256 bits (32 chars)"),
    AWS_SES_REGION: z.string().default("ap-south-1"),
    AWS_SES_FROM_EMAIL: z.string().email().default("opportunities@cynbit.in"),
  })
  .superRefine((val, ctx) => {
    if (val.NODE_ENV === "production") {
      try {
        const parsed = new URL(val.PUBLIC_PORTAL_BASE_URL);
        if (
          parsed.protocol !== "https:" ||
          parsed.hostname === "localhost" ||
          parsed.hostname === "127.0.0.1" ||
          parsed.hostname.endsWith(".local")
        ) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["PUBLIC_PORTAL_BASE_URL"],
            message: `CRITICAL CONFIG ERROR: PUBLIC_PORTAL_BASE_URL cannot be non-HTTPS or localhost in production (got: ${val.PUBLIC_PORTAL_BASE_URL}). Remediates OPS-01.`,
          });
        }
      } catch {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["PUBLIC_PORTAL_BASE_URL"],
          message: `CRITICAL CONFIG ERROR: Invalid URL for PUBLIC_PORTAL_BASE_URL (${val.PUBLIC_PORTAL_BASE_URL}).`,
        });
      }
    }
  });

export type Env = z.infer<typeof EnvSchema>;

let parsedEnv: Env;

// In test environment without explicit env vars, supply safe mock defaults
if (process.env.NODE_ENV === "test" && !process.env.PUBLIC_PORTAL_BASE_URL) {
  parsedEnv = EnvSchema.parse({
    NODE_ENV: "test",
    PUBLIC_PORTAL_BASE_URL: "https://cynbit.in",
    DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/cynbit_test?schema=public",
    REDIS_URL: "redis://localhost:6379",
    PORTAL_SESSION_SECRET: "cynbit_test_session_secret_at_least_32_bytes_long!!",
    AWS_SES_REGION: "ap-south-1",
    AWS_SES_FROM_EMAIL: "opportunities@cynbit.in",
  });
} else {
  parsedEnv = EnvSchema.parse(process.env);
}

export const env = parsedEnv;
