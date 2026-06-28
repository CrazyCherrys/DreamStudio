# DreamStudio M2 new-api 配置与系统设置开发任务清单

本文档在 M1 认证与用户基础完成后使用，目标是让 DreamStudio 能安全保存、测试和管理用户自己的 `new-api` 配置。M2 不实现模型目录、图片任务、资产上传或 Worker 调用生图，只完成后续 M3-M5 所需的密钥、系统设置和管理员代配置基础。

当前状态：已实现。

---

## 1. M2 目标

M2 完成后需要满足：

- 普通用户可以配置自己的 `new-api` Base URL 和 API Key。
- 普通用户可以查看配置状态、密钥掩码和最近测试结果。
- 普通用户可以通过 `GET /v1/models` 测试 `new-api` 连接。
- 管理员可以配置默认 `new-api` 服务地址。
- 管理员可以控制是否允许用户自定义 Base URL。
- 管理员可以代用户配置或清空 `new-api` 密钥。
- 管理员不能查看任何已保存 API Key 明文。
- API Key 使用 `DREAMSTUDIO_SECRET_KEY` 加密入库。
- 敏感管理操作写入审计日志。
- 普通用户登录后如果未配置有效密钥，应进入 `/onboarding/new-api`。

---

## 2. 数据库任务

M2 需要补齐或确认以下数据结构：

- `user_new_api_configs`
- `audit_logs`
- `system_settings` 中 M2 所需设置键

`user_new_api_configs` 需要支持：

- `user_id` 唯一，v1 每个用户仅一个当前配置。
- `new_api_base_url`
- `uses_custom_base_url`
- `encrypted_api_key`
- `key_iv`
- `key_tag`
- `key_version`
- `masked_api_key`
- `status`: `untested`、`valid`、`invalid`
- `last_tested_at`
- `last_test_error`

`audit_logs` 至少需要支持：

- `actor_user_id`
- `action`
- `target_type`
- `target_id`
- `result`
- `ip_address`
- `user_agent`
- `metadata`
- `expires_at`

系统设置至少确认以下键：

- `default_new_api_base_url`
- `allow_user_custom_new_api_base_url`
- `registration_enabled`
- `image_task_timeout_seconds`
- `image_task_max_attempts`
- `image_task_retry_backoff_seconds`
- `per_user_running_task_limit`
- `global_running_task_limit`
- `reference_image_max_mb`
- `result_image_max_mb`
- `request_log_retention_hours`
- `audit_log_retention_hours`

数据库规则：

- API Key 不允许明文入库。
- 查询接口不返回 `encrypted_api_key`、`key_iv`、`key_tag`。
- 管理员代用户配置或清空密钥必须写审计日志。
- 清空配置不删除历史任务或历史日志，后续任务日志保存 Base URL 快照。

---

## 3. 后端任务

### 3.1 加密服务

需要实现：

- AES-256-GCM 加密。
- AES-256-GCM 解密。
- 从 `DREAMSTUDIO_SECRET_KEY` 派生或读取 32 byte 主密钥。
- `key_version` 固定从 `1` 开始，为后续轮换预留。
- 密钥掩码生成，例如保留开头和结尾少量字符。
- 主密钥非法时启动失败或接口明确失败。

安全规则：

- 日志不打印明文 API Key。
- 错误响应不包含明文 API Key。
- 审计日志不记录明文 API Key。

### 3.2 new-api 连接测试

需要实现：

- 调用 `GET {base_url}/v1/models`。
- 使用用户填写或已保存的 API Key 作为 Bearer Token。
- 设置合理超时，建议 10-15 秒。
- 不发送聊天、图片或其他消耗额度请求。
- 成功时记录 `status=valid`、`last_tested_at`。
- 失败时记录 `status=invalid`、`last_tested_at`、`last_test_error`。
- 返回失败摘要时脱敏 URL 和错误信息，避免泄露密钥。

### 3.3 用户接口

需要实现：

- `GET /api/v1/me/new-api-config`
- `PUT /api/v1/me/new-api-config`
- `POST /api/v1/me/new-api-config/test`

用户接口规则：

- 全部要求登录。
- `PUT` 和 `POST` 要求 CSRF。
- 当 `allow_user_custom_new_api_base_url=false` 时，普通用户不能提交自定义 Base URL。
- 如果用户未提交 Base URL，则使用 `default_new_api_base_url`。
- 如果默认 Base URL 未配置，返回明确配置错误。
- `GET` 只返回状态、掩码、Base URL、是否自定义、最近测试时间和错误摘要。
- `PUT` 可以支持 `test_before_save`，保存前测试失败时按请求策略决定是否保存为 `invalid`。

建议响应字段：

- `configured`
- `status`
- `new_api_base_url`
- `uses_custom_base_url`
- `masked_api_key`
- `last_tested_at`
- `last_test_error`
- `allow_user_custom_new_api_base_url`
- `default_new_api_base_url`

### 3.4 管理员系统设置接口

需要实现：

- `GET /api/v1/admin/system-settings`
- `PATCH /api/v1/admin/system-settings`

系统设置规则：

- 全部要求 `super_admin`。
- `PATCH` 要求 CSRF。
- 只允许更新白名单设置键。
- 校验 Base URL 格式。
- 校验布尔值和数值范围。
- 更新默认 `new-api` 地址、用户自定义开关、注册开关和任务参数时写审计日志。

### 3.5 管理员代用户配置接口

需要实现：

- `PUT /api/v1/admin/users/{user_id}/new-api-config`
- `DELETE /api/v1/admin/users/{user_id}/new-api-config`

管理员代配置规则：

- 全部要求 `super_admin`。
- 全部要求 CSRF。
- 管理员可以代用户配置、替换或清空密钥。
- 管理员仍不能读取已保存密钥明文。
- 如果 `test_before_save=true`，保存前调用 `GET /v1/models`。
- 代配置成功写 `admin_set_user_new_api_key` 审计日志。
- 清空成功写 `admin_delete_user_new_api_key` 审计日志。
- 目标用户不存在、禁用或删除时返回明确错误。

### 3.6 当前用户接口补充

需要更新：

- `GET /api/v1/auth/me`

补充返回：

- `new_api_config_status`

规则：

- 普通用户前端可根据该状态决定进入 `/studio` 或 `/onboarding/new-api`。
- 超级管理员访问 `/admin` 不依赖该状态。
- 超级管理员访问创作台仍按普通用户规则要求有效配置。

---

## 4. Web 任务

### 4.1 new-api 配置引导页

需要实现：

- `/onboarding/new-api`

页面能力：

- 说明用户需要先在 `new-api` 中创建 API Key。
- 展示当前默认 Base URL。
- 根据系统开关决定是否显示 Base URL 输入框。
- API Key 输入框。
- 测试连接按钮。
- 保存配置按钮。
- 测试成功后进入 `/studio`。
- 测试失败时展示可理解的错误摘要。

### 4.2 设置页

需要实现：

- `/settings/new-api`

页面能力：

- 查看当前配置状态。
- 查看密钥掩码。
- 查看最近测试时间和失败原因。
- 更新 API Key。
- 按开关更新 Base URL。
- 重新测试连接。

### 4.3 管理员系统设置页

需要实现：

- `/admin/system-settings`

页面能力：

- 配置默认 `new-api` Base URL。
- 配置是否允许用户自定义 Base URL。
- 配置注册开关。
- 展示任务相关设置，但 M2 可只完成表单保存，不实现图片任务。
- 保存后展示成功或失败状态。

### 4.4 管理员用户页最小能力

M2 至少需要提供一个可操作入口，支持管理员代用户配置密钥。

可选实现路径：

- 新增 `/admin/users` 和 `/admin/users/{user_id}` 的最小页面。
- 或在 M2 临时提供一个管理员代配置页面，后续 M6 再扩展完整用户管理。

最低能力：

- 查询用户。
- 查看用户配置状态和密钥掩码。
- 代用户配置或替换 API Key。
- 清空用户 API Key。
- 不显示明文 API Key。

### 4.5 路由守卫调整

需要调整：

- 登录成功后的普通用户跳转逻辑。
- 注册成功后的普通用户跳转逻辑。
- `/studio`、`/studio/tasks`、`/studio/assets` 的访问前置检查。

规则：

- 普通用户无配置或配置异常时进入 `/onboarding/new-api`。
- `/settings/new-api` 只要求登录，不要求密钥有效。
- `/admin` 只要求 `super_admin`，不要求管理员自己配置密钥。

---

## 5. 建议组件

建议新增或扩展：

- `NewApiConfigForm`
- `ConnectionTestResult`
- `SystemSettingsForm`
- `AdminUserNewApiConfigPanel`
- `AuditActionDialog`
- `MaskedSecret`
- `StatusBadge`

组件状态：

- 未配置。
- 已配置但未测试。
- 测试中。
- 测试成功。
- 测试失败。
- 已保存但异常。

---

## 6. 验收命令

M2 完成时至少验证：

- `npm run lint`
- `npm run typecheck`
- `npm run build`
- `npm run format:check`
- `docker compose config --quiet`
- `docker compose up -d --build dreamstudio`
- `/healthz` 正常。
- `/readyz` 正常。

---

## 7. 手动验收场景

普通用户：

- 未配置 `new-api` 的普通用户登录后进入 `/onboarding/new-api`。
- 用户保存 API Key 后，数据库中没有明文 API Key。
- `GET /api/v1/me/new-api-config` 不返回明文 API Key。
- 使用错误 API Key 测试时返回失败摘要，配置状态为 `invalid`。
- 使用可访问的 `new-api` 测试时返回成功，配置状态为 `valid`。
- `allow_user_custom_new_api_base_url=false` 时，普通用户不能保存自定义 Base URL。

管理员：

- 超级管理员可以打开 `/admin/system-settings`。
- 超级管理员可以更新默认 `new-api` Base URL。
- 超级管理员可以关闭或开启用户自定义 Base URL。
- 超级管理员可以更新参考图和结果图大小上限。
- 超级管理员可以代用户配置 API Key。
- 超级管理员可以清空用户 API Key。
- 超级管理员查询用户配置时只能看到掩码。
- 代配置和清空操作写入 `audit_logs`。

安全：

- API 响应不包含明文 API Key。
- 服务日志不包含明文 API Key。
- 审计日志不包含明文 API Key。
- `DREAMSTUDIO_SECRET_KEY` 改变后旧密文无法解密，并返回明确错误。

---

## 8. M2 不做

M2 不实现：

- 模型分类和模型管理。
- 参数 Schema。
- 图片任务提交。
- Worker 调用上游生图。
- 参考图上传。
- 结果图资产管理。
- 请求日志详情。
- 完整管理员用户管理。
- 支付。
- 订阅。
- 视频。
- 聊天。
- 团队。
- 分享。

---

## 9. 完成记录

M2 已按本文档范围完成。

实际实现范围：

- 新增 `user_new_api_configs` 和 `audit_logs`。
- 确认并初始化 M2 所需 `system_settings` 键。
- 实现 AES-256-GCM API Key 加密、解密和掩码展示。
- 实现用户保存、查询、测试 `new-api` 配置。
- 实现管理员系统设置、代用户配置和清空密钥。
- 实现登录态返回 `new_api_config_status`。
- 实现 `/onboarding/new-api`、`/settings/new-api`、`/admin/system-settings`、`/admin/users` 最小可用页面。
- 调整 `/studio`、`/studio/tasks`、`/studio/assets` 路由守卫，未配置或异常用户进入 `/onboarding/new-api`。

数据库迁移名称：

- `20260619010000_m2_new_api_config`

新增 API 列表：

- `GET /api/v1/me/new-api-config`
- `PUT /api/v1/me/new-api-config`
- `POST /api/v1/me/new-api-config/test`
- `GET /api/v1/admin/system-settings`
- `PATCH /api/v1/admin/system-settings`
- `GET /api/v1/admin/users`
- `GET /api/v1/admin/users/{user_id}`
- `PUT /api/v1/admin/users/{user_id}/new-api-config`
- `DELETE /api/v1/admin/users/{user_id}/new-api-config`

新增页面列表：

- `/onboarding/new-api`
- `/settings/new-api`
- `/admin/system-settings`
- `/admin/users`

验证命令结果：

- `npm run lint`：通过。
- `npm run typecheck`：通过。
- `npm run format:check`：通过。
- `npm run build`：通过。
- `docker compose config --quiet`：通过。
- `docker compose up -d --build dreamstudio`：通过。
- `/healthz`：200 OK。
- `/readyz`：200 OK。

手动验收结果：

- `scripts/verify-m2.ts` 通过：普通用户保存配置、API Key 非明文入库、查询接口不返回明文、错误 key 返回 `invalid`、管理员更新系统设置、管理员代配置和清空密钥、审计日志脱敏、super_admin 登录状态。
- `scripts/verify-m2-routes.ts` 通过：未配置普通用户进入 `/onboarding/new-api`、`invalid` 普通用户访问 `/studio` 进入 `/onboarding/new-api`、super_admin 可进入 `/admin`。

已知限制和下一里程碑依赖：

- `/admin/users` 是 M2 最小可用代配置面板，不是完整用户管理。
- M2 不实现模型目录、图片任务、Worker 生图、资产上传、支付、订阅、视频、聊天、团队或分享。
- 后续 M3/M4/M5 继续接入模型目录、资产存储和图片任务。
