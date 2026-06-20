export interface AdminUserListQuery {
  keyword?: unknown;
  status?: unknown;
  page?: unknown;
  page_size?: unknown;
}

export interface AdminUserStatusBody {
  status?: unknown;
}

export interface AdminResetPasswordBody {
  new_password?: unknown;
}

export interface AdminRequestLogListQuery {
  status?: unknown;
  model_id?: unknown;
  user_id?: unknown;
  keyword?: unknown;
  date_from?: unknown;
  date_to?: unknown;
  page?: unknown;
  page_size?: unknown;
}

export interface AdminAuditLogListQuery {
  actor_user_id?: unknown;
  action?: unknown;
  target_type?: unknown;
  result?: unknown;
  date_from?: unknown;
  date_to?: unknown;
  page?: unknown;
  page_size?: unknown;
}
