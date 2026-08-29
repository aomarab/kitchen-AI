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
   * OAuth client IDs, each a comma-separated list — Apple and Google both issue
   * a different client id per platform (see `OAuthService.assertAudience`). The
   * `aud` claim of an incoming Apple/Google ID token is pinned to them: without
   * that pinning a token minted for any other app is accepted, which is an
   * account takeover. Optional in development only; the production guard below
   * refuses to boot without them.
   */
  GOOGLE_CLIENT_ID: z.string().default(''),
  APPLE_CLIENT_ID: z.string().default(''),
  /**
   * When true, Apple token exchange and revocation use recorded fakes instead
   * of calling Apple. Mirrors AI_MOCK, and defaults the same way, so the whole
   * system runs offline with no Apple developer credentials.
   */
  APPLE_REVOKE_MOCK: z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true'),
  APPLE_TEAM_ID: z.string().default(''),
  APPLE_KEY_ID: z.string().default(''),
  /** Contents of the Apple `.p8` private key used to sign the client secret. */
  APPLE_PRIVATE_KEY: z.string().default(''),
  /** Base64, 32 bytes decoded. Encrypts the stored Apple refresh token. */
  APPLE_TOKEN_ENC_KEY: z.string().default(''),

  OPENAI_API_KEY: z.string().default(''),
  /**
   * Base URL for the OpenAI-compatible chat provider. Empty = OpenAI's own
   * endpoint. Set to an OpenAI-compatible gateway — e.g. OpenRouter
   * (`https://openrouter.ai/api/v1`) — to serve the cheap/vision/planning tiers
   * through it instead. When routing through such a gateway, set the
   * `OPENAI_MODEL_*` ids to that gateway's namespaced ids (e.g. `openai/gpt-5`)
   * and add their rates to `MODEL_RATES_USD_PER_MTOK`. Note: OpenRouter serves
   * chat only, so embeddings stay on the offline mock whenever this is set
   * (see `ai.module.ts`). See spec §"OpenAI-compatible gateways (OpenRouter)".
   */
  OPENAI_BASE_URL: z.string().default(''),
  OPENAI_MODEL_PLANNING: z.string().default('gpt-5'),
  OPENAI_MODEL_VISION: z.string().default('gpt-5'),
  OPENAI_MODEL_CHEAP: z.string().default('gpt-5-mini'),
  /**
   * Realtime speech-to-speech model for the live assistant (spec Feature 5).
   * Kept separate from the tiers above because it is not routed by
   * `OPERATION_TIER` — the realtime session never passes through `AiGateway`,
   * since its traffic goes client↔provider and we never see a token count.
   */
  OPENAI_MODEL_REALTIME: z.string().default('gpt-realtime'),
  GEMINI_API_KEY: z.string().default(''),
  GEMINI_MODEL_VISION: z.string().default('gemini-3-flash'),
  /**
   * Which vendor serves the vision tier. Defaults to `openai` so a missing or
   * half-finished Gemini setup degrades to today's behaviour instead of failing.
   */
  AI_VISION_VENDOR: z.enum(['openai', 'gemini']).default('openai'),
  /** When true, AI services return recorded fixtures instead of calling OpenAI. */
  AI_MOCK: z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true'),
  AI_DAILY_BUDGET_USD: z.coerce.number().nonnegative().default(2),

  YOUTUBE_API_KEY: z.string().default(''),
  OPEN_FOOD_FACTS_URL: z.string().url().default('https://world.openfoodfacts.org'),

  /**
   * When true, store receipts are accepted without calling RevenueCat, so the
   * whole purchase path runs offline and free with no RevenueCat account —
   * exactly like AI_MOCK, and defaulting the same way. The enum+transform (not
   * `z.coerce.boolean`, which coerces the string "false" to true) is deliberate:
   * an operator setting `PAYMENTS_MOCK=false` must actually switch to the real
   * verifier, not silently stay on the always-approves mock.
   */
  PAYMENTS_MOCK: z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true'),
  /** RevenueCat REST key; used by the verifier to confirm a store receipt. */
  REVENUECAT_API_KEY: z.string().default(''),
  /**
   * Shared secret compared (constant-time) against the webhook's Authorization
   * header. This is the only thing standing between the internet and free
   * credits — the webhook is machine-to-machine and behind no user auth.
   */
  REVENUECAT_WEBHOOK_SECRET: z.string().default(''),
});

const validatedEnvSchema = envSchema.superRefine((env, ctx) => {
  if (env.NODE_ENV === 'production' && env.CORS_ORIGINS.trim() === '') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['CORS_ORIGINS'],
      message: 'must list allowed origins explicitly in production',
    });
  }
  // The JWT secret signs every access token, so in production a guessable or
  // low-entropy value is a full authentication bypass — anyone who knows it can
  // forge a token for any user. Development keeps the 16-char floor for a
  // frictionless local boot, but production refuses the shipped placeholder and
  // demands at least 32 characters.
  if (env.NODE_ENV === 'production') {
    if (env.JWT_SECRET === 'change-me-in-production') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['JWT_SECRET'],
        message: 'must not be the example placeholder in production',
      });
    } else if (env.JWT_SECRET.length < 32) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['JWT_SECRET'],
        message: 'must be at least 32 characters in production',
      });
    }
  }
  if (env.NODE_ENV === 'production' && !env.AI_MOCK && env.OPENAI_API_KEY.trim() === '') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['OPENAI_API_KEY'],
      message: 'is required when AI_MOCK is false',
    });
  }
  // With payments live the webhook signature is the only barrier to free
  // credits, and the verifier cannot call RevenueCat without a key — a missing
  // secret or key would silently open or break the money path.
  if (env.NODE_ENV === 'production' && !env.PAYMENTS_MOCK) {
    for (const key of ['REVENUECAT_API_KEY', 'REVENUECAT_WEBHOOK_SECRET'] as const) {
      if (env[key].trim() === '') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: 'is required when PAYMENTS_MOCK is false',
        });
      }
    }
  }
  if (
    env.NODE_ENV === 'production' &&
    !env.AI_MOCK &&
    env.AI_VISION_VENDOR === 'gemini' &&
    env.GEMINI_API_KEY.trim() === ''
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['GEMINI_API_KEY'],
      message: 'is required when AI_VISION_VENDOR is gemini',
    });
  }
  // Without a client id the `aud` claim cannot be pinned, and an ID token
  // minted for any other OAuth client — including the attacker's own — is
  // accepted as proof of identity.
  for (const key of ['GOOGLE_CLIENT_ID', 'APPLE_CLIENT_ID'] as const) {
    if (env.NODE_ENV === 'production' && env[key].trim() === '') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [key],
        message: 'is required in production to pin the ID token audience',
      });
    }
  }
  // Without these the revoker cannot sign a client secret, and the stored
  // token cannot be decrypted — so deletion would silently stop revoking,
  // which is the exact guideline violation this feature exists to avoid.
  if (env.NODE_ENV === 'production' && !env.APPLE_REVOKE_MOCK) {
    for (const key of [
      'APPLE_TEAM_ID',
      'APPLE_KEY_ID',
      'APPLE_PRIVATE_KEY',
      'APPLE_TOKEN_ENC_KEY',
    ] as const) {
      if (env[key].trim() === '') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: 'is required when APPLE_REVOKE_MOCK is false',
        });
      }
    }
    if (
      env.APPLE_TOKEN_ENC_KEY.trim() !== '' &&
      Buffer.from(env.APPLE_TOKEN_ENC_KEY, 'base64').length !== 32
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['APPLE_TOKEN_ENC_KEY'],
        message: 'must decode to exactly 32 bytes (AES-256)',
      });
    }
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
