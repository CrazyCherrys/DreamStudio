# DreamStudio M4 存储、资产与上传开发任务清单

当前状态：已实现。实际验证命令见第 8 节。

M4 在 M3 模型目录与参数 Schema 完成后使用，目标是让 DreamStudio 具备可用的本地/S3 存储配置、参考图上传、资产管理、资产下载/删除、资产清理队列和管理员存储设置页面。M4 不提交图片任务，不调用 new-api 生图，不进入 M5 Worker 图片生成主闭环。

---

## 1. M4 范围

M4 实现：

- 本地文件系统和 S3 兼容对象存储配置。
- 参考图上传与图片 MIME、大小、宽高、checksum 校验。
- 参考图大小上限读取 `system_settings.reference_image_max_mb`，默认 10MB。
- 用户资产库，支持查看、下载、删除和批量删除。
- 管理员存储设置页，支持 local/s3 切换、敏感字段掩码、存储测试。
- `assets` 与 `cleanup_runs` 数据表。
- `asset-cleanup` 队列真实清理逻辑。
- M4 API 和页面验证脚本。

M4 不实现：

- 图片任务提交。
- Worker 调用 new-api 生图。
- 结果图生成闭环。
- 支付、订阅、视频、聊天、团队、分享、模板市场、社区。

---

## 2. 数据库

新增/补齐：

- `assets`
  - `id`
  - `user_id`
  - `kind`
  - `status`
  - `storage_driver`
  - `bucket`
  - `object_key`
  - `filename`
  - `mime_type`
  - `size_bytes`
  - `width`
  - `height`
  - `checksum`
  - `source_task_id`
  - `needs_physical_delete`
  - `created_at`
  - `updated_at`
  - `deleted_at`
  - `expires_at`
  - `cleaned_at`
- `cleanup_runs`
  - `id`
  - `job_type`
  - `status`
  - `started_at`
  - `finished_at`
  - `scanned_count`
  - `deleted_count`
  - `failed_count`
  - `error_summary`
  - `created_at`
- `storage_settings`
  - 补齐 S3 endpoint、bucket、region、path style、public base URL。
  - S3 access key 和 secret key 使用现有 AES-GCM 加密能力保存。
  - API 只返回掩码，不返回明文。

迁移：

- `packages/db/prisma/migrations/20260619030000_m4_storage_assets/migration.sql`

---

## 3. API

用户资产 API：

- `POST /api/v1/assets/reference-images`
- `GET /api/v1/assets`
- `GET /api/v1/assets/:asset_id`
- `GET /api/v1/assets/:asset_id/download`
- `DELETE /api/v1/assets/:asset_id`
- `POST /api/v1/assets/batch-delete`

管理员存储设置 API：

- `GET /api/v1/admin/storage-settings`
- `PUT /api/v1/admin/storage-settings`
- `POST /api/v1/admin/storage-settings/test`

安全规则：

- 用户接口要求登录。
- 写操作要求 CSRF。
- 管理员接口要求 `super_admin`。
- 资产详情、下载、删除都按 `asset.id + user_id` 查询，跨用户访问返回 404。
- 响应不暴露服务器本地真实路径。
- 删除失败时只记录脱敏错误摘要，不暴露本地路径或 S3 密钥。

---

## 4. 存储实现

共享存储能力位于 `packages/storage`：

- `DreamStudioSecretCodec`
- `resolveStorageSettings`
- `prepareStorageSettingsUpdate`
- `uploadImageObject`
- `openDownloadObject`
- `deletePhysicalAsset`
- `cleanupAssets`

本地存储：

- object key 由系统生成。
- 原始文件名只作为下载展示名。
- 本地下载通过后端代理流返回。

S3 兼容存储：

- 使用 S3 SDK `PutObject`、`GetObject`、`DeleteObject`。
- 凭据加密保存。
- 下载优先由后端代理，避免普通资产响应暴露对象 key 或密钥相关信息。
- 存储测试写入临时对象并清理。

---

## 5. 前端

用户页面：

- `/studio/assets`
- 资产类型切换：结果图、参考图。
- `ReferenceImageUploader`
- `AssetGrid`
- `AssetPreviewDialog`
- `BatchDeleteToolbar`
- 空状态提供进入 `/studio` 的入口。

管理员页面：

- `/admin/storage-settings`
- local / s3 切换。
- 本地路径配置。
- S3 endpoint、bucket、region、path style、public base URL、access key、secret key 配置。
- 存储测试。
- 敏感字段显示掩码，留空不修改。
- 页面提示：切换存储不会自动迁移旧文件。

---

## 6. Worker

`image-generation` 队列：

- 仍保持 placeholder，M4 不实现图片任务提交或生成。

`asset-cleanup` 队列：

- 清理过期 `reference_image`。
- 清理已软删除且需要物理删除的资产文件。
- 每次运行写 `cleanup_runs`。
- 单个文件清理失败不会中断整个批次。
- 日志只包含 asset id、kind、计数和脱敏错误摘要。

---

## 7. 验收标准

- 管理员可以配置 local 存储并测试通过。
- 管理员可以进入 `/admin/storage-settings`。
- 普通用户可以进入 `/studio/assets`。
- 登录用户可以上传参考图。
- 参考图上传大小错误文案随 `reference_image_max_mb` 动态变化。
- 上传资产写入 `assets`，记录宽高、大小、MIME、checksum 和系统生成 object key。
- 下载接口返回文件流。
- 用户不能访问其他用户资产。
- 用户可以删除自己的资产。
- 批量删除只处理自己的资产。
- `asset-cleanup` 能写入 `cleanup_runs` 并清理过期/软删除资产。
- API 响应不返回本地绝对路径。
- S3 密钥不明文出现在 API 响应、日志或验证输出。

---

## 8. 实际验证命令

已执行并通过：

- `npm run db:migrate:deploy`
  - 应用迁移 `20260619030000_m4_storage_assets`。
- `DREAMSTUDIO_VERIFY_API_URL=http://127.0.0.1:3101 ... npx tsx scripts/verify-m4.ts`
  - 通过 local 存储设置、存储测试、参考图上传、资产元数据、下载、跨用户 404、删除、清理队列和审计日志校验。
- `DREAMSTUDIO_VERIFY_API_URL=http://127.0.0.1:3001 ... npx tsx scripts/verify-m4.ts`
  - 通过 local 存储设置、存储测试、参考图上传、资产元数据、下载、跨用户 404、删除、清理队列和审计日志校验。
- `DREAMSTUDIO_VERIFY_WEB_URL=http://localhost:3000 ... npx tsx scripts/verify-m4-routes.ts`
  - 通过 `/admin/storage-settings`、`/studio/assets` 和参考图上传入口路由校验。
- `npm run lint`
- `npm run typecheck`
- `npm run format:check`
- `npm run build`
  - Next route table 包含 `/admin/storage-settings` 和 `/studio/assets`。
- `docker compose config --quiet`
- `docker compose up -d --build dreamstudio`
  - 重新构建并重建 `dreamstudio:local` 容器。
- `curl -sS -i http://127.0.0.1:3001/healthz`
  - 返回 `200 OK`，`status=ok`。
- `curl -sS -i http://127.0.0.1:3001/readyz`
  - 返回 `200 OK`，Postgres、Redis、queues、settings 均为 `ok`。

验证过程中修正了资产下载 UUID 校验正则和 Playwright 路由脚本的宽泛选择器。最终容器重建后，健康检查、就绪检查和 M4 路由 smoke 均通过。
