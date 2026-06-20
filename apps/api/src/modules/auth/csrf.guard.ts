import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';

import { csrfFailed } from './auth.errors';
import type { AuthenticatedRequest } from './auth.types';
import { SessionService } from './session.service';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(private readonly sessionService: SessionService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (SAFE_METHODS.has(request.method.toUpperCase())) {
      return true;
    }

    if (
      !request.auth ||
      !this.sessionService.isValidCsrf(request.auth, request.header('x-csrf-token'))
    ) {
      throw csrfFailed();
    }

    return true;
  }
}
