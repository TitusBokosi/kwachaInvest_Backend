import { z } from "zod";

const envSchema = z.object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().positive().default(4000),

    DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

    JWT_SECRET: z.string().min(32, "JWT_SECRET should be at least 32 characters"),
    ACCESS_TOKEN_EXPIRY: z.string().default("15m"),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
    OTP_TTL_MINUTES: z.coerce.number().int().positive().default(10),

    APP_BASE_URL: z.string().url("APP_BASE_URL must be a full URL, e.g. https://api.kwachainvest.mw"),

    PAYCHANGU_SECRET_KEY: z.string().min(1, "PAYCHANGU_SECRET_KEY is required"),
    PAYCHANGU_WEBHOOK_SECRET: z.string().min(1, "PAYCHANGU_WEBHOOK_SECRET is required"),
    PAYCHANGU_BASE_URL: z.string().url().default("https://api.paychangu.com"),

    SMTP_HOST: z.string().min(1, "SMTP_HOST is required"),
    SMTP_PORT: z.coerce.number().int().positive().default(587),
    SMTP_SECURE: z.enum(["true", "false"]).default("false"),
    SMTP_USER: z.string().min(1, "SMTP_USER is required"),
    SMTP_PASSWORD: z.string().min(1, "SMTP_PASSWORD is required"),
    SMTP_FROM: z.string().optional(),

    REDIS_URL: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
    console.error("\n❌ Invalid or missing environment variables:\n");
    for (const issue of parsed.error.issues) {
        console.error(`  - ${issue.path.join(".")}: ${issue.message}`);
    }
    console.error("\nCheck your .env file against .env.example and try again.\n");
    process.exit(1);
}

export const env = parsed.data;
