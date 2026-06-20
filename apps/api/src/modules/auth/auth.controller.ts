import { Body, Controller, Get, HttpCode, Patch, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';

import { AuthService } from './auth.service';
import type { AuthBody, AuthenticatedRequest, PasswordBody } from './auth.types';
import { CsrfGuard } from './csrf.guard';
import { SessionAuthGuard } from './session-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @HttpCode(200)
  register(
    @Body() body: AuthBody,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.authService.register(body, request, response);
  }

  @Post('login')
  @HttpCode(200)
  login(
    @Body() body: AuthBody,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.authService.login(body, request, response);
  }

  @Post('logout')
  @HttpCode(200)
  @UseGuards(SessionAuthGuard, CsrfGuard)
  logout(@Req() request: AuthenticatedRequest, @Res({ passthrough: true }) response: Response) {
    return this.authService.logout(request.auth!, response);
  }

  @Get('me')
  @UseGuards(SessionAuthGuard)
  me(@Req() request: AuthenticatedRequest) {
    return this.authService.me(request.auth!);
  }

  @Post('refresh')
  @HttpCode(200)
  refresh(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    return this.authService.refresh(request, response);
  }
}

@Controller('me')
export class AccountController {
  constructor(private readonly authService: AuthService) {}

  @Patch('password')
  @UseGuards(SessionAuthGuard, CsrfGuard)
  changePassword(@Body() body: PasswordBody, @Req() request: AuthenticatedRequest) {
    return this.authService.changePassword(body, request.auth!);
  }
}
