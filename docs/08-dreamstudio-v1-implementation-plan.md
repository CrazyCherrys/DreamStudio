# DreamStudio v1 实施计划与开发任务拆分

本文档基于 `01` 到 `07` 阶段确认版编写，用于指导 DreamStudio v1 从文档进入代码实现。本文档将 `06-dreamstudio-v1-ia-and-roadmap.md` 中的 M0-M7 里程碑拆成可执行任务、依赖顺序、验收证据和风险控制。

当前版本状态：确认版。

当前 UI 实现状态：全站默认视觉主题已经切换为暗色体系。后续里程碑新增 Web 页面时，应沿用 `apps/web/src/app/globals.css` 中的暗色 `--ds-*` token、共享 `ds-*` 组件样式、后台暗色 shell 和 Studio 暗色工作区规则，不要按旧浅色或浅米色默认主题继续扩展。

第八阶段的目标是让开发人员可以按顺序开工，不再从 PRD、架构和接口文档中临时拼凑任务。

---

## 1. 实施原则

### 1.1 主线优先

v1 开发主线：

```text
项目骨架 -> 认证 -> new-api 密钥 -> 模型配置 -> 存储资产 -> 图片任务 -> 日志后台 -> 部署验收
```

原则：

- 先跑通主闭环，再做增强。
- 先保证安全和数据边界，再优化体验。
- 先实现第一验收路径，再兼容后段目标。
- 每个里程碑都必须有可验证结果。

### 1.2 v1 禁止抢跑范围

实施过程中不得提前加入：

- 支付。
- 订阅。
- 订单。
- 视频生成。
- AI 对话。
- 团队空间。
- 分享链接。
- 模板市场。
- 社区。
- 复杂数据大屏。
- SSE 或 WebSocket。
- 多角色权限体系。

### 1.3 技术边界

确认技术方向：

- Web：Next.js + React + TypeScript + Tailwind CSS + shadcn/ui 二次封装。
- API：NestJS + TypeScript。
- Worker：NestJS Worker + BullMQ。
- ORM：Prisma。
- 数据库：PostgreSQL 17。
- 队列和会话依赖：Redis。
- 存储：本地文件系统 + S3 兼容对象存储。
- 部署：一个 `dreamstudio` 应用容器，外接 PostgreSQL 和 Redis。

说明：

- Web/API/Worker 是单容器内的逻辑模块，不拆成三个部署容器。
- PostgreSQL 和 Redis 可以使用 Compose 本地服务，也可以使用云服务。

---

## 2. 开发工作流

### 2.1 推荐分支阶段

如果使用 Git，建议按里程碑拆分分支：

- `feature/m0-foundation`
- `feature/m1-auth`
- `feature/m2-new-api-config`
- `feature/m3-models`
- `feature/m4-storage-assets`
- `feature/m5-image-worker`
- `feature/m6-admin-logs`
- `feature/m7-release`

### 2.2 每个里程碑完成定义

每个里程碑完成时必须具备：

- 数据库迁移已完成。
- API 契约已实现或明确标注 deferred。
- 页面可访问。
- 权限校验已覆盖。
- 基础错误状态可见。
- 关键路径有手动验收步骤。
- 不引入 v1 禁止范围。

### 2.3 验收证据

建议每个里程碑保留：

- 运行命令。
- 关键截图。
- API 调用示例。
- 数据库迁移说明。
- 已知限制。
- 下一里程碑依赖。

---

## 3. M0 项目骨架

### 3.1 目标

建立可运行的 DreamStudio 单应用工程，让 Web/API/Worker 能在本地和容器环境启动。

### 3.2 任务拆分

工程初始化：

- 创建 monorepo 或单仓多 app 结构。
- 配置 TypeScript。
- 配置 ESLint。
- 配置 Prettier。
- 配置环境变量读取。
- 配置统一日志格式。

Web：

- 初始化 Next.js App Router。
- 接入 Tailwind CSS。
- 接入 shadcn/ui。
- 建立 DreamStudio CSS 变量，并以暗色 token 作为当前默认主题。
- 建立 `PublicLayout`、`AuthLayout`、`AppLayout`、`AdminLayout` 骨架。
- 首页、认证页、M0 状态页、后台 shell、Studio、任务和资产页面使用暗色视觉基准。

API：

- 初始化 NestJS API 应用。
- 建立 `/api/v1` 前缀。
- 建立统一响应格式。
- 建立统一错误过滤器。
- 建立 request id 中间件。
- 实现 `/healthz` 和 `/readyz`。

Worker：

- 初始化 NestJS Worker 应用。
- 接入 BullMQ。
- 创建 `image-generation` 队列。
- 创建 `asset-cleanup` 队列。
- Worker 启动时输出可识别日志。

数据库和队列：

- 接入 Prisma。
- 配置 PostgreSQL 连接。
- 配置 Redis 连接。
- 建立基础迁移目录。

部署：

- 编写 Dockerfile。
- 编写 Compose 示例。
- Compose 支持本地 PostgreSQL 和 Redis。
- 环境变量支持外部云 PostgreSQL 和云 Redis。
- 单应用容器内启动 Web/API/Worker 逻辑进程。

### 3.3 验收标准

- 本地可以启动 Web。
- API `/healthz` 返回正常。
- API `/readyz` 能检查 PostgreSQL 和 Redis。
- Worker 能连接 Redis 并监听队列。
- Docker Compose 能启动 `dreamstudio` 单应用容器。
- 日志中能区分 Web/API/Worker。
- Web 默认页面不再出现浅米色默认主题、白底提示框、白底表格行或白底代码块。

### 3.4 主要风险

- 单容器多进程退出策略不清晰。
- 本地和云 PostgreSQL/Redis 配置分叉。
- Web/API/Worker 环境变量命名混乱。

---

## 4. M1 认证与用户基础

### 4.1 目标

用户可以注册、登录、登出、刷新会话，并进入受保护页面。

### 4.2 后端任务

数据库：

- 创建 `users` 表。
- 创建 `user_sessions` 表。
- 创建用户角色和状态枚举。
- 实现禁用用户会话失效策略。

认证：

- 密码哈希。
- Cookie 会话。
- Redis 会话校验。
- PostgreSQL 会话审计记录。
- CSRF token 生成和校验。
- 登录限流。

API：

- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/logout`
- `GET /api/v1/auth/me`
- `POST /api/v1/auth/refresh`
- `PATCH /api/v1/me/password`

权限：

- 登录守卫。
- `super_admin` 角色守卫。
- 被禁用用户拦截。

### 4.3 前端任务

页面：

- `/auth/login`
- `/auth/register`
- `/disabled`
- `/settings/account`

状态：

- 应用启动调用 `GET /api/v1/auth/me`。
- 前端保存 CSRF token 到内存。
- 登录后按用户状态跳转。
- 页面刷新后恢复登录态和 CSRF token。

组件：

- `AuthForm`
- `RouteGuard`
- `PermissionGate`
- `DsInput`
- `DsButton`
- `DsFormSection`

视觉：

- 认证页、禁用页和账号设置页沿用全局暗色 `ds-*` surface、按钮、输入框和状态提示。

### 4.4 验收标准

- 普通用户可以注册。
- 普通用户可以登录。
- 登出后不能访问受保护页面。
- 被禁用用户不能登录。
- 修改密码后其他会话失效。
- 页面刷新后仍能识别登录态。

### 4.5 主要风险

- CSRF 规则和登录入口冲突。
- Cookie 安全属性在本地和生产环境配置不同。
- 禁用用户后旧会话未失效。

---

## 5. M2 new-api 配置与系统设置

### 5.1 目标

用户可以配置自己的 `new-api` 密钥，管理员可以配置默认服务地址和代用户配置密钥。

### 5.2 后端任务

数据库：

- 创建 `user_new_api_configs`。
- 创建 `system_settings`。
- 创建 `audit_logs` 基础能力。

加密：

- 实现 AES-256-GCM 加密服务。
- 从 `DREAMSTUDIO_SECRET_KEY` 读取主密钥。
- 保存密文、IV、tag、key version。
- 实现密钥掩码。

系统设置：

- `default_new_api_base_url`
- `allow_user_custom_new_api_base_url`
- `registration_enabled`
- `image_task_timeout_seconds`
- `image_task_max_attempts`
- `image_task_retry_backoff_seconds`
- `per_user_running_task_limit`
- `global_running_task_limit`
- `request_log_retention_hours`
- `audit_log_retention_hours`

API：

- `GET /api/v1/me/new-api-config`
- `PUT /api/v1/me/new-api-config`
- `POST /api/v1/me/new-api-config/test`
- `GET /api/v1/admin/system-settings`
- `PATCH /api/v1/admin/system-settings`
- `PUT /api/v1/admin/users/{user_id}/new-api-config`
- `DELETE /api/v1/admin/users/{user_id}/new-api-config`

上游调用：

- 调用 `GET {new_api_base_url}/v1/models` 测试连接。
- 不发送聊天请求。
- 不消耗用户额度。

### 5.3 前端任务

页面：

- `/onboarding/new-api`
- `/settings/new-api`
- `/admin/system-settings`
- 用户详情页中的代配置密钥区域。

组件：

- `NewApiConfigForm`
- `ConnectionTestResult`
- `SystemSettingsForm`
- `AuditActionDialog`

状态：

- 未配置。
- 测试中。
- 测试成功。
- 测试失败。
- 已保存但异常。

视觉：

- new-api 配置页和系统设置页使用暗色表单块、暗色状态提示和青绿色主操作。

### 5.4 验收标准

- 用户密钥不会明文入库。
- 查询接口不返回密钥明文。
- 管理员不能查看已保存密钥明文。
- 用户连接测试使用 `/v1/models`。
- 测试失败配置不能提交生图任务。
- 管理员代用户配置或清空密钥写审计日志。

### 5.5 主要风险

- `DREAMSTUDIO_SECRET_KEY` 丢失后密钥不可恢复。
- 测试失败仍保存时，前端误导用户可以使用。
- 自定义服务地址开关被前端绕过。

---

## 6. M3 模型目录与参数 Schema

### 6.1 目标

管理员可以配置图片模型和参数 Schema，普通用户可以看到可用模型并渲染参数表单。

### 6.2 后端任务

数据库：

- 创建 `ai_models`，包含固定 `modality`、`icon_url`、`description` 和 `endpoint_types`。
- 创建 `user_model_favorites`。
- 创建 `model_sync_snapshots`。

API：

- `GET /api/v1/models`
- `GET /api/v1/models/{model_record_id}`
- `GET /api/v1/admin/models`
- `POST /api/v1/admin/models`
- `GET /api/v1/admin/models/{model_record_id}`
- `PATCH /api/v1/admin/models/{model_record_id}`
- `DELETE /api/v1/admin/models/{model_record_id}`
- `POST /api/v1/admin/model-sync-snapshots`
- `GET /api/v1/admin/model-sync-snapshots`
- `GET /api/v1/admin/model-sync-snapshots/{snapshot_id}`

Schema 校验：

- 后端校验 `parameter_schema` 结构。
- 后端根据 `parameter_schema` 校验任务参数。
- 只允许 Schema 声明的字段进入上游请求。

### 6.3 前端任务

普通用户：

- 创作台固定筛选：全部、聊天、图片、视频、我的。
- 创作台模型搜索和模型列表。
- `ParameterSchemaForm` 渲染。

管理员：

- `/admin/models`
- `/admin/model-sync`
- 表单式参数 Schema 配置器。
- 高级 JSON 预览、导入和导出。

组件：

- `FixedModelFilterTabs`
- `ModelSearchInput`
- `ModelPicker`
- `ParameterSchemaForm`
- `SchemaBuilder`
- `SchemaFieldEditor`
- `SchemaPreview`

视觉：

- 模型筛选、模型列表和参数 Schema 表单使用暗色卡片、暗色输入框、青绿色选中态和暗色 JSON 预览。

### 6.4 验收标准

- 管理员可以创建并启用图片模型。
- 普通用户只看到启用模型。
- 参数 Schema 不需要管理员手写 JSON 才能完成配置。
- 前端能按 Schema 渲染参数表单。
- 后端能拒绝模型不支持的参数。
- 模型候选拉取不会自动暴露给普通用户。

### 6.5 主要风险

- Schema 配置器过度复杂，拖慢主闭环。
- 前后端 Schema 理解不一致。
- 模型禁用后旧任务重试逻辑不一致。

---

## 7. M4 存储、资产与上传

### 7.1 目标

系统可以保存参考图和结果图资产，用户资产仓库只展示结果图。

### 7.2 后端任务

数据库：

- 创建 `storage_settings`。
- 创建 `assets`。
- 创建 `cleanup_runs`。
- S3 access key 和 secret key 使用应用层加密。

存储适配：

- 本地存储适配器。
- S3 兼容存储适配器。
- 统一 `StorageService`。
- 文件命名规则。
- MIME 校验。
- 文件大小限制。
- 图片宽高读取。

API：

- `POST /api/v1/assets/reference-images`
- `GET /api/v1/assets`
- `GET /api/v1/assets/{asset_id}`
- `GET /api/v1/assets/{asset_id}/download`
- `DELETE /api/v1/assets/{asset_id}`
- `POST /api/v1/assets/batch-delete`
- `GET /api/v1/admin/storage-settings`
- `PUT /api/v1/admin/storage-settings`
- `POST /api/v1/admin/storage-settings/test`

清理：

- 建立 `asset-cleanup` 队列。
- 标记过期资产。
- 删除物理文件。
- 写入 `cleanup_runs`。

### 7.3 前端任务

页面：

- `/studio/assets`
- `/admin/storage-settings`

组件：

- `ReferenceImageUploader`
- `AssetGrid`
- `AssetPreviewDialog`
- `StorageSettingsForm`
- `BatchDeleteToolbar`

体验：

- 资产仓库只展示结果图。
- 参考图只在上传流程和任务详情中展示。
- 删除资产前二次确认。
- 无结果图时给出进入创作台的入口。

视觉：

- 资产缩略图容器、上传提示、存储设置表单和批量删除工具条使用暗色 surface，不使用白底预览区。

### 7.4 验收标准

- 用户可以上传参考图。
- 用户可以查看、下载、删除自己的结果图。
- 用户不能访问其他用户资产。
- 删除资产同步删除物理文件。
- S3 密钥不明文保存。
- 存储测试能返回成功或可读错误。

### 7.5 主要风险

- 本地路径泄露给前端。
- S3 私有对象 URL 暴露过久。
- 删除数据库记录和删除物理文件不一致。
- 参考图不进资产仓库但仍需任务详情可见。

---

## 8. M5 图片任务与 Worker 主闭环

### 8.1 目标

用户可以提交图片任务，Worker 使用用户自己的 `new-api` 密钥调用上游图片接口并保存结果图。

### 8.2 后端任务

数据库：

- 创建 `image_tasks`。
- 创建 `image_task_attempts`。
- 创建 `request_logs`。
- 增加 `image_tasks(user_id, client_request_id) where client_request_id is not null` 部分唯一索引。

API：

- `POST /api/v1/image-tasks`
- `GET /api/v1/image-tasks`
- `GET /api/v1/image-tasks/{task_id}`
- `POST /api/v1/image-tasks/{task_id}/cancel`
- `POST /api/v1/image-tasks/{task_id}/retry`
- `DELETE /api/v1/image-tasks/{task_id}`

任务创建：

- 校验用户 `new-api` 配置有效。
- 校验模型启用。
- 校验参数 Schema。
- 校验参考图归属。
- 保存 prompt 和 negative prompt 加密内容。
- 保存参数快照和脱敏参数快照。
- 生成 BullMQ job。
- 支持 `client_request_id` 幂等。

Worker：

- 消费 `image-generation` 队列。
- 任务开始前确认仍为 `pending`。
- 解密用户密钥。
- 调用 `/v1/images/generations`。
- 调用 `/v1/images/edits`。
- 处理 multipart 参考图。
- 处理 URL 结果。
- 处理 base64 结果。
- 保存结果图。
- 创建结果图资产。
- 写 `image_task_attempts`。
- 写 `request_logs`。
- 自动重试可重试错误。
- 超时处理。

### 8.3 前端任务

页面：

- `/studio`
- `/studio/tasks`
- `/studio/tasks/{task_id}`

组件：

- `PromptEditor`
- `ModelParameterForm`
- `GenerateButton`
- `RecentTaskPanel`
- `ImageTaskCard`
- `ImageTaskStatusBadge`
- `ResultPreviewGrid`

交互：

- 提交任务时生成 `client_request_id`。
- 创建后展示 pending 卡片。
- 轮询任务状态。
- pending 任务可取消。
- running 任务展示不可取消。
- 失败任务可重新提交。
- 成功任务展示结果图。

视觉：

- Studio 主工作区使用更深背景和沉稳侧栏，选中模型与主生成按钮使用青绿色，运行中/提示强调使用低亮度琥珀色。
- 任务列表、任务详情、参数快照和结果图预览使用暗色卡片与暗色代码块。

### 8.4 验收标准

- 用户关闭页面后任务继续执行。
- 任务成功后结果图进入资产仓库。
- 上游返回 URL 时会下载并保存。
- 上游返回 base64 时会解码并保存。
- 失败任务有可读错误摘要。
- 请求日志不记录密钥。
- 重复 `client_request_id` 不重复创建任务。

### 8.5 主要风险

- Worker 重启导致任务状态卡住。
- 上游错误分类不准导致错误重试。
- 任务参数快照和模型配置变更互相影响。
- 结果图保存失败后任务状态不一致。

---

## 9. M6 管理后台与日志审计完善

### 9.1 目标

管理员可以管理用户、排查请求问题、查看审计记录。

### 9.2 后端任务

用户管理 API：

- `GET /api/v1/admin/users`
- `GET /api/v1/admin/users/{user_id}`
- `PATCH /api/v1/admin/users/{user_id}/status`
- `POST /api/v1/admin/users/{user_id}/reset-password`

日志 API：

- `GET /api/v1/admin/request-logs`
- `GET /api/v1/admin/request-logs/{log_id}`
- `POST /api/v1/admin/request-logs/{log_id}/reveal-prompt`
- `POST /api/v1/admin/request-logs/{log_id}/reveal-params`
- `GET /api/v1/admin/audit-logs`

审计：

- 管理员登录后台。
- 启用用户。
- 禁用用户。
- 软删除用户。
- 重置用户密码。
- 管理员代用户配置密钥。
- 管理员清空用户密钥。
- 修改系统设置。
- 修改存储设置。
- 查看完整 prompt。
- 查看完整参数快照。

### 9.3 前端任务

页面：

- `/admin`
- `/admin/users`
- `/admin/users/{user_id}`
- `/admin/request-logs`
- `/admin/audit-logs`

组件：

- `AdminDataTable`
- `AdminNavPanel`
- `AuditActionDialog`
- `RequestLogDetail`
- `RevealSensitiveContentDialog`

后台首页：

- 只做导航面板和关键配置入口。
- 不做复杂统计图表。

视觉：

- 管理后台使用暗色 sidebar/content shell，表格行、日志详情、审计参数和 reveal 内容使用暗色 raised surface 与暗色代码块。

### 9.4 验收标准

- 管理员可以禁用用户并使会话失效。
- 管理员可以重置用户密码。
- 管理员可以查看请求日志。
- 查看完整 prompt 必须写审计日志。
- 查看完整参数快照必须写审计日志。
- 日志不展示密钥和完整 Authorization Header。

### 9.5 主要风险

- 敏感字段在日志详情中泄露。
- reveal 接口没有写审计。
- 管理员操作缺少二次确认。

---

## 10. M7 部署、测试与发布准备

### 10.1 目标

DreamStudio v1 达到可部署、可验收、可维护的状态。

### 10.2 部署任务

容器：

- 完成生产 Dockerfile。
- 单容器启动 Web/API/Worker。
- 关键进程退出时容器退出。
- stdout/stderr 输出结构化日志。

Compose：

- 提供本地 PostgreSQL 示例。
- 提供本地 Redis 示例。
- 支持外接云 PostgreSQL。
- 支持外接云 Redis。
- 本地存储 volume 示例。

环境变量：

- `DATABASE_URL`
- `REDIS_URL`
- `DREAMSTUDIO_SECRET_KEY`
- `APP_BASE_URL`
- `COOKIE_SECRET`
- `NODE_ENV`
- `LOCAL_STORAGE_ROOT`

文档：

- 部署文档。
- 环境变量文档。
- 数据库迁移文档。
- S3 配置文档。
- 可选备份建议。
- 故障排查说明。

### 10.3 测试任务

单元测试：

- 加密服务。
- 密钥掩码。
- 参数 Schema 校验。
- 错误映射。
- 存储适配器。

集成测试：

- 认证和会话。
- `new-api` 配置测试。
- 模型管理。
- 资产上传。
- 任务创建。
- Worker 执行。

E2E：

- 注册登录。
- 配置密钥。
- 管理员配置模型。
- 上传参考图。
- 提交图片任务。
- 查看结果图。
- 下载和删除结果图。
- 管理员查看失败日志。

### 10.4 验收标准

- Docker Compose 可以启动 DreamStudio 单应用容器。
- 可以连接本地或云 PostgreSQL/Redis。
- 主流程 E2E 通过。
- 部署文档能指导维护人员完成最小部署。
- 关键安全规则通过检查。

### 10.5 主要风险

- 单容器进程管理不可靠。
- 云 Redis TLS 或认证配置遗漏。
- 主密钥丢失后的恢复边界没有说明。
- 生产环境 Cookie 和 HTTPS 配置错误。

---

## 11. 横向任务

### 11.1 安全

贯穿所有里程碑：

- 密钥不明文保存。
- 密钥不通过 API 返回。
- Authorization Header 不进日志。
- 跨用户访问必须后端校验。
- 管理员敏感操作写审计。
- 完整 prompt 和完整参数查看写审计。

### 11.2 UI 一致性

贯穿前端开发：

- 使用 DreamStudio CSS 变量。
- shadcn/ui 必须二次封装。
- 首页采用暗色工作室视觉方向。
- 创作台采用三栏布局。
- 资产仓库只展示结果图。
- Schema 配置器使用表单式配置。

### 11.3 可观测性

基础要求：

- 每个请求有 request id。
- Worker job 有 task id。
- 上游调用记录耗时和状态。
- 错误日志脱敏。
- 任务失败可在请求日志中定位。

### 11.4 数据迁移

要求：

- 所有表通过 Prisma migration 管理。
- PostgreSQL 部分唯一索引用 raw migration。
- 迁移顺序遵循 `04-dreamstudio-v1-data-model.md`。
- 生产迁移前建议按运维策略备份数据库，但备份不作为 v1 强制验收项。

---

## 12. 推荐首批开发顺序

如果从 0 开始开工，确认第一批只做：

1. M0 项目骨架。
2. M1 注册登录和会话。
3. M2 用户 `new-api` 密钥配置和测试。
4. M3 最小模型目录和参数 Schema。
5. M5 最小文生图任务闭环。

说明：

- M4 存储能力仍然必须实现，但可先以内置本地存储跑通，再扩展 S3。
- M6 管理后台可以先实现必要配置页，再补齐日志审计体验。
- 首页视觉可以并行开发，但不能阻塞主闭环验证。
- 正式编码前需要补充 `09-dreamstudio-v1-env-and-deployment.md`，用于明确环境变量、Compose、单容器进程、本地/云 PostgreSQL、Redis、存储挂载、主密钥风险和可选备份建议。

---

## 13. 第八阶段确认项

以下实施策略已确认：

- 按 M0-M7 顺序实施。
- 首批开发先跑通 M0、M1、M2、M3 和 M5 最小闭环。
- M4 存储先本地存储跑通，再接 S3。
- M6 后台先完成必要配置和日志，再优化管理体验。
- 正式编码前补充 `09-dreamstudio-v1-env-and-deployment.md` 部署环境变量文档。
