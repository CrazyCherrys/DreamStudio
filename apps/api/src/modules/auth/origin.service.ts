import { Injectable } from '@nestjs/common';
import type { Request } from 'express';

import { isAllowedAppOrigin, loadConfig } from '@dreamstudio/config';

import { csrfFailed } from './auth.errors';

@Injectable()
export class OriginService {
  private readonly config = loadConfig();

  assertTrustedBrowserRequest(request: Request) {
    const origin = request.header('origin');
    const referer = request.header('referer');
    const candidate = origin ?? this.originFromReferer(referer);

    if (!candidate || !this.isAllowedOrigin(candidate)) {
      throw csrfFailed('请求来源无效');
    }
  }

  private originFromReferer(referer: string | undefined): string | undefined {
    if (!referer) {
      return undefined;
    }

    try {
      return new URL(referer).origin;
    } catch {
      return undefined;
    }
  }

  private isAllowedOrigin(origin: string): boolean {
    try {
      return isAllowedAppOrigin(origin, this.config);
    } catch {
      return false;
    }
  }
}
