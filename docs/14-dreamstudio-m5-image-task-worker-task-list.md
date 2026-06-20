# DreamStudio M5 图片任务与 Worker 主闭环开发任务清单

当前状态：已实现。实际验证命令见第 8 节。

M5 在 M4 存储、资产与上传完成后使用，目标是让用户可以在 `/studio` 提交图片生成任务，Worker 使用用户自己的 new-api 密钥调用上游图片接口，将结果图保存到 M4 存储，并让结果图进入资产库。M5 不实现支付、订阅、视频、聊天、团队、分享、模板市场、社区，也不做 M6 管理日志后台完善。

---

## 1. M5 范围

M5 实现：

- 图片任务数据表、尝试记录和 request log。
- 用户图片任务 API：创建、列表、详情、取消、重试和软删除。
- `image-generation` 队列真实执行逻辑。
- new-api 图片客户端适配层。
- `/studio` 图片任务提交、参考图选择/上传、状态轮询和结果展示。
- `/studio/tasks` 任务列表、状态筛选、取消、重试、软删除和结果入口。
- `/studio/tasks/[task_id]` 任务详情、参数快照、参考图、结果图和尝试记录摘要。
- M5 API/Worker 闭环验证脚本。

M5 不实现：

- 支付、订阅、订单。
- 视频生成。
- AI 对话。
- 团队空间。
- 分享链接。
- 模板市场。
- 社区。
- M6 管理日志后台完整页面。
- `gemini_generate_content` 第一验收路径。

---

## 2. 数据库

新增 Prisma 模型和迁移：

- `image_tasks`
- `image_task_attempts`
- `request_logs`

关键字段：

- `image_tasks` 保存用户、模型快照、endpoint 快照、new-api base URL 快照、Prompt 摘要与加密正文、参数快照、参考图 ID、状态、错误摘要、幂等 `client_request_id` 和时间戳。
- `image_task_attempts` 保存每次 Worker 执行尝试、HTTP 状态、错误摘要和可重试标记。
- `request_logs` 保存 host 级 new-api base URL、模型 ID、endpoint、状态、HTTP 状态、耗时、Prompt 摘要、加密 Prompt、脱敏参数、加密完整参数和过期时间。

索引：

- `image_tasks.user_id`
- `image_tasks.status`
- `image_tasks.model_record_id`
- `image_tasks.created_at`
- `image_tasks.deleted_at`
- partial unique `image_tasks(user_id, client_request_id) where client_request_id is not null`
- `image_task_attempts.task_id`
- unique `image_task_attempts(task_id, attempt_no)`
- `request_logs.user_id`
- `request_logs.task_id`
- `request_logs.status`
- `request_logs.created_at`

迁移：

- `packages/db/prisma/migrations/20260619040000_m5_image_tasks_worker/migration.sql`

---

## 3. API

新增用户任务接口：

- `POST /api/v1/image-tasks`
- `GET /api/v1/image-tasks`
- `GET /api/v1/image-tasks/:task_id`
- `POST /api/v1/image-tasks/:task_id/cancel`
- `POST /api/v1/image-tasks/:task_id/retry`
- `DELETE /api/v1/image-tasks/:task_id`

安全规则：

- 所有接口要求登录。
- 写操作要求 CSRF。
- 普通用户只能访问自己的任务，跨用户访问返回 404 等价安全错误。
- 创建任务要求用户 new-api 配置存在且 `status=valid`。
- 创建任务要求模型存在、启用、未软删除，且分类启用。
- 创建任务复用 M3 `parameter_schema` 校验，未声明参数会被拒绝。
- 参考图必须属于当前用户、类型为 `reference_image`、状态可用且未删除。
- `client_request_id` 对当前用户幂等，重复提交返回已有任务。
- 删除任务为软删除，不删除结果资产。

取消与重试：

- `pending` 任务可取消，并尝试移除 BullMQ job。
- `running` 任务返回 `task_not_cancelable`。
- `succeeded`、`failed`、`timeout`、`canceled` 重复取消不改变状态。
- 只允许 `failed`、`timeout`、`canceled` 重试。
- 重试创建新任务，不覆盖旧任务。
- 重试时重新读取当前模型与用户 new-api 配置，生成新的模型与 base URL 快照。

---

## 4. Worker

`image-generation` 队列已从 placeholder 改为真实执行。

执行流程：

1. 根据 `task_id` 读取任务。
2. 确认任务仍为 `pending`，否则跳过。
3. 更新任务为 `running` 并写入 `started_at`。
4. 创建 `image_task_attempts`。
5. 读取模型快照、参数快照和参考图资产。
6. 解密用户 new-api key。
7. 根据 `endpoint_type_snapshot` 组装上游请求。
8. 调用 new-api。
9. 写 `request_logs`。
10. 解析上游结果。
11. 下载 `url` 图片或解码 `b64_json`。
12. 使用 M4 storage 保存 `result_image`。
13. 创建 `result_image` asset 并关联 `source_task_id`。
14. 更新任务为 `succeeded`。
15. 失败时更新为 `failed` 或 `timeout`，并保存可读错误摘要。

第一验收路径：

- `openai_image_generations`
- 上游返回 `url`
- 上游返回 `b64_json`

第二优先级已预留：

- `openai_image_edits`
- multipart 参考图上传

安全规则：

- Worker 日志不记录 new-api key、Authorization、S3 secret 或本地绝对路径。
- `request_logs` 只保存 base URL host，不保存完整敏感 URL。
- Prompt 和完整 params 按 AES-GCM 加密保存。

---

## 5. new-api 图片客户端

新增 Worker 内部适配：

- `apps/worker/src/modules/image-generation/new-api-image.client.ts`

支持：

- `POST {base_url}/v1/images/generations`
- `POST {base_url}/v1/images/edits`

请求字段：

- `model` 来自 `model_id_snapshot`。
- `prompt` 来自解密后的 Prompt。
- 其他参数来自 `parameter_snapshot`。
- 参考图来自 M4 assets，经存储层读取为 Buffer 后 multipart 上传。

错误映射：

- `401/403` -> `new_api_auth_failed`
- `402` 或额度相关文本 -> `new_api_quota_insufficient`
- `408` 或超时 -> `timeout`
- `429/5xx` -> `retryable`
- `4xx` 参数错误 -> non-retryable failed
- 网络失败 -> `new_api_connection_failed`

---

## 6. 前端

`/studio`：

- 启用 Prompt 输入框和生成按钮。
- 在右侧画布底部中间展示紧凑 Prompt 子容器，不横向铺满整个右侧区域；桌面端宽度约占主体内容区 `60%` 到 `70%`，输入区和快捷参数区同宽对齐。
- Prompt 子容器只展示参考图入口、Prompt、生成按钮和当前模型已配置的快捷参数；不显示模型名、默认参数、参考图数量、负向提示或高级参数。
- Prompt 子容器为无边框沉浸式整块容器，参考图入口与 Prompt 输入区合并在同一块面内；Prompt 输入框本身无描边，聚焦时只显示浅底高亮，不出现描边或内阴影边框。
- 生成按钮以右下角小圆形纸飞机发送图标呈现；输入框默认回车发送，`Shift+Enter` 换行，不展示回车模式切换按钮。
- 快捷参数从当前模型 `parameter_schema` 生成；管理员可在 `/admin/models` 配置张数、比例和分辨率；配置了张数和比例但未配置分辨率时，只显示张数和比例。
- `比例` 表示画幅比例，如 `1:1`、`16:9`、`9:16`；`分辨率` 表示像素规格，如 `1024x1024`。
- 用户未展开修改快捷参数时，提交请求仍使用 `parameter_schema` 中的默认值。
- `/studio` 右侧统一创作容器不显示顶部品牌栏、工作台状态、资产库链接或任务列表链接；任务历史只通过画布左上角胶囊按钮进入。
- 左侧模型卡片采用左侧垂直居中的模型图标和右侧名称/描述，不展示“图片”、“生成”、“编辑”、“推荐”等能力标签；搜索框保持紧凑高度。
- 支持参考图选择和上传，复用 M4 上传接口；上传后加入本次生成的参考图堆叠预览，提交时只发送 `reference_asset_ids`。
- 参考图上传区未上传时只显示加号上传图标，不显示“参考图”文字标签；上传后默认层叠展示缩略图，末尾常驻弱化的加号添加卡片，保留 `n/8` 数量胶囊和右下角极小加号弱提示。
- 鼠标悬停或键盘聚焦参考图区时，所有已传图展开并排，添加卡片排在最后；悬停或聚焦某张已传图时，仅该图放大并显示移除按钮，其他图不显示操作按钮。
- 悬停或聚焦末尾添加卡片时，添加卡片高亮引导上传；达到上限后添加卡片保持可见但禁用。移除按钮只影响本次生成选择，不删除资产库文件。
- 不支持参考图的模型禁用上传区并清空当前参考图选择。
- 左上角“任务列表”胶囊按钮打开当前模型历史任务弹层。
- 任务弹层展示当前模型最近 50 条图片任务，并支持搜索、加载、空状态和错误状态。
- 点击生成时创建 `client_request_id`。
- 提交成功后把 pending 任务同步插入当前模型历史列表。
- 当前模型有 `pending` 或 `running` 任务时轮询任务列表。
- 成功后展示结果图。
- 失败后展示错误摘要。
- 生成按钮在提交中、无模型或无 Prompt 时禁用。

`/studio/tasks`：

- 任务列表。
- 状态筛选。
- 任务卡片。
- Prompt summary。
- 模型 ID。
- 状态。
- 创建时间。
- 错误摘要。
- 成功结果图入口。
- pending 可取消。
- failed/timeout/canceled 可重试。
- 软删除。

`/studio/tasks/[task_id]`：

- 任务详情。
- 参数快照。
- 参考图 ID。
- 结果图。
- 尝试记录摘要。
- 错误摘要。

---

## 7. 验收标准

- 登录用户可以在 `/studio` 选择已启用模型并提交图片任务。
- 没有模型、没有 Prompt 或提交中时生成按钮禁用。
- 切换模型后 `/studio` 任务弹层只显示当前模型任务。
- 提交新任务后 `/studio` 当前模型任务弹层立即出现新任务。
- `/studio` 参考图上传区支持默认占位、单图缩略、多图层叠和 hover/focus 展开预览。
- `/studio` 输入模块为无边框沉浸式布局，输入区宽度约占主体内容区 `60%` 到 `70%`，并与快捷参数区同宽对齐。
- `/studio` 发送入口为右下角小圆形纸飞机图标，默认回车发送，`Shift+Enter` 换行。
- 从 `/studio` 参考图堆叠中移除某张图后，该资产 ID 不再进入本次提交 payload，且资产库文件不被删除。
- 创建任务校验用户 new-api 配置、模型状态、分类状态、参数 Schema 和参考图归属。
- `client_request_id` 重复提交不会重复创建任务。
- Worker 能处理 `openai_image_generations`。
- mock new-api 返回 `b64_json` 时任务成功，结果图入库。
- mock new-api 返回 `url` 时 Worker 下载并保存结果图。
- `/studio/assets?kind=result_image` 可查到结果图。
- 上游失败时任务进入 `failed`，错误摘要可读。
- `pending` 任务可取消。
- `failed`、`timeout`、`canceled` 任务可重试，且创建新任务。
- 普通用户不能访问其他用户任务。
- `request_logs` 不包含 new-api key 明文，不保存完整敏感 URL。
- API 普通响应只返回 Prompt 摘要和脱敏参数快照。

---

## 8. 实际验证命令

已执行并通过：

- `npm run lint`
- `npm run typecheck`
- `npm run format:check`
- `npm run build`
  - Next route table 包含 `/studio`、`/studio/tasks` 和 `/studio/tasks/[task_id]`。
- `docker compose config --quiet`
- `docker compose up -d --build dreamstudio`
  - 重新构建并重建 `dreamstudio:local` 容器。
  - 容器启动时应用迁移 `20260619040000_m5_image_tasks_worker`。
- `docker compose exec -T dreamstudio npm run db:migrate:deploy`
  - 确认无待应用迁移。
- `DREAMSTUDIO_VERIFY_API_URL=http://127.0.0.1:3001 ... npx tsx scripts/verify-m5.ts`
  - 通过创建任务、`client_request_id` 幂等、mock `b64_json` 成功、mock `url` 成功、结果图进入资产库、上游失败、pending 取消、失败任务重试、跨用户 404 和 request log 脱敏校验。
- `DREAMSTUDIO_VERIFY_WEB_URL=http://127.0.0.1:3000 ... npx tsx scripts/verify-m5-routes.ts`
  - 通过 `/studio` 提交 UI、`/studio/tasks` 列表页和 `/studio/tasks/[task_id]` 详情页路由 smoke。
- `curl -sS -i http://127.0.0.1:3001/healthz`
  - 返回 `200 OK`，`status=ok`。
- `curl -sS -i http://127.0.0.1:3001/readyz`
  - 返回 `200 OK`，Postgres、Redis、queues、settings 均为 `ok`。

说明：在宿主 shell 直接运行 `npm run db:migrate:deploy` 时，因当前 shell 未导出 `DATABASE_URL` 失败；实际迁移由 `dreamstudio` 容器启动流程和容器内 `db:migrate:deploy` 完成验证。
