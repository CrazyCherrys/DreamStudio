import { HttpStatus, Injectable } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Prisma } from '@prisma/client';

import { prisma } from '@dreamstudio/db';

import {
  accountDeleted,
  accountDisabled,
  apiError,
  unauthorized,
  validationFailed,
} from './auth.errors';
import type { AuthBody, PasswordBody, ProfileBody, SessionContext } from './auth.types';
import { CookieService } from './cookie.service';
import { LoginRateLimitService } from './login-rate-limit.service';
import { OriginService } from './origin.service';
import { PasswordService } from './password.service';
import { SessionService } from './session.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly cookieService: CookieService,
    private readonly loginRateLimitService: LoginRateLimitService,
    private readonly originService: OriginService,
    private readonly passwordService: PasswordService,
    private readonly sessionService: SessionService,
  ) {}

  async register(body: AuthBody, request: Request, response: Response) {
    this.originService.assertTrustedBrowserRequest(request);
    await this.assertRegistrationEnabled();
    const input = this.validateAuthBody(body, true);
    const passwordHash = await this.passwordService.hashPassword(input.password);

    try {
      const user = await prisma.user.create({
        data: {
          username: input.username,
          passwordHash,
          displayName: input.displayName,
          role: 'user',
          status: 'active',
        },
      });
      const publicUser = this.sessionService.toPublicUser(user);
      const session = await this.sessionService.createSession(publicUser, request);
      this.cookieService.setSessionCookie(response, session.token);

      return this.authPayload(publicUser, session.csrfToken);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw apiError(HttpStatus.CONFLICT, 'conflict', '用户名已存在');
      }
      throw error;
    }
  }

  async login(body: AuthBody, request: Request, response: Response) {
    this.originService.assertTrustedBrowserRequest(request);
    const input = this.validateAuthBody(body, false);
    await this.loginRateLimitService.assertLoginAllowed(request, input.username);

    const user = await prisma.user.findUnique({
      where: {
        username: input.username,
      },
    });

    if (!user) {
      await this.loginRateLimitService.recordLoginFailure(request, input.username);
      throw unauthorized('用户名或密码错误');
    }

    if (user.status === 'disabled') {
      await this.sessionService.revokeUserSessions(user.id);
      throw accountDisabled();
    }

    if (user.status === 'deleted') {
      await this.sessionService.revokeUserSessions(user.id);
      throw accountDeleted();
    }

    const passwordMatches = await this.passwordService.verifyPassword(
      input.password,
      user.passwordHash,
    );
    if (!passwordMatches) {
      await this.loginRateLimitService.recordLoginFailure(request, input.username);
      throw unauthorized('用户名或密码错误');
    }

    await this.loginRateLimitService.reset(request, input.username);
    const updatedUser = await prisma.user.update({
      where: {
        id: user.id,
      },
      data: {
        lastLoginAt: new Date(),
      },
    });
    const publicUser = this.sessionService.toPublicUser(updatedUser);
    const session = await this.sessionService.createSession(publicUser, request);
    this.cookieService.setSessionCookie(response, session.token);

    return this.authPayload(publicUser, session.csrfToken);
  }

  async me(session: SessionContext) {
    return this.authPayload(session.user, session.csrfToken);
  }

  async refresh(request: Request, response: Response) {
    this.originService.assertTrustedBrowserRequest(request);
    const token = this.cookieService.readSessionCookie(request);
    const refreshed = await this.sessionService.refreshSession(token, request);
    this.cookieService.setSessionCookie(response, refreshed.token);

    return this.authPayload(refreshed.user, refreshed.csrfToken);
  }

  async logout(session: SessionContext, response: Response) {
    await this.sessionService.revokeCurrentSession(session);
    this.cookieService.clearSessionCookie(response);
    return {
      logged_out: true,
    };
  }

  async changePassword(body: PasswordBody, session: SessionContext) {
    const input = this.validatePasswordBody(body);
    const user = await prisma.user.findUnique({
      where: {
        id: session.userId,
      },
    });

    if (!user || user.status !== 'active') {
      throw unauthorized();
    }

    const passwordMatches = await this.passwordService.verifyPassword(
      input.currentPassword,
      user.passwordHash,
    );
    if (!passwordMatches) {
      throw apiError(HttpStatus.BAD_REQUEST, 'validation_failed', '当前密码不正确');
    }

    const passwordHash = await this.passwordService.hashPassword(input.newPassword);
    await prisma.user.update({
      where: {
        id: user.id,
      },
      data: {
        passwordHash,
      },
    });
    await this.sessionService.revokeUserSessions(user.id, session.sessionId);

    return this.authPayload(session.user, session.csrfToken);
  }

  async updateProfile(body: ProfileBody, session: SessionContext) {
    const input = this.validateProfileBody(body);
    const user = await prisma.user.findUnique({
      where: {
        id: session.userId,
      },
    });

    if (!user || user.status !== 'active') {
      throw unauthorized();
    }

    const updatedUser = await prisma.user.update({
      where: {
        id: user.id,
      },
      data: {
        displayName: input.displayName,
      },
    });

    return this.authPayload(this.sessionService.toPublicUser(updatedUser), session.csrfToken);
  }

  private async authPayload(user: SessionContext['user'], csrfToken: string) {
    const config = await prisma.userNewApiConfig.findUnique({
      where: {
        userId: user.id,
      },
      select: {
        status: true,
      },
    });

    return {
      user,
      new_api_config_status: config?.status ?? 'missing',
      csrf_token: csrfToken,
    };
  }

  private async assertRegistrationEnabled() {
    const setting = await prisma.systemSetting.findUnique({
      where: {
        key: 'registration_enabled',
      },
    });

    if (setting?.value === false) {
      throw apiError(HttpStatus.FORBIDDEN, 'registration_disabled', '注册已关闭');
    }
  }

  private validateAuthBody(body: AuthBody, includeDisplayName: boolean) {
    const details: Array<{ field: string; message: string }> = [];
    const username = typeof body.username === 'string' ? body.username.trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    const displayName =
      includeDisplayName && typeof body.display_name === 'string' && body.display_name.trim()
        ? body.display_name.trim()
        : null;

    if (!/^[a-zA-Z0-9_.-]{3,120}$/.test(username)) {
      details.push({
        field: 'username',
        message: '用户名需为 3-120 位字母、数字、下划线、点或短横线',
      });
    }

    if (password.length < 8 || password.length > 256) {
      details.push({
        field: 'password',
        message: '密码需为 8-256 位',
      });
    }

    if (displayName && displayName.length > 160) {
      details.push({
        field: 'display_name',
        message: '展示名不能超过 160 位',
      });
    }

    if (details.length > 0) {
      throw validationFailed(details);
    }

    return {
      username,
      password,
      displayName,
    };
  }

  private validatePasswordBody(body: PasswordBody) {
    const details: Array<{ field: string; message: string }> = [];
    const currentPassword = typeof body.current_password === 'string' ? body.current_password : '';
    const newPassword = typeof body.new_password === 'string' ? body.new_password : '';

    if (currentPassword.length === 0) {
      details.push({
        field: 'current_password',
        message: '当前密码不能为空',
      });
    }

    if (newPassword.length < 8 || newPassword.length > 256) {
      details.push({
        field: 'new_password',
        message: '新密码需为 8-256 位',
      });
    }

    if (currentPassword && newPassword && currentPassword === newPassword) {
      details.push({
        field: 'new_password',
        message: '新密码不能与当前密码相同',
      });
    }

    if (details.length > 0) {
      throw validationFailed(details);
    }

    return {
      currentPassword,
      newPassword,
    };
  }

  private validateProfileBody(body: ProfileBody) {
    const details: Array<{ field: string; message: string }> = [];
    const rawDisplayName = typeof body.display_name === 'string' ? body.display_name.trim() : '';
    const displayName = rawDisplayName.length > 0 ? rawDisplayName : null;

    if (displayName && displayName.length > 160) {
      details.push({
        field: 'display_name',
        message: '展示名不能超过 160 位',
      });
    }

    if (details.length > 0) {
      throw validationFailed(details);
    }

    return {
      displayName,
    };
  }
}
