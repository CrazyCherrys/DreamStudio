import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import type { Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();
    const request = context.getRequest<{ requestId?: string }>();
    const status =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const exceptionResponse =
      exception instanceof HttpException ? exception.getResponse() : 'Internal server error';

    const errorPayload = this.normalizeError(status, exceptionResponse);

    response.status(status).json({
      success: false,
      error: errorPayload,
      request_id: request.requestId,
    });
  }

  private normalizeError(status: number, exceptionResponse: string | object) {
    if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
      const maybeError = exceptionResponse as {
        error?: string;
        message?: string | string[];
        code?: string;
        details?: unknown;
      };
      return {
        code: maybeError.code ?? this.codeForStatus(status),
        message: Array.isArray(maybeError.message)
          ? maybeError.message.join('; ')
          : (maybeError.message ?? maybeError.error ?? 'Request failed'),
        details: maybeError.details,
      };
    }

    return {
      code: this.codeForStatus(status),
      message: exceptionResponse,
    };
  }

  private codeForStatus(status: number): string {
    switch (status) {
      case HttpStatus.UNAUTHORIZED:
        return 'unauthorized';
      case HttpStatus.FORBIDDEN:
        return 'forbidden';
      case HttpStatus.NOT_FOUND:
        return 'not_found';
      case HttpStatus.CONFLICT:
        return 'conflict';
      case HttpStatus.TOO_MANY_REQUESTS:
        return 'rate_limited';
      case HttpStatus.SERVICE_UNAVAILABLE:
        return 'service_unavailable';
      case HttpStatus.BAD_REQUEST:
        return 'validation_failed';
      default:
        return status >= 500 ? 'internal_error' : 'request_failed';
    }
  }
}
