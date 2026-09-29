import { createHash } from 'node:crypto';
import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import type Redis from 'ioredis';
import { AppError } from '../common/errors.js';

export const HOUSEHOLD_JOIN_REDIS = Symbol('HOUSEHOLD_JOIN_REDIS');

export const JOIN_FAILED_ATTEMPT_WINDOW_SECONDS = 60 * 60;
export const JOIN_FAILED_ATTEMPT_USER_LIMIT = 10;
export const JOIN_FAILED_ATTEMPT_IP_LIMIT = 30;

const JOIN_FAILED_ATTEMPT_KEY_PREFIX = 'households:join-failures:v1';
const JOIN_FAILED_ATTEMPT_KEY_TTL_SECONDS = JOIN_FAILED_ATTEMPT_WINDOW_SECONDS * 2;

export interface JoinAttemptIdentity {
  userId: string;
  clientIp: string;
}

@Injectable()
export class JoinAttemptLimiter implements OnModuleDestroy {
  private keyPrefix = JOIN_FAILED_ATTEMPT_KEY_PREFIX;

  constructor(@Inject(HOUSEHOLD_JOIN_REDIS) private readonly redis: Redis) {}

  useKeyPrefix(keyPrefix: string): void {
    this.keyPrefix = keyPrefix;
  }

  async assertAllowed(identity: JoinAttemptIdentity): Promise<void> {
    const [userCount, ipCount] = await this.redis.mget(...this.keys(identity));
    if (
      parseCount(userCount) >= JOIN_FAILED_ATTEMPT_USER_LIMIT ||
      parseCount(ipCount) >= JOIN_FAILED_ATTEMPT_IP_LIMIT
    ) {
      throw AppError.rateLimited('errors.tooManyAttempts');
    }
  }

  async recordFailure(identity: JoinAttemptIdentity): Promise<void> {
    await Promise.all(this.keys(identity).map((key) => this.increment(key)));
  }

  async clear(identity: JoinAttemptIdentity): Promise<void> {
    await this.redis.del(...this.keys(identity));
  }

  async close(): Promise<void> {
    await this.redis.quit();
  }

  async onModuleDestroy(): Promise<void> {
    await this.close();
  }

  private keys(identity: JoinAttemptIdentity): [string, string] {
    const windowId = Math.floor(Date.now() / 1000 / JOIN_FAILED_ATTEMPT_WINDOW_SECONDS);
    return [
      `${this.keyPrefix}:${windowId}:user:${digest(identity.userId)}`,
      `${this.keyPrefix}:${windowId}:ip:${digest(identity.clientIp)}`,
    ];
  }

  private async increment(key: string): Promise<void> {
    const count = await this.redis.incr(key);
    if (count === 1) {
      await this.redis.expire(key, JOIN_FAILED_ATTEMPT_KEY_TTL_SECONDS);
    }
  }
}

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 24);
}

function parseCount(raw: string | null | undefined): number {
  if (!raw) return 0;
  const value = Number(raw);
  return Number.isFinite(value) ? value : 0;
}
