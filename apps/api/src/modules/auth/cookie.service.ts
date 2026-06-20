import { Injectable } from '@nestjs/common';
import type { Request, Response } from 'express';

import { loadConfig } from '@dreamstudio/config';

import { SESSION_COOKIE_NAME, SESSION_TTL_MS } from './auth.constants';

@Injectable()
export class CookieService {
  private readonly config = loadConfig();
  private readonly secureCookie = new URL(this.config.appBaseUrl).protocol === 'https:';

  readSessionCookie(request: Request): string | undefined {
    const cookieHeader = request.header('cookie');
    if (!cookieHeader) {
      return undefined;
    }

    for (const cookie of cookieHeader.split(';')) {
      const [name, ...valueParts] = cookie.trim().split('=');
      if (name === SESSION_COOKIE_NAME) {
        const value = valueParts.join('=');
        return value ? decodeURIComponent(value) : undefined;
      }
    }

    return undefined;
  }

  setSessionCookie(response: Response, token: string) {
    response.cookie(SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      secure: this.secureCookie,
      sameSite: 'lax',
      path: '/',
      maxAge: SESSION_TTL_MS,
    });
  }

  clearSessionCookie(response: Response) {
    response.clearCookie(SESSION_COOKIE_NAME, {
      httpOnly: true,
      secure: this.secureCookie,
      sameSite: 'lax',
      path: '/',
    });
  }
}
