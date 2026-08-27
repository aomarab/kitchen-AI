/**
 * Parses a `redis://` URL into ioredis/BullMQ connection options. Shared by
 * every module that owns a queue so they cannot drift apart on, for example,
 * `maxRetriesPerRequest` — BullMQ requires it to be null.
 */
export function redisConnection(url: string) {
  const u = new URL(url);
  return {
    host: u.hostname,
    port: Number(u.port || 6379),
    ...(u.password ? { password: u.password } : {}),
    ...(u.username ? { username: u.username } : {}),
    ...(u.pathname && u.pathname.length > 1 ? { db: Number(u.pathname.slice(1)) } : {}),
    maxRetriesPerRequest: null as null,
  };
}
