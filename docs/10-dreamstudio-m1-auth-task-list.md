# DreamStudio M1 认证与用户基础开发任务清单

本文档在 M0 项目骨架完成后使用，目标是让 M1 开发从认证与用户基础开始，而不是提前扩展到 `new-api` 配置、模型、资产或图片任务业务。

当前状态：开发准备清单。

---

## 1. M1 目标

M1 完成后需要满足：

- 普通用户可以注册。
- 普通用户可以登录。
- 用户可以登出。
- 页面刷新后可以恢复登录态和 CSRF token。
- 被禁用用户不能登录。
- 修改密码后其他会话失效。
- 受保护页面有登录守卫。
- `super_admin` 页面有角色守卫。

---

## 2. 数据库任务

M0 已建立 `users` 和 `user_sessions` 基础 schema。M1 需要继续确认：

- `users.username` 唯一约束符合注册需求。
- `users.password_hash` 只保存哈希。
- `users.role` 使用 `user` 和 `super_admin`。
- `users.status` 使用 `active`、`disabled`、`deleted`。
- `user_sessions` 保留 `refresh_token_hash`、`ip_address`、`user_agent`、`expires_at`、`revoked_at`。
- 禁用用户时撤销该用户所有未撤销 session。

---

## 3. API 任务

需要实现：

- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/logout`
- `GET /api/v1/auth/me`
- `POST /api/v1/auth/refresh`
- `PATCH /api/v1/me/password`

横向能力：

- 密码哈希服务。
- Cookie session。
- Redis session 快速校验。
- PostgreSQL session 审计记录。
- CSRF token 生成和校验。
- 登录入口 Origin 或 Referer 校验。
- 登录限流。
- 登录守卫。
- `super_admin` 角色守卫。
- 禁用用户拦截。

---

## 4. Web 任务

需要实现：

- `/auth/login`
- `/auth/register`
- `/disabled`
- `/settings/account`
- 应用启动调用 `GET /api/v1/auth/me`。
- 前端内存保存 CSRF token。
- 登录成功后按用户状态跳转。
- 页面刷新后恢复登录态。
- 未登录访问 `/studio`、`/studio/tasks`、`/studio/assets` 时跳转登录。
- 普通用户访问 `/admin/*` 时返回无权限。

基础组件：

- `DsButton`
- `DsInput`
- `DsFormSection`
- `RouteGuard`
- `PermissionGate`
- `AuthForm`

---

## 5. 验收命令和手动检查

M1 完成时至少验证：

- `npm run lint`
- `npm run typecheck`
- `npm run build`
- 注册接口成功创建 `active` 普通用户。
- 登录接口设置 `ds_session` HttpOnly Cookie。
- `GET /api/v1/auth/me` 返回用户和 CSRF token。
- 登出后 `GET /api/v1/auth/me` 返回 401。
- 禁用用户无法登录。
- 修改密码后旧 session 失效。
- 非 GET 受保护接口缺少 CSRF 时拒绝。

---

## 6. M1 不做

M1 不实现：

- `new-api` 密钥配置。
- 图片模型管理。
- 图片任务。
- 资产上传。
- 支付。
- 订阅。
- 视频。
- 聊天。
- 团队。
- 分享。
