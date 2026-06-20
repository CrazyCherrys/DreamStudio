import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

import { Injectable, OnModuleDestroy } from '@nestjs/common';
import type { Request } from 'express';

import { loadConfig } from '@dreamstudio/config';
import { prisma } from '@dreamstudio/db';
import { createRedisConnection, type DreamStudioRedisConnection } from '@dreamstudio/queue';

import { SESSION_REDIS_PREFIX, SESSION_TTL_MS } from './auth.constants';
import { accountDeleted, accountDisabled, unauthorized } from './auth.errors';
import type { PublicUser, SessionContext, StoredSessionPayload } from './auth.types';

type RedisConnection = DreamStudioRedisConnection;
type SessionTokenRecord = {
  refreshTokenHash: string | null;
};

@Injectable()
export class SessionService implements OnModuleDestroy {
  private readonly config = loadConfig();
  private redis?: RedisConnection;

  async onModuleDestroy() {
    if (this.redis) {
      await this.redis.quit().catch(() => undefined);
    }
  }

  async createSession(user: PublicUser, request: Request) {
    const token = this.createToken();
    const tokenHash = this.hashToken(token);
    const csrfToken = this.createToken();
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

    const session = await prisma.userSession.create({
      data: {
        userId: user.id,
        refreshTokenHash: tokenHash,
        ipAddress: this.getClientIp(request),
        userAgent: request.header('user-agent'),
        expiresAt,
      },
    });

    await this.storeRedisSession(tokenHash, {
      session_id: session.id,
      user_id: user.id,
      csrf_token: csrfToken,
      expires_at: expiresAt.toISOString(),
    });

    return {
      token,
      csrfToken,
      expiresAt,
      sessionId: session.id,
    };
  }

  async validateToken(token: string | undefined): Promise<SessionContext> {
    if (!token) {
      throw unauthorized();
    }

    const tokenHash = this.hashToken(token);
    const storedSession = await this.getRedisSession(tokenHash);
    if (storedSession) {
      return this.contextFromStoredSession(tokenHash, storedSession);
    }

    const session = await prisma.userSession.findFirst({
      where: {
        refreshTokenHash: tokenHash,
      },
      include: {
        user: true,
      },
    });

    if (!session || session.revokedAt || session.expiresAt <= new Date()) {
      throw unauthorized();
    }

    const user = this.toPublicUser(session.user);
    await this.assertActiveUser(user);

    const csrfToken = this.createToken();
    await this.storeRedisSession(tokenHash, {
      session_id: session.id,
      user_id: user.id,
      csrf_token: csrfToken,
      expires_at: session.expiresAt.toISOString(),
    });

    return {
      tokenHash,
      sessionId: session.id,
      userId: user.id,
      csrfToken,
      expiresAt: session.expiresAt,
      user,
    };
  }

  async refreshSession(token: string | undefined, request: Request) {
    const currentSession = await this.validateToken(token);
    const nextToken = this.createToken();
    const nextTokenHash = this.hashToken(nextToken);
    const csrfToken = this.createToken();
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

    await prisma.userSession.update({
      where: {
        id: currentSession.sessionId,
      },
      data: {
        refreshTokenHash: nextTokenHash,
        ipAddress: this.getClientIp(request),
        userAgent: request.header('user-agent'),
        expiresAt,
        revokedAt: null,
      },
    });

    await this.deleteRedisSessions([currentSession.tokenHash]);
    await this.storeRedisSession(nextTokenHash, {
      session_id: currentSession.sessionId,
      user_id: currentSession.userId,
      csrf_token: csrfToken,
      expires_at: expiresAt.toISOString(),
    });

    return {
      token: nextToken,
      csrfToken,
      expiresAt,
      user: currentSession.user,
    };
  }

  async revokeCurrentSession(session: SessionContext) {
    await prisma.userSession.updateMany({
      where: {
        id: session.sessionId,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });
    await this.deleteRedisSessions([session.tokenHash]);
  }

  async revokeUserSessions(userId: string, exceptSessionId?: string) {
    const sessions: SessionTokenRecord[] = await prisma.userSession.findMany({
      where: {
        userId,
        revokedAt: null,
        ...(exceptSessionId
          ? {
              id: {
                not: exceptSessionId,
              },
            }
          : {}),
      },
      select: {
        refreshTokenHash: true,
      },
    });

    await prisma.userSession.updateMany({
      where: {
        userId,
        revokedAt: null,
        ...(exceptSessionId
          ? {
              id: {
                not: exceptSessionId,
              },
            }
          : {}),
      },
      data: {
        revokedAt: new Date(),
      },
    });

    await this.deleteRedisSessions(
      sessions
        .map((session: SessionTokenRecord) => session.refreshTokenHash)
        .filter((hash: string | null): hash is string => Boolean(hash)),
    );
  }

  isValidCsrf(session: SessionContext, csrfToken: string | undefined): boolean {
    if (!csrfToken) {
      return false;
    }

    const expected = Buffer.from(session.csrfToken);
    const received = Buffer.from(csrfToken);
    return expected.length === received.length && timingSafeEqual(expected, received);
  }

  toPublicUser(user: {
    id: string;
    username: string;
    displayName: string | null;
    role: PublicUser['role'];
    status: PublicUser['status'];
  }): PublicUser {
    return {
      id: user.id,
      username: user.username,
      display_name: user.displayName,
      role: user.role,
      status: user.status,
    };
  }

  private async contextFromStoredSession(
    tokenHash: string,
    storedSession: StoredSessionPayload,
  ): Promise<SessionContext> {
    const expiresAt = new Date(storedSession.expires_at);
    if (Number.isNaN(expiresAt.getTime()) || expiresAt <= new Date()) {
      await this.deleteRedisSessions([tokenHash]);
      throw unauthorized();
    }

    const user = await prisma.user.findUnique({
      where: {
        id: storedSession.user_id,
      },
    });

    if (!user) {
      await this.deleteRedisSessions([tokenHash]);
      throw unauthorized();
    }

    const publicUser = this.toPublicUser(user);
    await this.assertActiveUser(publicUser);

    const session = await prisma.userSession.findFirst({
      where: {
        id: storedSession.session_id,
        refreshTokenHash: tokenHash,
      },
      select: {
        revokedAt: true,
        expiresAt: true,
      },
    });

    if (!session || session.revokedAt || session.expiresAt <= new Date()) {
      await this.deleteRedisSessions([tokenHash]);
      throw unauthorized();
    }

    return {
      tokenHash,
      sessionId: storedSession.session_id,
      userId: storedSession.user_id,
      csrfToken: storedSession.csrf_token,
      expiresAt,
      user: publicUser,
    };
  }

  private async assertActiveUser(user: PublicUser) {
    if (user.status === 'disabled') {
      await this.revokeUserSessions(user.id);
      throw accountDisabled();
    }

    if (user.status === 'deleted') {
      await this.revokeUserSessions(user.id);
      throw accountDeleted();
    }
  }

  private async getRedisSession(tokenHash: string): Promise<StoredSessionPayload | undefined> {
    const value = await this.withRedis<string | null>((redis) =>
      redis.get(this.sessionKey(tokenHash)),
    );
    if (!value) {
      return undefined;
    }

    try {
      return JSON.parse(value) as StoredSessionPayload;
    } catch {
      await this.deleteRedisSessions([tokenHash]);
      return undefined;
    }
  }

  private async storeRedisSession(tokenHash: string, payload: StoredSessionPayload) {
    const ttlSeconds = Math.max(
      1,
      Math.floor((new Date(payload.expires_at).getTime() - Date.now()) / 1000),
    );
    await this.withRedis((redis) =>
      redis.set(this.sessionKey(tokenHash), JSON.stringify(payload), 'EX', ttlSeconds),
    );
  }

  private async deleteRedisSessions(tokenHashes: string[]) {
    if (tokenHashes.length === 0) {
      return;
    }

    await this.withRedis((redis) =>
      redis.del(...tokenHashes.map((tokenHash) => this.sessionKey(tokenHash))),
    ).catch(() => undefined);
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

  private sessionKey(tokenHash: string): string {
    return `${SESSION_REDIS_PREFIX}${tokenHash}`;
  }

  private createToken(): string {
    return randomBytes(32).toString('base64url');
  }

  private hashToken(token: string): string {
    return createHmac('sha256', this.config.cookieSecret).update(token).digest('hex');
  }

  private getClientIp(request: Request): string | undefined {
    return request.ip ?? request.socket.remoteAddress ?? undefined;
  }
}
