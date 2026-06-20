import { Module } from '@nestjs/common';

import { AccountController, AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { CookieService } from './cookie.service';
import { CsrfGuard } from './csrf.guard';
import { LoginRateLimitService } from './login-rate-limit.service';
import { OriginService } from './origin.service';
import { PasswordService } from './password.service';
import { SessionAuthGuard } from './session-auth.guard';
import { SessionService } from './session.service';
import { SuperAdminGuard } from './super-admin.guard';

@Module({
  controllers: [AuthController, AccountController],
  providers: [
    AuthService,
    CookieService,
    CsrfGuard,
    LoginRateLimitService,
    OriginService,
    PasswordService,
    SessionAuthGuard,
    SessionService,
    SuperAdminGuard,
  ],
  exports: [
    CookieService,
    PasswordService,
    SessionAuthGuard,
    SessionService,
    CsrfGuard,
    SuperAdminGuard,
  ],
})
export class AuthModule {}
