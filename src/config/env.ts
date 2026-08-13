import "dotenv/config";
import { z } from "zod";

/**
 * Environment configuration for web-recon.
 *
 * Phase 1 (Foundation): FIRECRAWL_API_KEY is OPTIONAL so the CLI and the
 * Playwright smoke test can run without any external credentials. It becomes
 * required only once the Firecrawl discovery adapter is actually implemented
 * (Phase 2).
 *
 * Never log or print the resolved key.
 */
const envSchema = z.object({
  FIRECRAWL_API_KEY: z.string().min(1).optional(),
});

export type Env = z.infer<typeof envSchema>;

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // Only report which variables are malformed, never their values.
  const issues = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
  throw new Error(`Invalid environment configuration: ${issues}`);
}

export const env: Env = parsed.data;

/** True when a Firecrawl API key is present (do not expose the value). */
export const hasFirecrawlKey = Boolean(env.FIRECRAWL_API_KEY);
