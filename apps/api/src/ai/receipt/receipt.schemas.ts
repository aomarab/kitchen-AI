import { z } from 'zod';

/**
 * Internal (non-contract) schemas for AI passes whose output never leaves the
 * server as-is. They still go through the {@link SchemaGuard}, so malformed model
 * output is repaired once and then rejected with `AI_INVALID_OUTPUT`.
 */
export const receiptMappingSchema = z.object({
  items: z.array(
    z.object({
      rawName: z.string(),
      canonicalName: z.string().min(1),
      confidence: z.number().min(0).max(1),
    }),
  ),
});
export type ReceiptMapping = z.infer<typeof receiptMappingSchema>;
