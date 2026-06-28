import type { Request } from 'express';

import type { UserRole, UserStatus } from '@prisma/client';

export interface PublicUser {
  id: string;
  username: string;
  display_name: string | null;
  role: UserRole;
  status: UserStatus;
}

export interface SessionContext {
  tokenHash: string;
  sessionId: string;
  userId: string;
  csrfToken: string;
  expiresAt: Date;
  user: PublicUser;
}

export interface AuthenticatedRequest extends Request {
  auth?: SessionContext;
  requestId?: string;
}

export interface StoredSessionPayload {
  session_id: string;
  user_id: string;
  csrf_token: string;
  expires_at: string;
}

export interface AuthBody {
  username?: unknown;
  password?: unknown;
  display_name?: unknown;
}

export interface PasswordBody {
  current_password?: unknown;
  new_password?: unknown;
}

export interface ProfileBody {
  display_name?: unknown;
}
