import { HttpException, HttpStatus } from '@nestjs/common';

export function apiError(
  status: HttpStatus,
  code: string,
  message: string,
  details?: unknown,
): HttpException {
  return new HttpException(
    {
      code,
      message,
      details,
    },
    status,
  );
}

export function unauthorized(message = '未登录或会话已失效'): HttpException {
  return apiError(HttpStatus.UNAUTHORIZED, 'unauthorized', message);
}

export function csrfFailed(message = 'CSRF 校验失败'): HttpException {
  return apiError(HttpStatus.FORBIDDEN, 'csrf_failed', message);
}

export function accountDisabled(message = '账号已被禁用'): HttpException {
  return apiError(HttpStatus.FORBIDDEN, 'account_disabled', message);
}

export function accountDeleted(message = '账号已删除'): HttpException {
  return apiError(HttpStatus.FORBIDDEN, 'account_deleted', message);
}

export function validationFailed(details: unknown): HttpException {
  return apiError(HttpStatus.BAD_REQUEST, 'validation_failed', '参数校验失败', details);
}
