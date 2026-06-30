# DreamStudio M1 认证与用户基础开发任务清单

本文档在 M0 项目骨架完成后使用，目标是让 M1 开发从认证与用户基础开始，而不是提前扩展到 `new-api` 配置、模型、资产或图片任务业务。

当前状态：已实现并完成本地验证。

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
- 首个超级管理员通过启动初始化创建，默认账号为 `Cherry`。

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
- 首个超级管理员初始化；仅在没有任何 `super_admin` 时创建或升级默认账号，不打印密码。

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
- 公开页右上角根据登录态展示登录入口或用户头像入口。
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

---

## 7. 本次实现记录

M1 已在当前工程中落地：

- 后端新增 `AuthModule`，实现注册、登录、登出、当前用户、刷新会话和修改密码接口。
- 密码使用 Node.js `scrypt` 哈希保存，不保存明文密码。
- 会话使用 `ds_session` HttpOnly Cookie，开发环境不加 Secure，生产环境加 Secure，SameSite=Lax。
- Redis 保存会话快速校验状态，PostgreSQL `user_sessions` 保留会话审计记录。
- 注册、登录、刷新入口校验 Origin 或 Referer，并对登录失败做 Redis 限流。
- 非 GET 受保护接口校验 `X-CSRF-Token`，缺失或错误时返回 `csrf_failed`。
- disabled/deleted 用户会被拦截；检测到 disabled/deleted 状态时撤销未撤销会话。
- 修改密码后保留当前会话，撤销其他会话。
- Web 新增真实登录、注册、禁用提示和账号设置页面；`/studio`、`/studio/tasks`、`/studio/assets`、`/settings/account` 和 `/admin` 已接入路由守卫。
- Web 通过 `GET /api/v1/auth/me` 恢复登录态和内存中的 CSRF token。
- 已登录用户访问 `/auth/login`、`/auth/register` 时自动离开，并消费安全的站内 `next` 参数。
- 启动初始化脚本会在不存在任何 `super_admin` 时创建默认超级管理员 `Cherry`，默认密码为 `DreamStudio`；如同名普通用户已存在，则升级为 `super_admin` 并撤销旧会话。

本次未新增 M1 以外的业务能力；new-api 配置、模型管理、图片任务、资产上传、支付、订阅、视频、聊天、团队和分享仍按后续里程碑处理。

## 8. 本次验证记录

已通过：

- `npm run lint`
- `npm run typecheck`
- `npm run build`
- `npm run format:check`
- `npm run db:generate`
- `docker compose config --quiet`
- `DATABASE_URL=postgresql://dreamstudio:dreamstudio@localhost:5432/dreamstudio?schema=public npm run db:migrate:deploy`
- `DATABASE_URL=postgresql://dreamstudio:dreamstudio@localhost:5432/dreamstudio?schema=public LOCAL_STORAGE_ROOT=/tmp/dreamstudio-data npm run db:init:m0`

在本地 Docker PostgreSQL/Redis 和 API `http://localhost:3101` 上完成脚本验证：

- 注册成功创建 active 普通用户。
- 登录和注册响应设置 `ds_session` HttpOnly、SameSite=Lax Cookie。
- `GET /api/v1/auth/me` 返回 user 和 csrf_token。
- `POST /api/v1/auth/refresh` 可在有效会话下刷新 Cookie 和 csrf_token。
- 登出后 `GET /api/v1/auth/me` 返回 401。
- disabled 用户不能登录，已有会话访问时被拦截并撤销会话。
- `PATCH /api/v1/me/password` 缺少 CSRF 时返回 `csrf_failed`。
- 修改密码后其他 session 失效，新密码可登录。
- 数据库中的 `password_hash` 为 `scrypt$...` 哈希，不保存明文密码。
