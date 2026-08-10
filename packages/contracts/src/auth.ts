import { z } from 'zod';
import { isoDateTimeSchema, localeSchema, uuidSchema } from './common.js';

/* ------------------------------------------------------------------ */
/* Entities                                                            */
/* ------------------------------------------------------------------ */

export const userSchema = z.object({
  id: uuidSchema,
  email: z.string().email(),
  displayName: z.string().min(1).max(80),
  locale: localeSchema,
  /**
   * Whether the account has a password. Derived from `password_hash`, never the
   * hash itself. Clients need it to decide whether account deletion should ask
   * for a password: an OAuth-only account has none to re-enter.
   */
  hasPassword: z.boolean(),
  createdAt: isoDateTimeSchema,
});
export type User = z.infer<typeof userSchema>;

export const tokenPairSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  /** Seconds until the access token expires. */
  expiresIn: z.number().int().positive(),
});
export type TokenPair = z.infer<typeof tokenPairSchema>;

export const sessionSchema = z.object({
  user: userSchema,
  tokens: tokenPairSchema,
  /** Households the user belongs to. Empty means onboarding is incomplete. */
  householdIds: z.array(uuidSchema),
});
export type Session = z.infer<typeof sessionSchema>;

/* ------------------------------------------------------------------ */
/* Requests                                                            */
/* ------------------------------------------------------------------ */

export const passwordSchema = z
  .string()
  .min(10, 'auth.passwordRules.tooShort')
  .max(128)
  .regex(/[a-z]/, 'auth.passwordRules.needsLowercase')
  .regex(/[A-Z]/, 'auth.passwordRules.needsUppercase')
  .regex(/[0-9]/, 'auth.passwordRules.needsDigit');

export const registerRequestSchema = z.object({
  email: z.string().email(),
  password: passwordSchema,
  displayName: z.string().min(1).max(80),
  locale: localeSchema.default('en'),
});
export type RegisterRequest = z.infer<typeof registerRequestSchema>;

export const loginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const oauthProviderSchema = z.enum(['apple', 'google']);
export type OAuthProvider = z.infer<typeof oauthProviderSchema>;

export const oauthLoginRequestSchema = z.object({
  provider: oauthProviderSchema,
  /** Identity token from the native SDK, or authorization code from the web flow. */
  idToken: z.string().min(1),
  /**
   * Apple's single-use authorization code, sent only by the native Apple flow.
   * Exchanged at sign-in for a refresh token, which is what account deletion
   * later revokes (App Store Guideline 5.1.1(v)). Optional: the web flow and
   * older mobile builds do not send it.
   */
  authorizationCode: z.string().min(1).optional(),
  locale: localeSchema.optional(),
});
export type OAuthLoginRequest = z.infer<typeof oauthLoginRequestSchema>;

export const refreshRequestSchema = z.object({
  refreshToken: z.string().min(1),
});
export type RefreshRequest = z.infer<typeof refreshRequestSchema>;

export const deleteMeRequestSchema = z.object({
  /** Required when the account has a password. Absent for OAuth-only accounts. */
  password: z.string().min(1).optional(),
});
export type DeleteMeRequest = z.infer<typeof deleteMeRequestSchema>;

export const updateMeRequestSchema = z
  .object({
    displayName: z.string().min(1).max(80),
    locale: localeSchema,
  })
  .partial();
export type UpdateMeRequest = z.infer<typeof updateMeRequestSchema>;
