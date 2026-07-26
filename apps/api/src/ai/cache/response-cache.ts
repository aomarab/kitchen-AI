import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../ai.constants.js';

/**
 * Caches expensive AI responses keyed by a stable hash of the request inputs
 * (inventory state + generation params + locale). See spec §5.6. Kept behind a
 * port so services can be unit-tested with an in-memory fake and never require
 * a live Redis.
 */
export interface ResponseCachePort {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlSeconds: number): Promise<void>;
}

/** Deterministic cache key from any set of JSON-serialisable parts. */
export function hashKey(namespace: string, parts: unknown): string {
  const json = JSON.stringify(parts);
  const digest = createHash('sha256').update(json).digest('hex').slice(0, 32);
  return `ai:${namespace}:${digest}`;
}

@Injectable()
export class RedisResponseCache implements ResponseCachePort {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async get<T>(key: string): Promise<T | null> {
    const raw = await this.redis.get(key);
    if (raw == null) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    await this.redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
  }
}

/** In-memory cache for tests and for `AI_MOCK`-only local runs without Redis. */
@Injectable()
export class InMemoryResponseCache implements ResponseCachePort {
  private readonly store = new Map<string, { value: unknown; expiresAt: number }>();

  async get<T>(key: string): Promise<T | null> {
    const hit = this.store.get(key);
    if (!hit) return null;
    if (hit.expiresAt < Date.now()) {
      this.store.delete(key);
      return null;
    }
    return hit.value as T;
  }

  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    this.store.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
  }
}
