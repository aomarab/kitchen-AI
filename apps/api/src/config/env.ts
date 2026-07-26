import { z } from 'zod';

/**
 * Environment contract. The API refuses to boot on an invalid environment
 * rather than failing at the first request.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().positive().default(3333),
  /**
   * Comma-separated origins allowed to call the API with credentials. Required
   * in production: reflecting an arbitrary origin while allowing credentials
   * would let any site drive an authenticated session if tokens ever move to
   * cookies. Empty in development means "reflect the caller".
   */
  CORS_ORIGINS: z.string().default(''),

  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),

  S3_ENDPOINT: z.string().url(),
  S3_REGION: z.string().default('us-east-1'),
  S3_BUCKET: z.string().min(1),
  S3_ACCESS_KEY: z.string().min(1),
  S3_SECRET_KEY: z.string().min(1),
  S3_FORCE_PATH_STYLE: z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true'),

  JWT_SECRET: z.string().min(16),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('30d'),

  /**
   * OAuth client IDs. When set, the `aud` claim of an incoming Apple/Google ID
   * token is pinned to them — without that pinning a token minted for any other
   * app would be accepted, so these must be set before production.
   */
  GOOGLE_CLIENT_ID: z.string().default(''),
  APPLE_CLIENT_ID: z.string().default(''),

  OPENAI_API_KEY: z.string().default(''),
  OPENAI_MODEL_PLANNING: z.string().default('gpt-5'),
  OPENAI_MODEL_VISION: z.string().default('gpt-5'),
  OPENAI_MODEL_CHEAP: z.string().default('gpt-5-mini'),
  /** When true, AI services return recorded fixtures instead of calling OpenAI. */
  AI_MOCK: z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true'),
  AI_DAILY_BUDGET_USD: z.coerce.number().nonnegative().default(2),

  YOUTUBE_API_KEY: z.string().default(''),
  OPEN_FOOD_FACTS_URL: z.string().url().default('https://world.openfoodfacts.org'),
});

const validatedEnvSchema = envSchema.superRefine((env, ctx) => {
  if (env.NODE_ENV === 'production' && env.CORS_ORIGINS.trim() === '') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['CORS_ORIGINS'],
      message: 'must list allowed origins explicitly in production',
    });
  }
  if (env.NODE_ENV === 'production' && !env.AI_MOCK && env.OPENAI_API_KEY.trim() === '') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['OPENAI_API_KEY'],
      message: 'is required when AI_MOCK is false',
    });
  }
});

export type Env = z.infer<typeof envSchema>;

/** Origins allowed by CORS, or `true` to reflect the caller in development. */
export function corsOrigins(env: Env): string[] | true {
  const list = env.CORS_ORIGINS.split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  return list.length > 0 ? list : true;
}

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = validatedEnvSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment:\n${issues}`);
  }
  return parsed.data;
}

export const ENV = Symbol('ENV');
