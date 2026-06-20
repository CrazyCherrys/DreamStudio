import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';

import { apiError } from './auth.errors';
import type { AuthenticatedRequest } from './auth.types';

@Injectable()
export class SuperAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (request.auth?.user.role !== 'super_admin') {
      throw apiError(403, 'forbidden', '无权限访问');
    }

    return true;
  }
}
