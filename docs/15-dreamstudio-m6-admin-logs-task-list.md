# DreamStudio M6 管理后台与日志审计完善开发任务清单

当前状态：已实现。后续多模型适配阶段已在管理后台补齐 execution profile/revision 管理、模板导入、JSON draft 导入/导出、请求预览、diff、test 和发布流程；实际验证命令见第 8 节。

M6 在 M5 图片任务与 Worker 主闭环完成后使用，目标是让管理员具备用户管理、请求排查和审计追踪能力。M6 不扩展 AI 创作主链路，不实现支付、订阅、视频、聊天、团队、分享、模板市场或社区。

---

## 1. M6 范围

M6 实现：

- 管理员用户详情、启用、禁用、软删除和重置密码。
- 禁用用户或重置密码后撤销该用户现有会话。
- 请求日志列表、详情和敏感内容 reveal。
- 审计日志列表和筛选。
- 管理后台日志页面。
- 模型详情页的 execution profile/revision 管理。
- 管理员查看完整 Prompt 或完整参数时写审计日志。
- M6 API 和页面验证脚本。

M6 不实现：

- 复杂统计大屏。
- 成本核算。
- 支付、订阅、订单。
- 视频生成。
- AI 对话。
- 团队空间。
- 分享链接。
- 模板市场。
- 社区。

---

## 2. 后端 API

用户管理 API：

- `GET /api/v1/admin/users`
- `GET /api/v1/admin/users/:user_id`
- `PATCH /api/v1/admin/users/:user_id/status`
- `POST /api/v1/admin/users/:user_id/reset-password`

请求日志 API：

- `GET /api/v1/admin/request-logs`
- `GET /api/v1/admin/request-logs/:log_id`
- `POST /api/v1/admin/request-logs/:log_id/reveal-prompt`
- `POST /api/v1/admin/request-logs/:log_id/reveal-params`

Execution profile API：

- `GET /api/v1/admin/models/:model_record_id/execution-profiles`
- `POST /api/v1/admin/models/:model_record_id/execution-profiles`
- `GET /api/v1/admin/execution-profiles/:profile_id`
- `PATCH /api/v1/admin/execution-profiles/:profile_id`
- `DELETE /api/v1/admin/execution-profiles/:profile_id`
- `GET /api/v1/admin/execution-profiles/:profile_id/revisions`
- `POST /api/v1/admin/execution-profiles/:profile_id/revisions`
- `POST /api/v1/admin/execution-profiles/:profile_id/revisions/import-template/:template_id`
- `PATCH /api/v1/admin/execution-profile-revisions/:revision_id`
- `POST /api/v1/admin/execution-profile-revisions/:revision_id/lint`
- `POST /api/v1/admin/execution-profile-revisions/:revision_id/preview-request`
- `POST /api/v1/admin/execution-profile-revisions/:revision_id/test`
- `GET /api/v1/admin/execution-profile-revisions/:revision_id/diff`
- `POST /api/v1/admin/execution-profile-revisions/:revision_id/activate`
- `GET /api/v1/admin/profile-templates`

审计日志 API：

- `GET /api/v1/admin/audit-logs`
- `GET /api/v1/admin/audit-logs/:log_id`

规则：

- 全部要求 `super_admin`。
- 写操作和 reveal 操作要求 CSRF。
- 用户禁用、启用、软删除、重置密码必须写审计日志。
- 禁用用户必须撤销该用户现有会话。
- 重置密码必须撤销该用户现有会话。
- 查看完整 Prompt 必须写审计日志。
- 查看完整参数必须写审计日志。
- 普通日志详情默认只返回摘要和脱敏参数。
- 请求日志详情展示 adapter/profile、profile revision、脱敏最终上游请求、上游响应摘要和 profile error hint。
- reveal 响应只返回本次请求需要展示的敏感内容，不缓存到前端状态以外的长期存储。
- Profile/revision 的创建、更新、模板导入、JSON draft 导入和发布必须写审计日志。

---

## 3. 数据与安全

M6 原则上复用已有表：

- `users`
- `user_sessions`
- `request_logs`
- `audit_logs`
- `image_tasks`
- `image_task_attempts`

如现有字段不足，可补充轻量迁移，但不要重构 M1-M5 数据结构。

敏感数据规则：

- 不展示 `new-api` API key 明文。
- 不展示 `Authorization` Header。
- 不展示 S3 secret。
- 不在日志页面展示本地绝对路径。
- 请求日志列表不返回完整 Prompt。
- 请求日志列表不返回完整参数。
- reveal 完整 Prompt 或完整参数时，必须写入 `audit_logs`。
- reveal 失败也建议写入失败审计，便于追踪越权或异常访问。

---

## 4. 前端页面

需要新增或完善：

- `/admin/users`
- `/admin/users/[user_id]`
- `/admin/request-logs`
- `/admin/request-logs/[log_id]`
- `/admin/audit-logs`
- `/admin/models`

需要更新：

- `/admin`
  - 请求日志入口指向 `/admin/request-logs`。
  - 审计日志入口指向 `/admin/audit-logs`。
  - 不再指向 `/m0/status`。

页面能力：

- 用户列表支持关键字、状态筛选和分页。
- 用户详情展示基础信息、状态、new-api 配置状态、最近登录时间和会话摘要。
- 用户详情支持启用、禁用、软删除和重置密码。
- 请求日志列表支持状态、模型、用户、时间筛选。
- 请求日志详情展示任务、模型、状态、HTTP 状态、耗时、错误摘要、Prompt 摘要、脱敏参数。
- 请求日志详情展示 adapter/profile、脱敏最终请求、上游响应摘要和 profile 排障提示。
- 请求日志详情提供 reveal Prompt 和 reveal 参数按钮，并有二次确认。
- 审计日志列表支持操作者、动作、目标类型、结果、时间筛选。
- `/admin/models` 默认展示已添加模型列表，新增和编辑通过顶部大弹窗完成。
- 模型编辑弹窗支持 profile/revision 编辑、模板导入、Revision JSON 导出、Revision JSON 导入为 draft、lint、预览请求、diff、test 和发布。

---

## 5. 组件建议

可新增：

- `AdminDataTable`
- `AdminPagination`
- `AdminFilterBar`
- `RequestLogDetail`
- `RevealSensitiveContentDialog`
- `AuditActionDialog`
- `UserStatusActions`
- `ResetPasswordDialog`

原则：

- 组件保持轻量，不引入复杂表格框架。
- 管理后台优先可排查、可操作、可确认，不做复杂数据可视化。
- 危险操作需要明确按钮状态和二次确认。

---

## 6. 验证脚本

新增：

- `scripts/verify-m6.ts`
- `scripts/verify-m6-routes.ts`

`verify-m6.ts` 至少覆盖：

- 管理员登录。
- 创建普通用户。
- 禁用普通用户。
- 禁用后普通用户旧会话失效。
- 启用普通用户。
- 重置普通用户密码。
- 重置后旧密码不可用，新密码可登录。
- 请求日志列表可查询到 M5 生成的 request log 或脚本准备的测试 request log。
- 请求日志详情默认不返回完整 Prompt 明文。
- reveal Prompt 返回明文并写审计日志。
- reveal 参数返回明文或完整参数对象并写审计日志。
- 审计日志列表可查到用户状态变更、重置密码和 reveal 操作。
- 非管理员访问管理日志接口被拒绝。

`verify-m6-routes.ts` 至少覆盖：

- `/admin/users`
- `/admin/users/[user_id]`
- `/admin/request-logs`
- `/admin/request-logs/[log_id]`
- `/admin/audit-logs`

---

## 7. 验收标准

- 管理员可以查看用户详情。
- 管理员可以禁用用户并使会话失效。
- 管理员可以启用用户。
- 管理员可以软删除用户。
- 管理员可以重置用户密码并使旧会话失效。
- 管理员可以查看请求日志列表和详情。
- 管理员可以在请求日志中定位 adapter、profile、revision、脱敏最终请求和 profile error hint。
- 管理员可以把当前 revision 导出为 JSON，也可以粘贴 JSON 导入为新的 draft revision。
- 模板导入和 JSON 导入不会直接发布 active revision。
- 请求日志默认不展示完整 Prompt 和完整参数。
- reveal 完整 Prompt 必须写审计日志。
- reveal 完整参数必须写审计日志。
- 管理员可以查看审计日志列表。
- 日志页面不泄露 API key、Authorization、S3 secret 或本地绝对路径。
- `/admin` 日志入口指向真实页面。

---

## 8. 实际验证命令

已执行并通过：

- `npm run lint`
- `npm run typecheck`
- `npm run format:check`
- `npm run build`
  - Next route table 包含 `/admin/users`、`/admin/users/[user_id]`、`/admin/request-logs`、`/admin/request-logs/[log_id]` 和 `/admin/audit-logs`。
- `docker compose config --quiet`
- `docker compose up -d --build dreamstudio`
  - 重新构建并重建 `dreamstudio:local` 容器。
- `docker compose exec -T dreamstudio npm run db:migrate:deploy`
  - 确认无待应用迁移。
- `docker compose exec -T dreamstudio npx tsx scripts/verify-m6.ts`
  - 通过管理员登录、创建普通用户、禁用撤销旧会话、启用用户、重置密码撤销旧会话、旧密码拒绝、新密码登录、请求日志查询、默认详情脱敏、reveal Prompt/参数写审计、审计日志查询和普通用户拒绝访问管理接口。
- `docker compose exec -T dreamstudio node -e "fetch('http://127.0.0.1:3001/readyz')..."`
  - 返回 `status=ready`，Postgres、Redis、queues、settings 均为 `ok`。
- `docker compose exec -T dreamstudio node -e "fetch('http://127.0.0.1:3001/healthz')..."`
  - 返回 `status=ok`。
- `docker compose exec -T dreamstudio node -e "fetch('http://127.0.0.1:3000/admin/users')..."`
  - `/admin/users`、`/admin/request-logs`、`/admin/audit-logs` 均返回 `200`。
- `docker compose exec -T dreamstudio node - <<'NODE' ...`
  - 使用已有用户和 request log 检查 `/admin/users/[user_id]` 与 `/admin/request-logs/[log_id]` 动态页面均返回 `200`。

已新增但本次未能执行完整 Playwright 版：

- `npx tsx scripts/verify-m6-routes.ts`
  - 原因：当前宿主命令沙箱禁止 Unix socket listen，`tsx` 启动时报 `listen EPERM: operation not permitted /tmp/tsx-0/15.pipe`；同时宿主命令沙箱无法访问 Docker 发布的 `127.0.0.1:3000/3001` 或容器 bridge IP。
  - `dreamstudio` 容器内可以访问 Web/API，但容器内未安装 Playwright/Chromium。
  - 已用 `npm run build` 的 Next route table 和容器内 HTTP route smoke 覆盖路由存在性。

说明：

- 宿主 shell 直接运行 `npm run db:migrate:deploy` 因未导出 `DATABASE_URL` 失败；实际迁移通过 `dreamstudio` 容器内命令完成验证。
- 宿主 `curl -sS http://127.0.0.1:3001/healthz` 和 `readyz` 在当前命令沙箱中无法连接 Docker 发布端口；容器内 health/readiness 已验证通过。
