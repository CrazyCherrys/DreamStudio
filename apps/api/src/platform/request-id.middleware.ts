import { randomUUID } from 'node:crypto';

import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(request: Request & { requestId?: string }, response: Response, next: NextFunction) {
    const requestId = request.header('x-request-id') ?? `req_${randomUUID()}`;
    request.requestId = requestId;
    response.setHeader('x-request-id', requestId);
    next();
  }
}
