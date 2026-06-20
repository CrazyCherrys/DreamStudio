import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';

import { CookieService } from './cookie.service';
import { SessionService } from './session.service';
import type { AuthenticatedRequest } from './auth.types';

@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(
    private readonly cookieService: CookieService,
    private readonly sessionService: SessionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.cookieService.readSessionCookie(request);
    request.auth = await this.sessionService.validateToken(token);
    return true;
  }
}
