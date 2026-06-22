# DreamStudio M3 模型目录与参数 Schema 开发任务清单

本文档在 M2 new-api 配置与系统设置完成后使用，目标是让 DreamStudio 具备可维护的固定类型模型目录、参数 Schema 和模型候选拉取能力。M3 只完成“模型可配置、可展示、参数表单可渲染、参数可校验”的基础，不提交图片任务，不调用 Worker 生图，不处理资产上传。

当前状态：已实现并通过 M3 验证脚本、构建和 Docker Compose 启动验证。当前图片模型执行配置已扩展为 execution profile/revision；`ai_models.parameter_schema` 仍保留给表单兼容，用户侧图片任务优先读取默认 active profile revision。

---

## 1. M3 目标

M3 完成后需要满足：

- 管理员可以创建、编辑、禁用和软删除图片模型。
- 管理员可以配置模型端点类型、参考图能力、默认参数和参数 Schema。
- 管理员可以在模型详情维护 execution profile、draft/active revision、request mapping 和模板导入。
- 管理员可以从 `new-api` 拉取模型候选快照。
- 模型候选不会自动暴露给普通用户。
- 普通用户只能看到启用且未软删除的分类和模型。
- 创作台可以根据模型 `parameter_schema` 渲染参数表单。
- 后端可以校验 `parameter_schema` 结构。
- 后端提供任务参数校验工具，为 M5 图片任务提交复用。
- 普通用户侧 image 模型只有在存在默认启用 profile 和 active revision 时才可提交。

---

## 2. M3 边界

M3 实现：

- 固定模型类型。
- 模型目录。
- 模型候选快照。
- 参数 Schema 标准。
- 参数 Schema 后端校验。
- 参数 Schema 前端渲染。
- 创作台模型选择和参数表单展示。

M3 不实现：

- 图片任务提交。
- Worker 调用上游生图。
- 参考图上传。
- 结果图资产管理。
- 请求日志详情。
- 完整任务历史。
- 支付。
- 订阅。
- 视频。
- 聊天。
- 团队。
- 分享。

---

## 3. 数据库任务

M3 需要补齐以下数据结构：

- `ai_models`
- `user_model_favorites`
- `model_sync_snapshots`

`ai_models` 需要支持：

- `id`
- `model_id`
- `display_name`
- `provider_name`
- `modality`
- `icon_url`
- `description`
- `endpoint_types`
- `reference_transfer_mode`
- `supports_reference_image`
- `is_enabled`
- `is_recommended`
- `sort_order`
- `default_params`
- `parameter_schema`
- `ai_model_execution_profiles`
- `ai_model_execution_profile_revisions`
- `created_at`
- `updated_at`
- `deleted_at`

`user_model_favorites` 需要支持：

- `user_id`
- `model_id`
- `created_at`

`model_sync_snapshots` 需要支持：

- `id`
- `base_url`
- `operator_id`
- `raw_response`
- `model_count`
- `created_at`

索引和约束：

- `ai_models.modality`
- `ai_models.is_enabled`
- `ai_models.is_recommended`
- `ai_models.sort_order`
- `ai_models.deleted_at`
- `user_model_favorites(user_id, model_id)` 主键
- `user_model_favorites.model_id`
- `model_sync_snapshots.operator_id`
- `model_sync_snapshots.created_at`

规则：

- 模型删除为软删除。
- 普通用户接口只返回启用、未软删除的数据。
- 管理员接口可查看启用和禁用数据，但默认不返回已软删除数据。
- 模型候选快照只供管理员使用。
- Studio 的“我的”来自 `user_model_favorites`，不是模型分类。

---

## 4. 后端 API 任务---

## 4. 后端 API 任务

### 4.1 普通用户模型接口

需要实现：

- `GET /api/v1/models`
- `GET /api/v1/models/{model_record_id}`

规则：

- 要求登录。
- 普通用户只看到启用且未软删除模型。
- 可按固定类型、搜索词、推荐状态和收藏状态筛选模型。
- 响应包含前端渲染模型列表和参数表单所需字段。
- 不返回管理员专用字段和模型候选快照。

### 4.2 管理员模型分类接口（废弃）

需要实现：

- 不再实现管理员模型分类 CRUD。
- 模型类型固定为聊天、图片、视频，由 `/admin/models` 选择。

规则：

- 该接口组不再实现。
- 历史 URL 可显示废弃说明并引导到 `/admin/models`。

### 4.3 管理员模型接口

需要实现：

- `GET /api/v1/admin/models`
- `POST /api/v1/admin/models`
- `GET /api/v1/admin/models/{model_record_id}`
- `PATCH /api/v1/admin/models/{model_record_id}`
- `DELETE /api/v1/admin/models/{model_record_id}`

规则：

- 全部要求 `super_admin`。
- 写操作要求 CSRF。
- 删除为软删除。
- 模型端点改为 `endpoint_types` 多选数组。
- `endpoint_types` 支持 `openai_image_generations`、`openai_image_edits`、`gemini_generate_content`。
- M3 第一验收路径优先支持 `openai_image_generations` 和 `openai_image_edits`；当前后续实现已接入 `gemini_generate_content` adapter，但默认 Gemini profile 仍禁用，直到管理员确认 new-api 网关支持原生路径。
- `parameter_schema` 必须通过后端校验。
- `default_params` 必须通过对应 `parameter_schema` 校验。
- 创建、更新、删除建议写审计日志。

### 4.3.1 管理员执行配置接口

当前后续阶段已补齐：

- `GET /api/v1/admin/models/{model_record_id}/execution-profiles`
- `POST /api/v1/admin/models/{model_record_id}/execution-profiles`
- `GET /api/v1/admin/execution-profiles/{profile_id}`
- `PATCH /api/v1/admin/execution-profiles/{profile_id}`
- `DELETE /api/v1/admin/execution-profiles/{profile_id}`
- `GET /api/v1/admin/execution-profiles/{profile_id}/revisions`
- `POST /api/v1/admin/execution-profiles/{profile_id}/revisions`
- `POST /api/v1/admin/execution-profiles/{profile_id}/revisions/import-template/{template_id}`
- `PATCH /api/v1/admin/execution-profile-revisions/{revision_id}`
- `POST /api/v1/admin/execution-profile-revisions/{revision_id}/lint`
- `POST /api/v1/admin/execution-profile-revisions/{revision_id}/preview-request`
- `POST /api/v1/admin/execution-profile-revisions/{revision_id}/test`
- `GET /api/v1/admin/execution-profile-revisions/{revision_id}/diff`
- `POST /api/v1/admin/execution-profile-revisions/{revision_id}/activate`
- `GET /api/v1/admin/profile-templates`

规则：

- 模板导入和 JSON 粘贴导入只创建 draft revision。
- 发布 active revision 前应运行 lint、请求预览、dry-run test 和 diff。
- OpenAI-compatible copy 必须由管理员删除未确认支持的字段。

### 4.4 模型候选快照接口

需要实现：

- `POST /api/v1/admin/model-sync-snapshots`
- `GET /api/v1/admin/model-sync-snapshots`
- `GET /api/v1/admin/model-sync-snapshots/{snapshot_id}`

规则：

- 全部要求 `super_admin`。
- 创建快照要求 CSRF。
- 拉取使用 `GET {new_api_base_url}/v1/models`。
- 请求可传临时 `api_key` 和 `new_api_base_url`。
- 临时 `api_key` 只用于本次拉取，不保存。
- 如果未传临时 `api_key`，可使用当前管理员已保存且有效的 `new-api` 配置。
- 原始响应保存到 `model_sync_snapshots.raw_response`。
- 候选模型不会自动创建或启用为 DreamStudio 模型。
- 响应和日志不打印临时 `api_key` 明文。

---

## 5. 参数 Schema 标准

M3 需要定义 v1 `parameter_schema` 标准结构。

建议字段：

- `key`
- `label`
- `type`
- `description`
- `required`
- `default`
- `placeholder`
- `min`
- `max`
- `step`
- `options`
- `ui`

建议支持类型：

- `string`
- `number`
- `integer`
- `boolean`
- `select`

`select` 选项建议结构：

```json
{
  "label": "1024 x 1024",
  "value": "1024x1024"
}
```

校验规则：

- `key` 必须唯一。
- `key` 只允许字母、数字、下划线和短横线。
- `label` 必填。
- `type` 必须在支持类型内。
- `required` 必须为布尔值。
- `number` 和 `integer` 可配置 `min`、`max`、`step`。
- `select` 必须有非空 `options`。
- `default` 必须符合字段类型。
- 任务参数只允许包含 Schema 声明的字段。
- 未声明字段必须被拒绝或过滤；M3 推荐先拒绝，避免静默错误。
- Studio Prompt 下方快捷参数只来自当前模型的 `parameter_schema`。
- 模型未配置的快捷参数不显示、不占位；例如只配置张数和比例时，不显示分辨率。
- Studio 中 `比例` 表示画幅比例，例如 `1:1`、`16:9`、`9:16`；`分辨率` 表示像素规格，例如 `1024x1024`。
- `/admin/models` 需要提供 Studio 快捷参数配置入口，让管理员用表单维护张数、比例和分辨率，并写回同一份 `parameter_schema`。

M3 需要提供后端工具：

- 校验 `parameter_schema` 结构。
- 校验 `default_params`。
- 校验用户提交参数。
- 输出可传递给 M5 图片任务模块的干净参数对象。

---

## 6. 前端页面任务

### 6.1 管理员模型分类页（废弃）

不再实现 `/admin/model-categories` 管理入口。历史 URL 可以显示废弃说明并引导到 `/admin/models`。

### 6.2 管理员模型管理页

需要实现：

- `/admin/models`

页面能力：

- 默认展示已添加模型列表，不常驻展示新增或编辑长表单。
- 页面右上角提供新增模型按钮，打开顶部居中的大弹窗完成新增。
- 每个已添加模型卡片右侧提供编辑和软删除操作。
- 编辑模型通过同一个大弹窗完成，弹窗内维护基础信息、Studio 快捷参数、参数 Schema 和执行配置入口。
- 软删除模型需要二次确认，确认文案需说明不会直接清理历史任务。
- 启用或禁用模型。
- 设置推荐。
- 设置固定模型类型：聊天、图片、视频。
- 上传或填写模型图标。
- 设置模型 ID、展示名、厂商名称和描述。
- 多选端点类型。
- 设置参考图传递方式。
- 设置是否支持参考图。
- 设置排序。
- 设置默认参数。
- 配置参数 Schema。

### 6.3 管理员模型候选页

需要实现：

- `/admin/model-sync`

页面能力：

- 输入临时 `new-api` Base URL 和 API Key。
- 或选择使用管理员自己的已保存配置。
- 调用 `GET /v1/models` 拉取候选。
- 展示模型候选列表。
- 展示历史快照。
- 支持从候选复制模型 ID 到模型创建表单。
- 不自动启用候选模型。

### 6.4 创作台模型选择

需要更新：

- `/studio`

页面能力：

- 加载启用模型。
- 按全部、聊天、图片、视频、我的筛选模型。
- 使用搜索框快速搜索模型。
- 展示推荐模型标记。
- 选中模型后在底部 Prompt 子容器下方展示 Schema 驱动的快捷参数。
- 根据模型 `parameter_schema` 只渲染已配置的快捷参数；未配置字段不展示。
- 快捷参数显示张数、比例、分辨率；提交时使用用户选择值，未修改时使用 Schema 默认值。
- M3 阶段生成按钮可保持禁用，并提示“图片任务将在 M5 开放”。

---

## 7. 前端组件任务

建议新增或扩展：

- `ModelCategoryTabs`
- `ModelPicker`
- `ParameterSchemaForm`
- `SchemaBuilder`
- `SchemaFieldEditor`
- `SchemaPreview`
- `ModelForm`
- `ModelCategoryForm`
- `ModelSyncSnapshotPanel`

组件规则：

- 管理员配置参数 Schema 时，不应强制手写 JSON。
- 可以保留高级 JSON 预览、导入和导出。
- Schema Builder 先支持 v1 基础字段，不追求复杂嵌套。
- 普通用户参数表单必须和后端 Schema 标准一致。

---

## 8. 验收命令

M3 完成时至少验证：

- `npm run lint`
- `npm run typecheck`
- `npm run format:check`
- `npm run build`
- `docker compose config --quiet`
- `docker compose up -d --build dreamstudio`
- `/healthz` 正常。
- `/readyz` 正常。

---

## 9. 自动验收脚本

建议新增：

- `scripts/verify-m3.ts`
- `scripts/verify-m3-routes.ts`

`scripts/verify-m3.ts` 至少验证：

- 管理员可以创建模型。
- 管理员可以编辑模型。
- 管理员可以禁用模型。
- 管理员可以软删除模型。
- 模型端点改为 `endpoint_types` 多选数组。
- 合法 `parameter_schema` 可以保存。
- 非法 `parameter_schema` 被拒绝。
- `default_params` 按 Schema 校验。
- 普通用户只能看到启用模型。
- 禁用模型不会展示给普通用户。
- 模型候选快照可以拉取并保存 `raw_response`。
- 候选模型不会自动进入普通用户模型列表。
- 临时 `api_key` 不入库、不进响应、不进日志明文。

`scripts/verify-m3-routes.ts` 至少验证：

- 超级管理员可以访问 `/admin/models`。
- 超级管理员可以访问 `/admin/model-sync`。
- 普通用户不能访问管理页面。
- 普通用户可以在 `/studio` 看到启用模型。
- `/studio` 可以渲染 `ParameterSchemaForm`。

---

## 10. 手动验收场景

管理员：

- 创建一个图片类型模型，例如 `gpt-image-1`，端点选择 `openai_image_generations`。
- 配置一个包含 `prompt_style`、`aspect_ratio`、`size`、`n` 的参数 Schema，其中 `aspect_ratio` 用于画幅比例，`size` 或 `resolution` 用于像素规格。
- 禁用模型后，普通用户列表不再展示。
- 拉取一次模型候选快照，确认候选不自动启用。

普通用户：

- 登录后进入 `/studio`。
- 能看到启用模型。
- 可以使用全部、聊天、图片、视频、我的和搜索框筛选模型。
- 选择模型后，能看到按 Schema 渲染的参数表单。
- 不能看到禁用分类和禁用模型。
- 不能访问 `/admin/models`、`/admin/model-sync`。

安全：

- 普通用户接口不返回模型候选快照。
- 普通用户接口不返回临时 `api_key`。
- 日志和审计不记录临时 `api_key` 明文。
- 管理接口均要求 `super_admin`。
- 写操作均要求 CSRF。

---

## 11. 完成记录

待 M3 实现后补充：

- 实际实现范围。
- 数据库迁移名称。
- 新增 API 列表。
- 新增页面列表。
- 参数 Schema 标准最终结构。
- 验证命令结果。
- 自动验收脚本结果。
- 手动验收结果。
- 已知限制和下一里程碑依赖。
