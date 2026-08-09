/**
 * Request size limits.
 *
 * These are deliberately derived from the contract rather than picked by feel:
 * a request the contract declares legal must not be rejected by the transport
 * underneath it.
 */

/**
 * Maximum JSON request body.
 *
 * Express defaults to 100KB. The largest contract-legal request is a full
 * offline sync batch — `syncEventsRequestSchema` caps `events` at 500 and the
 * mobile client batches at exactly that number, so a full queue is routine.
 * 500 events serialise to roughly 106KB, over the default. body-parser throws
 * from middleware, outside any route handler, so the failure reaches the client
 * as a generic 500 `INTERNAL_ERROR` rather than a 413 — and a client that only
 * retries `NetworkError` treats it as fatal, wedging the queue permanently.
 *
 * 2MB leaves headroom for the batch plus every other body in the contract
 * (photo keys, recipe text) while still refusing anything genuinely abusive.
 * Photo bytes never pass through the API — they are PUT straight to storage
 * with a presigned URL that signs its own `ContentLength`.
 */
export const JSON_BODY_LIMIT = '2mb';
