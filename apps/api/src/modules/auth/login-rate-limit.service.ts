import { Injectable, OnModuleDestroy } from '@nestjs/common';
import type { Request } from 'express';

import { createRedisConnection, type DreamStudioRedisConnection } from '@dreamstudio/queue';

import {
  LOGIN_RATE_LIMIT_MAX_FAILURES,
  LOGIN_RATE_LIMIT_PREFIX,
  LOGIN_RATE_LIMIT_WINDOW_SECONDS,
} from './auth.constants';
import { apiError } from './auth.errors';

type RedisConnection = DreamStudioRedisConnection;

@Injectable()
export class LoginRateLimitService implements OnModuleDestroy {
  private redis?: RedisConnection;

  async onModuleDestroy() {
    if (this.redis) {
      await this.redis.quit().catch(() => undefined);
    }
  }

  async assertLoginAllowed(request: Request, username: string) {
    const count = await this.withRedis<string | null>((redis) =>
      redis.get(this.key(request, username)),
    );
    if (Number.parseInt(count ?? '0', 10) >= LOGIN_RATE_LIMIT_MAX_FAILURES) {
      throw apiError(429, 'rate_limited', '登录尝试过于频繁，请稍后再试');
    }
  }

  async recordLoginFailure(request: Request, username: string) {
    const key = this.key(request, username);
    await this.withRedis(async (redis) => {
      const count = await redis.incr(key);
      if (count === 1) {
        await redis.expire(key, LOGIN_RATE_LIMIT_WINDOW_SECONDS);
      }
    });
  }

  async reset(request: Request, username: string) {
    await this.withRedis((redis) => redis.del(this.key(request, username))).catch(() => undefined);
  }

  private key(request: Request, username: string): string {
    const ip = request.ip ?? request.socket.remoteAddress ?? 'unknown';
    return `${LOGIN_RATE_LIMIT_PREFIX}${ip}:${username.toLowerCase()}`;
  }

  private async withRedis<T>(operation: (redis: RedisConnection) => Promise<T>): Promise<T> {
    const redis = this.getRedis();
    if (redis.status === 'wait' || redis.status === 'close') {
      await redis.connect();
    }
    return operation(redis);
  }

  private getRedis(): RedisConnection {
    if (!this.redis || this.redis.status === 'end') {
      this.redis = createRedisConnection();
      this.redis.on('error', () => undefined);
    }

    return this.redis;
  }
}
