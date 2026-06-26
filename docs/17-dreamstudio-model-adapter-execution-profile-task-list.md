# DreamStudio 多模型生图适配层执行任务清单

当前状态：阶段 12 已完成。

本文档基于 `16-dreamstudio-model-adapter-execution-profile-plan.md`，用于把多模型生图适配层拆成可以逐阶段实现、验证、提交和回滚的任务包。

## 0. 实施边界

当前 DreamStudio 处于开发阶段，允许重建本地或测试环境。

本轮实施不要求：

- 兼容历史 `ImageTask`。
- 为历史 `AiModel` 编写复杂 backfill。
- 保留没有 profile snapshot 的 Worker legacy fallback。
- 长期兼容旧执行字段作为新任务来源。

本轮实施必须保留：

- 新任务创建时快照 adapter、profile revision、request mapping 和脱敏请求结构。
- 重试任务默认沿用原任务快照。
- active revision 发布前必须经过 lint、请求预览和 smoke test。
- 每个阶段完成后同步相关文档、运行验证、重建 Docker 服务并推送当前分支。

## 1. 全局执行规则

每个阶段按以下顺序执行：

1. 阅读本阶段指定资料。
2. 审阅本地代码 seam。
3. 汇报真实现状和准备修改的文件。
4. 实施改动。
5. 自审 diff。
6. 运行本阶段验证。
7. 运行全局验证。
8. 更新相关 docs。
9. Docker rebuild 并重启服务。
10. 提交并推送。

全局验证命令：

```bash
npm run format:check
npm run lint
npm run typecheck
npm run build
docker compose up -d --build dreamstudio
docker compose ps
curl http://127.0.0.1:3001/healthz
curl http://127.0.0.1:3001/readyz
curl -I http://127.0.0.1:3000/
```

如果需要重建开发环境，可以在明确知道会清空本地数据后执行：

```bash
docker compose down -v
docker compose up -d --build dreamstudio
```

小白验证基础入口：

1. 打开 `http://localhost:3000/`。
2. 进入登录页。
3. 使用默认管理员账号登录：
   - 用户名：`Cherry`
   - 密码：`DreamStudio`
4. 进入 `/admin`，确认管理后台可以打开。
5. 进入 `/studio`，确认 Studio 页面可以打开。

如果页面打不开，先看服务状态：

```bash
docker compose ps
docker compose logs dreamstudio --tail=200
curl http://127.0.0.1:3001/healthz
curl http://127.0.0.1:3001/readyz
```

## 2. 阶段 0：开工前审计和任务确认

### 2.1 先查看资料

- `docs/README.md`
- `docs/04-dreamstudio-v1-data-model.md`
- `docs/05-dreamstudio-v1-api-contract.md`
- `docs/12-dreamstudio-m3-model-catalog-task-list.md`
- `docs/14-dreamstudio-m5-image-task-worker-task-list.md`
- `docs/15-dreamstudio-m6-admin-logs-task-list.md`
- `docs/16-dreamstudio-model-adapter-execution-profile-plan.md`
- `docs/17-dreamstudio-model-adapter-execution-profile-task-list.md`

### 2.2 再查看本地代码

- `packages/db/prisma/schema.prisma`
- `packages/db/prisma/migrations/`
- `scripts/init-m0.ts`
- `apps/api/src/modules/model-catalog/`
- `apps/api/src/modules/image-tasks/`
- `apps/worker/src/modules/image-generation/`
- `apps/web/src/lib/model-catalog.ts`
- `apps/web/src/lib/image-tasks.ts`
- `apps/web/src/app/studio/page.tsx`
- `apps/web/src/components/model-catalog/model-components.tsx`

### 2.3 修复计划

- 不修改业务逻辑。
- 确认 16 号文档已明确开发阶段边界。
- 确认 17 号文档已在 `docs/README.md` 中登记。
- 如果发现 16 号与 17 号冲突，先修文档再写代码。

### 2.4 验证操作

```bash
npx prettier --check docs/README.md docs/16-dreamstudio-model-adapter-execution-profile-plan.md docs/17-dreamstudio-model-adapter-execution-profile-task-list.md
git diff --check
```

### 2.5 达成效果

- 实施入口清晰。
- 文档索引不会漏掉 17 号任务清单。
- 后续执行者知道这是开发期重构，不需要迁就旧数据。

## 3. 阶段 1：数据模型重塑

### 3.1 先查看资料

- `docs/04-dreamstudio-v1-data-model.md`
- `docs/16-dreamstudio-model-adapter-execution-profile-plan.md` 的 `ExecutionProfile`、`ExecutionProfileRevision`、`任务快照升级`。
- Prisma 官方迁移命令只用于确认语法；实际以项目现有 migration 风格为准。

### 3.2 再查看本地代码

- `packages/db/prisma/schema.prisma`
- `packages/db/prisma/migrations/20260619020000_m3_model_catalog/migration.sql`
- `packages/db/prisma/migrations/20260619040000_m5_image_tasks_worker/migration.sql`
- `packages/db/prisma/migrations/20260620010000_fixed_model_types/migration.sql`
- `apps/api/src/modules/model-catalog/model-catalog.types.ts`
- `apps/api/src/modules/image-tasks/image-tasks.types.ts`

### 3.3 修复计划

- 新增枚举或字符串字段策略：
  - `ExecutionProfileOperation`: `text_to_image`、`image_to_image`、`image_edit`、`conversational_image`
  - `ExecutionProfileRevisionStatus`: `draft`、`active`、`archived`
  - `ExecutionProfileSourceKind`: `manual`、`openai_official`、`gemini_official`、`third_party_docs`、`imported_json`
- 新增 `AiModelExecutionProfile`。
- 新增 `AiModelExecutionProfileRevision`。
- 给 `ImageTask` 增加：
  - `executionProfileId`
  - `executionProfileRevisionId`
  - `adapterKeySnapshot`
  - `adapterVersionSnapshot`
  - `executionProfileSnapshot`
  - `requestMappingSnapshot`
  - `resolvedRequestSanitizedSnapshot`
- 给 `RequestLog` 增加：
  - `adapterKey`
  - `adapterVersion`
  - `executionProfileId`
  - `executionProfileRevisionId`
  - `resolvedRequestSanitized`
  - `upstreamResponseSummary`
  - `profileErrorHint`
- 开发阶段不写历史数据 backfill。
- 允许旧执行字段暂时留在 schema 中，但新链路不得依赖它们。

### 3.4 验证操作

```bash
npm run db:generate
npm run typecheck
```

如果需要验证全新数据库：

```bash
docker compose down -v
docker compose up -d --build dreamstudio
docker compose ps
curl http://127.0.0.1:3001/readyz
```

### 3.5 小白手动测试

1. 打开 `http://localhost:3000/`。
2. 使用 `Cherry` / `DreamStudio` 登录。
3. 打开 `/admin`。
4. 如果页面可以打开，说明基础数据库和会话链路仍可用。
5. 如果 `/readyz` 返回非 200，复制 `docker compose logs dreamstudio --tail=200` 结果给开发者排查。

### 3.6 达成效果

- Prisma Client 能生成。
- 新表和新字段存在。
- 新环境可启动。
- 旧数据是否存在不影响阶段通过。

### 3.7 实施记录（2026-06-21）

已完成：

- `packages/db/prisma/schema.prisma` 新增 `ExecutionProfileOperation`、`ExecutionProfileRevisionStatus`、`ExecutionProfileSourceKind`。
- 新增 `AiModelExecutionProfile` 和 `AiModelExecutionProfileRevision` Prisma model。
- `ImageTask` 新增 profile/revision 关系和 adapter、profile、mapping、resolved request 脱敏快照字段。
- `RequestLog` 新增 adapter、profile/revision、最终脱敏请求、上游响应摘要和 profile 错误提示字段。
- 新增迁移 `packages/db/prisma/migrations/20260621010000_execution_profiles/migration.sql`。
- 第一阶段新增字段先保持 nullable，便于在不提前改 Worker/API 执行链路的情况下独立通过编译和迁移验证。
- 旧 `AiModel` 执行字段暂时保留，后续阶段会逐步让新任务改读默认 active profile revision。

已验证：

```bash
npx prisma format --schema packages/db/prisma/schema.prisma
npm run db:generate
npm run typecheck
```

阶段 1 没有做：

- 没有修改初始化脚本。
- 没有新增默认 profile 数据。
- 没有把模型列表 API 改为返回 `default_execution_profile`。
- 没有把图片任务创建逻辑切到 active profile revision。
- 没有修改 Worker adapter 执行链路。

## 4. 阶段 2：初始化数据和默认 Profile

### 4.1 先查看资料

- `docs/12-dreamstudio-m3-model-catalog-task-list.md`
- `docs/16-dreamstudio-model-adapter-execution-profile-plan.md` 的 `官方和兼容模型的参数适配策略`。

### 4.2 再查看本地代码

- `scripts/init-m0.ts`
- `apps/api/src/modules/model-catalog/model-catalog.service.ts`
- `apps/api/src/modules/model-catalog/parameter-schema.ts`
- `scripts/verify-m3.ts`
- `scripts/verify-m5.ts`

### 4.3 修复计划

- 在初始化脚本中创建至少一个可用于开发验证的图片模型。
- 该模型必须有默认 `ExecutionProfile`。
- 默认 profile 必须有 active revision。
- active revision 使用 Schema v2。
- 默认 adapter 建议先使用 `openai_images_generation`。
- 不再只创建裸 `AiModel`。
- 新增验证脚本，例如 `scripts/verify-model-profiles.ts`：
  - 检查启用的 image model 都有默认 profile。
  - 检查默认 profile 有 active revision。
  - 检查 active revision 有 `adapter_key`、`parameter_schema`、`request_mapping`。

阶段 2 实施时按当前代码进一步收紧为：

- `scripts/init-m0.ts` 固定创建开发默认图片模型 `gpt-image-2`。
- 初始化脚本还会给当前启用、未删除、`modality=image` 且包含 `openai_image_generations` 端点的模型补齐默认 OpenAI Image generation profile。
- 补齐 profile 时 `upstream_model_id` 使用该模型自己的 `model_id`，不会把兼容模型错误转成 `gpt-image-2`。
- 补齐 profile 时会按 `provider_name` 选择来源标记：`provider_name=OpenAI` 的模型标记为 `openai_official`，其他兼容模型标记为 `third_party_docs` 并指向 new-api OpenAI Image 兼容文档，后续生产使用前必须替换为厂商文档。
- Gemini 或 edit-only 模型不能硬套 OpenAI generation profile，应在后续 Gemini/edit adapter 阶段单独创建 profile。
- Profile/revision 内保存 Schema v2 扩展字段；旧 `AiModel.parameter_schema` 暂时只保存当前 Studio/API 能识别的兼容字段。

### 4.4 验证操作

```bash
npm run db:generate
npm run db:init:m0
npx tsx scripts/verify-model-profiles.ts
npm run typecheck
```

如果本机 shell 没有加载 `.env`，需要显式带上数据库连接，例如：

```bash
DATABASE_URL="postgresql://dreamstudio:dreamstudio@localhost:5432/dreamstudio?schema=public" npm run db:init:m0
DATABASE_URL="postgresql://dreamstudio:dreamstudio@localhost:5432/dreamstudio?schema=public" npx tsx scripts/verify-model-profiles.ts
```

Docker 环境验证：

```bash
docker compose up -d --build dreamstudio
docker compose exec dreamstudio npm run db:init:m0
docker compose exec dreamstudio npx tsx scripts/verify-model-profiles.ts
```

### 4.5 小白手动测试

1. 打开 `http://localhost:3000/admin/models`。
2. 确认至少能看到一个图片模型。
3. 打开 `http://localhost:3000/studio`。
4. 确认模型列表不是空的，并且可以看到默认图片模型，例如 `GPT Image 2`。
5. 让开发者在终端运行：

```bash
DATABASE_URL="postgresql://dreamstudio:dreamstudio@localhost:5432/dreamstudio?schema=public" npx tsx scripts/verify-model-profiles.ts
```

6. 终端输出里应包含 `"ok":true`，并列出每个启用图片模型的：
   - 默认 profile
   - active revision
   - adapter key
   - 参数 schema

注意：阶段 2 尚未实现 Admin profile 管理 UI，所以 `/admin/models` 目前只要求确认模型可见；在页面里查看和编辑 profile 信息属于阶段 7。

### 4.6 达成效果

- 全新环境初始化后即可得到可执行模型配置。
- 启用的 OpenAI generation 图片模型都有默认 profile 和 active revision。
- 后续阶段具备让任务创建改读 active profile revision 的数据基础。
- 阶段 2 尚未让任务创建改读 profile，因此新任务仍可能依赖旧 `AiModel.parameterSchema`，该切换归阶段 4。

### 4.7 实施记录（2026-06-21）

已完成：

- `scripts/init-m0.ts` 创建开发默认图片模型 `gpt-image-2`，并写入默认 `OpenAI Image generation` profile。
- 默认 profile 使用 `openai_images_generation` adapter、`/v1/images/generations` 上游路径、`openai_image_data` 响应解析 key。
- 默认 active revision 记录 `source_kind=openai_official`、OpenAI Image Generation Guide 的 `source_url` 和 `source_checked_at=2026-06-21`。
- 默认 profile/revision 保存 Schema v2 参数字段：`n`、`size`、`quality`、`output_format`、`output_compression`、`background`、`moderation`。
- 初始化脚本会给现有启用 OpenAI generation 图片模型补齐默认 profile，`upstream_model_id` 保持各自模型 ID。
- `provider_name=OpenAI` 的模型补齐为 `openai_official` 来源；其他兼容模型补齐为 `third_party_docs` 来源，避免把 OpenAI-compatible 误标成 OpenAI 官方模型。
- 新增 `scripts/verify-model-profiles.ts`，检查启用图片模型的默认 profile、active revision、adapter key、parameter schema、request mapping 和 Schema v2 快捷 slot。

已验证：

```bash
npm run db:generate
DATABASE_URL="postgresql://dreamstudio:dreamstudio@localhost:5432/dreamstudio?schema=public" npm run db:init:m0
DATABASE_URL="postgresql://dreamstudio:dreamstudio@localhost:5432/dreamstudio?schema=public" npx tsx scripts/verify-model-profiles.ts
npx tsc --noEmit --skipLibCheck --moduleResolution node --module commonjs --target es2022 --types node scripts/init-m0.ts scripts/verify-model-profiles.ts
```

阶段 2 没有做：

- 没有把公共模型 API 改为返回 `default_execution_profile`。
- 没有让 Studio 改读 profile schema。
- 没有让图片任务创建逻辑写入 profile snapshot。
- 没有实现 adapter registry。
- 没有新增 Admin profile/revision 管理 UI。
- 没有修复 `scripts/verify-m3.ts`、`scripts/verify-m3-routes.ts`、`scripts/verify-m5.ts` 中历史分类接口和旧字段的验证逻辑；这些脚本与当前固定模型类型代码存在已知不一致，后续涉及 M3/M5 回归时应专项更新。

## 5. 阶段 3：模型 API 改为 Profile 来源

### 5.1 先查看资料

- `docs/05-dreamstudio-v1-api-contract.md`
- `docs/16-dreamstudio-model-adapter-execution-profile-plan.md` 的 `API 调整` 和 `前端调整`。

### 5.2 再查看本地代码

- `apps/api/src/modules/model-catalog/model-catalog.controller.ts`
- `apps/api/src/modules/model-catalog/model-catalog.service.ts`
- `apps/api/src/modules/model-catalog/model-catalog.types.ts`
- `apps/web/src/lib/model-catalog.ts`
- `apps/web/src/app/studio/page.tsx`
- `apps/web/src/app/admin/models/page.tsx`

### 5.3 修复计划

- 公共模型列表返回 `default_execution_profile`。
- `default_execution_profile` 包含：
  - `id`
  - `revision_id`
  - `operation`
  - `adapter_key`
  - `parameter_schema`
  - `default_params`
  - `capabilities`
- Studio 读取 profile 的 schema 和默认参数。
- 如果模型没有 active default profile，普通用户侧不展示为可提交模型，或显示为不可用。
- Admin 模型列表显示 profile 状态。

### 5.4 验证操作

新增或更新路由验证脚本，例如：

```bash
npx tsx scripts/verify-model-profile-api.ts
npx tsx scripts/verify-model-profile-api-routes.ts
npx tsx scripts/verify-model-profiles.ts
npm run typecheck
```

阶段 3 当前以 `scripts/verify-model-profile-api.ts` 校验模型 API profile contract，以 `scripts/verify-model-profile-api-routes.ts` 校验真实 API route response；旧 `scripts/verify-m3-routes.ts` 仍包含历史分类接口和旧字段假设，不作为本阶段完成证据。

### 5.5 小白手动测试

1. 打开 `http://localhost:3000/studio`。
2. 选择一个图片模型。
3. 确认能看到该模型的快捷参数。
4. 打开浏览器开发者工具的 Network。
5. 刷新页面，找到 `/api/v1/models` 请求。
6. 点开响应，确认模型对象里有 `default_execution_profile`。
7. 如果没有该字段，本阶段未完成。

### 5.6 达成效果

- 前端拿到的是 profile 级执行配置。
- 模型展示属性和执行属性开始分离。

### 5.7 实施记录（2026-06-21）

已完成：

- 公共模型列表和详情查询默认启用 profile 及其 active revision，并返回 `default_execution_profile`。
- `default_execution_profile` 使用 active revision 的 `adapter_key`、`adapter_version`、`reference_transfer_mode`、`supports_reference_image`、`max_reference_images`、`parameter_schema`、`default_params` 和 `capabilities`。
- 普通用户侧 image 模型没有默认 active profile 时不展示；详情访问这类 image 模型会返回不可用。
- `parameter-schema.ts` 支持保留 Schema v2 的 `ui`、`capability`、`send_policy`、`validation`、`help_url` 元数据，避免公共 profile schema 丢失快捷参数 slot。
- Studio 已改为从选中模型的默认 active profile 读取参数 schema、默认参数、参考图能力和最大参考图数量。
- Studio 快捷参数按 `ui.group=quick` 和 `ui.slot` 渲染；阶段 6 已移除旧字段名称猜测 fallback。
- Admin 模型列表显示默认执行 Profile 是否可用，并展示 adapter/operation 和 profile schema 字段数。
- 新增 `scripts/verify-model-profile-api.ts`，校验启用 image 模型的公共 profile API contract、active revision 身份字段、Schema v2 `ui.slot` 保留和 reference image capability。
- 新增 `scripts/verify-model-profile-api-routes.ts`，登录后校验真实 `/api/v1/models?modality=image` 和 `/api/v1/admin/models` 响应包含 profile 信息。

已验证：

```bash
npm run format:check
npm run lint
npm run typecheck
npm run build
npm run db:generate
DATABASE_URL="postgresql://dreamstudio:dreamstudio@localhost:5432/dreamstudio?schema=public" npm run db:init:m0
DATABASE_URL="postgresql://dreamstudio:dreamstudio@localhost:5432/dreamstudio?schema=public" npx tsx scripts/verify-model-profiles.ts
DATABASE_URL="postgresql://dreamstudio:dreamstudio@localhost:5432/dreamstudio?schema=public" npx tsx scripts/verify-model-profile-api.ts
docker compose up -d --build dreamstudio
docker compose ps
curl http://127.0.0.1:3001/healthz
curl http://127.0.0.1:3001/readyz
curl -I http://127.0.0.1:3000/
DATABASE_URL="postgresql://dreamstudio:dreamstudio@localhost:5432/dreamstudio?schema=public" npx tsx scripts/verify-model-profile-api-routes.ts
```

说明：本机 sandbox 环境中 `tsx` 创建 `/tmp/tsx-*/.pipe` 会触发 `EPERM`，且 sandboxed curl 无法访问 Docker 发布的 localhost 端口；上述 `tsx` verifier 和 localhost curl 已用同一命令在非 sandbox 环境通过。

阶段 3 没有做：

- 没有修改图片任务创建 API body。
- 没有在提交任务时写入 `execution_profile_id`。
- 没有让任务创建写入 profile/revision/adapter/request mapping snapshot。
- 没有实现 Worker adapter registry。
- 没有新增 Admin profile/revision 管理 UI。

下一阶段要先查看：

- `docs/14-dreamstudio-m5-image-task-worker-task-list.md`
- `docs/16-dreamstudio-model-adapter-execution-profile-plan.md` 的 `任务快照升级`
- 本文件阶段 4
- `apps/api/src/modules/image-tasks/image-tasks.controller.ts`
- `apps/api/src/modules/image-tasks/image-tasks.service.ts`
- `apps/api/src/modules/image-tasks/image-tasks.types.ts`
- `apps/api/src/modules/model-catalog/parameter-schema.ts`
- `apps/web/src/lib/image-tasks.ts`
- `apps/web/src/app/studio/page.tsx`

## 6. 阶段 4：任务创建写入 Profile Snapshot

### 6.1 先查看资料

- `docs/14-dreamstudio-m5-image-task-worker-task-list.md`
- `docs/16-dreamstudio-model-adapter-execution-profile-plan.md` 的 `任务快照升级`。

### 6.2 再查看本地代码

- `apps/api/src/modules/image-tasks/image-tasks.controller.ts`
- `apps/api/src/modules/image-tasks/image-tasks.service.ts`
- `apps/api/src/modules/image-tasks/image-tasks.types.ts`
- `apps/api/src/modules/model-catalog/parameter-schema.ts`
- `apps/web/src/lib/image-tasks.ts`
- `apps/web/src/app/studio/page.tsx`

### 6.3 修复计划

- `CreateImageTaskBody` 增加 `execution_profile_id`。
- 不传 `execution_profile_id` 时使用模型默认 profile。
- 创建任务时读取 active revision。
- 使用 active revision 的 `parameter_schema` 校验用户参数。
- 合并 `default_params` 和用户参数。
- 生成 `resolved_request_sanitized_snapshot`。
- 写入 `executionProfileId`、`executionProfileRevisionId`、`adapterKeySnapshot`、`adapterVersionSnapshot`、`executionProfileSnapshot`、`requestMappingSnapshot`。
- 没有 active profile 的模型直接拒绝提交。
- 重试任务默认沿用原任务 snapshot。

### 6.4 验证操作

新增验证脚本，例如 `scripts/verify-image-task-profile-snapshot.ts`：

```bash
npx tsx scripts/verify-image-task-profile-snapshot.ts
npm run typecheck
```

脚本应检查：

- 创建任务后 `image_tasks.execution_profile_id` 不为空。
- `execution_profile_revision_id` 不为空。
- `adapter_key_snapshot` 不为空。
- `execution_profile_snapshot` 包含当时的 active revision 内容。
- 修改 profile 后，旧任务 snapshot 不变化。
- 提交 schema 未声明参数会失败。

### 6.5 小白手动测试

1. 打开 `http://localhost:3000/studio`。
2. 选择一个有默认 profile 的图片模型。
3. 输入 Prompt，例如：`一只玻璃质感的蓝色小机器人，产品摄影风格`。
4. 选择张数、比例、分辨率。
5. 点击生成。
6. 打开 `http://localhost:3000/studio/tasks`。
7. 找到刚创建的任务。
8. 进入任务详情。
9. 确认任务详情显示：
   - 模型名称
   - 参数快照
   - profile 或 adapter 信息
10. 如果提交时报“模型没有可用执行配置”，说明该模型缺 active profile，需要回到阶段 2 或 3 修复。

### 6.6 达成效果

- 新任务不再依赖 `AiModel.parameterSchema`。
- 每个任务都记录创建时的执行规则。
- 后续 Worker 可以只读任务 snapshot。

### 6.7 实施记录（2026-06-21）

已完成：

- `CreateImageTaskBody` 增加 `execution_profile_id`；未传时使用模型默认启用 profile。
- 创建任务时读取默认或指定 profile 的 active revision，使用 revision 的 `parameter_schema` 校验用户参数。
- 创建任务时合并 active revision 的 `default_params` 和用户参数，再写入 `parameterSnapshot` 和 `sanitizedParameterSnapshot`。
- 参考图能力和数量从 active revision 的 `supportsReferenceImage`、`maxReferenceImages` 校验。
- 新任务写入 `executionProfileId`、`executionProfileRevisionId`、`adapterKeySnapshot`、`adapterVersionSnapshot`、`executionProfileSnapshot`、`requestMappingSnapshot`、`resolvedRequestSanitizedSnapshot`。
- 过渡期 `modelIdSnapshot` 使用 active revision 的 `upstream_model_id`，让阶段 5 前的旧 Worker OpenAI Image client 继续拿到上游模型 ID。
- 任务列表/详情响应返回 profile/revision/adapter 信息和 `resolved_request_sanitized_snapshot`。
- `/studio` 提交任务时带上选中模型默认 profile 的 `execution_profile_id`。
- `/studio/tasks/[task_id]` 显示执行配置、adapter、revision 和最终脱敏请求预览。
- Worker 旧路径写 `request_logs` 时同步保存 adapter/profile 和 resolved request snapshot 字段。
- 新增 `scripts/verify-image-task-profile-snapshot.ts`，验证任务 profile snapshot 非空、修改 revision 后旧任务 snapshot 不变、未声明参数会失败。

已验证：

```bash
npm run format:check
npm run lint
npm run typecheck
npm run build
npm run db:generate
DATABASE_URL="postgresql://dreamstudio:dreamstudio@localhost:5432/dreamstudio?schema=public" npm run db:init:m0
DATABASE_URL="postgresql://dreamstudio:dreamstudio@localhost:5432/dreamstudio?schema=public" npx tsx scripts/verify-model-profiles.ts
DATABASE_URL="postgresql://dreamstudio:dreamstudio@localhost:5432/dreamstudio?schema=public" REDIS_URL="redis://localhost:6379/0" DREAMSTUDIO_SECRET_KEY="local-development-secret-key-change-before-production" COOKIE_SECRET="local-development-cookie-secret-change-before-production" APP_BASE_URL="http://localhost:3000" npx tsx scripts/verify-image-task-profile-snapshot.ts
docker compose up -d --build dreamstudio
docker compose ps
curl http://127.0.0.1:3001/healthz
curl http://127.0.0.1:3001/readyz
curl -I http://127.0.0.1:3000/
```

说明：本机 sandbox 环境中 `tsx` 创建 `/tmp/tsx-*/.pipe` 会触发 `EPERM`，且 sandboxed curl 无法访问 Docker 发布的 localhost 端口；上述 `tsx` verifier 和 localhost curl 已用同一命令在非 sandbox 环境通过。

阶段 5 前尚未完成：

- 没有实现 Gemini adapter。
- 没有新增 Admin profile/revision 管理 UI。

下一阶段要先查看：

- `docs/16-dreamstudio-model-adapter-execution-profile-plan.md` 的 `Adapter Registry`
- 本文件阶段 5
- `apps/worker/src/modules/image-generation/image-generation.service.ts`
- `apps/worker/src/modules/image-generation/new-api-image.client.ts`
- `packages/storage/src/index.ts`
- `apps/api/src/modules/new-api-config/`

## 7. 阶段 5：Adapter Registry 和 OpenAI Image 基础闭环

### 7.1 先查看资料

- `docs/16-dreamstudio-model-adapter-execution-profile-plan.md` 的 `Adapter Registry`。
- new-api OpenAI Image docs: `https://github.com/QuantumNous/new-api-docs/blob/main/docs/en/api/openai-image.md`
- OpenAI Image Generation Guide。

### 7.2 再查看本地代码

- `apps/worker/src/modules/image-generation/image-generation.service.ts`
- `apps/worker/src/modules/image-generation/new-api-image.client.ts`
- `packages/storage/src/index.ts`
- `apps/api/src/modules/new-api-config/`

### 7.3 修复计划

- 新增 adapter registry。
- 实现 `openai_images_generation` adapter。
- 实现 `openai_images_edit` adapter。
- Worker 执行任务时只读取 task snapshot。
- 根据 `adapter_key_snapshot` 找 adapter。
- adapter 根据 request mapping 构造上游请求。
- 保留 `NewApiImageClient` 作为底层 HTTP 能力可以，但业务分支必须迁移到 adapter。
- 没有 profile snapshot 的任务直接失败并提示重新提交。

### 7.4 验证操作

新增 mock upstream 测试脚本，例如 `scripts/verify-image-adapters.ts`：

```bash
npx tsx scripts/verify-image-adapters.ts
npm run typecheck
```

脚本应验证：

- generation adapter 构造 `POST /v1/images/generations`。
- edit adapter 构造 `POST /v1/images/edits` multipart。
- `data[].url` 能解析。
- `data[].b64_json` 能解析。
- 不支持的 adapter key 会失败。
- 失败错误会归一化为 Worker failure。

### 7.5 小白手动测试

1. 先在 DreamStudio 配置有效 new-api 密钥。
2. 打开 `http://localhost:3000/settings/new-api`。
3. 填写 new-api base URL 和 API key。
4. 点击测试连接，确认状态有效。
5. 打开 `http://localhost:3000/studio`。
6. 选择 OpenAI Image 风格模型。
7. 输入 Prompt。
8. 点击生成。
9. 等待任务完成。
10. 在任务详情里确认结果图能显示和下载。

如果没有真实 new-api 环境，本阶段至少要通过 mock upstream 脚本。

### 7.6 达成效果

- Worker 执行路径进入 adapter registry。
- OpenAI Image generation/edit 仍能完成异步任务闭环。

### 7.7 已完成

- 已新增 `apps/worker/src/modules/image-generation/image-adapter.registry.ts`。
- Worker 执行任务时根据 `adapterKeySnapshot` 选择 adapter，并要求 `executionProfileSnapshot` 和 `requestMappingSnapshot` 存在；缺失时任务失败并提示重新提交。
- `openai_images_generation` adapter 通过 snapped `request_mapping` 构造 JSON 请求，默认只允许 `/v1/images/generations`。
- `openai_images_edit` adapter 通过 snapped `request_mapping` 构造 multipart 请求，默认只允许 `/v1/images/edits`，参考图字段支持 `image` 和 `image[]`。
- `NewApiImageClient` 保留为底层 HTTP 能力，提供 JSON/multipart 发送方法；业务分支已迁移到 adapter。
- 已新增 `scripts/verify-image-adapters.ts`，用 mock upstream 验证 generation/edit 请求构造、`data[].url`/`data[].b64_json` 解析、不支持 adapter key 和缺少 profile snapshot 的失败归一化。

## 8. 阶段 6：Parameter Schema v2 和 Studio 快捷参数

### 8.1 先查看资料

- `docs/16-dreamstudio-model-adapter-execution-profile-plan.md` 的 `Parameter Schema v2`。
- `docs/07-dreamstudio-v1-ui-design-system.md`
- `docs/12-dreamstudio-m3-model-catalog-task-list.md`

### 8.2 再查看本地代码

- `apps/api/src/modules/model-catalog/parameter-schema.ts`
- `apps/web/src/lib/model-catalog.ts`
- `apps/web/src/components/model-catalog/model-components.tsx`
- `apps/web/src/app/studio/page.tsx`
- `apps/web/src/app/globals.css`

### 8.3 修复计划

- 后端支持 Schema v2 字段：
  - `ui`
  - `capability`
  - `send_policy`
  - `validation`
  - `help_url`
  - `deprecated`
- 前端类型同步。
- Studio 快捷参数只根据 `ui.group=quick` 和 `ui.slot` 渲染。
- 支持 `count`、`aspect_ratio`、`resolution`、`quality`、`format` 等 slot。
- 管理后台 schema builder 支持编辑 v2 字段。
- 初始化数据使用 Schema v2。

### 8.4 验证操作

```bash
npx tsx scripts/verify-model-profiles.ts
npm run typecheck
npm run build
```

如新增专门脚本：

```bash
npx tsx scripts/verify-parameter-schema-v2.ts
```

脚本应验证：

- `ui.group=quick` 字段能被识别。
- `ui.slot=count/aspect_ratio/resolution` 存在。
- 未声明参数被拒绝。
- `send_policy=never` 不会进入最终 request。

### 8.5 小白手动测试

1. 打开 `http://localhost:3000/admin/models`。
2. 编辑一个模型的执行配置。
3. 找到参数 Schema。
4. 确认可以设置：
   - 张数：`ui.slot=count`
   - 比例：`ui.slot=aspect_ratio`
   - 分辨率：`ui.slot=resolution`
5. 保存。
6. 打开 `http://localhost:3000/studio`。
7. 选择该模型。
8. 确认底部输入区能看到张数、比例、分辨率。
9. 修改这些参数后提交任务。
10. 任务详情里应看到参数快照和提交时一致。

### 8.6 达成效果

- Studio 不再通过 key 或 label 猜测快捷参数。
- 不同模型可以显示不同的参数子集。
- `send_policy=never` 可用于内部/隐藏字段，但不会进入最终任务参数快照或上游 request。

### 8.7 已完成

- 后端 `parameter-schema.ts` 已保留并校验 `ui`、`capability`、`send_policy`、`validation`、`help_url`、`deprecated`。
- `ui.group`、`ui.slot`、`send_policy` 已限制为白名单值。
- Studio 快捷参数只读取 `ui.group=quick` 和 `ui.slot=count/aspect_ratio/resolution`。
- Admin 模型 schema builder 支持编辑 `ui.group`、`ui.slot`、`ui.order`、`capability`、`send_policy`、`help_url`、`validation`、`deprecated`。
- Admin Studio 快捷参数卡片会写入 Schema v2 quick slot，不再依赖 key/label 猜测。
- 任务创建会从最终参数快照和脱敏 request 预览中剔除 `send_policy=never` 字段。
- 已新增 `scripts/verify-parameter-schema-v2.ts`，验证 quick slot、`deprecated`、非法枚举拒绝、未声明参数拒绝和 `send_policy=never` 剔除。

## 9. 阶段 7：Admin Profile 和 Revision 管理

### 9.1 先查看资料

- `docs/15-dreamstudio-m6-admin-logs-task-list.md`
- `docs/16-dreamstudio-model-adapter-execution-profile-plan.md` 的 `API 调整` 和 `前端调整`。

### 9.2 再查看本地代码

- `apps/api/src/modules/model-catalog/model-catalog.controller.ts`
- `apps/api/src/modules/model-catalog/model-catalog.service.ts`
- `apps/web/src/app/admin/models/page.tsx`
- `apps/web/src/components/model-catalog/model-components.tsx`
- `apps/web/src/lib/model-catalog.ts`

### 9.3 修复计划

- 增加 admin profile 列表。
- 增加 profile 创建、编辑、启用、禁用。
- 增加 revision 列表。
- 增加 draft revision 编辑。
- 增加 lint 按钮。
- 增加 preview request 按钮。
- 增加 test 按钮。
- 增加 activate 按钮。
- 确保同一 profile 只能有一个 active revision。

### 9.4 验证操作

```bash
npx tsx scripts/verify-m3-routes.ts
npx tsx scripts/verify-m6-routes.ts
npm run typecheck
npm run build
```

新增 API 验证脚本时，应检查：

- 普通用户不能访问 admin profile API。
- super_admin 能创建 draft revision。
- draft 不能被普通任务使用。
- activate 后旧 active revision 被 archived。

### 9.5 小白手动测试

1. 登录管理员账号。
2. 打开 `http://localhost:3000/admin/models`。
3. 选择一个图片模型。
4. 打开“执行配置”区域。
5. 新建一个 draft revision。
6. 修改一个参数选项，例如新增一个比例。
7. 点击 lint。
8. 点击预览请求。
9. 确认能看到脱敏后的上游请求。
10. 点击发布。
11. 回到 Studio。
12. 确认新参数选项出现在该模型上。

### 9.6 达成效果

- 管理员可以用 UI 管理 profile/revision。
- 参数变更不需要改代码。
- 草稿不会影响用户侧，发布后才生效。

### 9.7 已完成

- 已新增 Admin execution profile/revision API：
  - `GET/POST /api/v1/admin/models/:model_id/execution-profiles`
  - `GET/PATCH/DELETE /api/v1/admin/execution-profiles/:profile_id`
  - `GET/POST /api/v1/admin/execution-profiles/:profile_id/revisions`
  - `PATCH /api/v1/admin/execution-profile-revisions/:revision_id`
  - `POST /api/v1/admin/execution-profile-revisions/:revision_id/lint`
  - `POST /api/v1/admin/execution-profile-revisions/:revision_id/preview-request`
  - `POST /api/v1/admin/execution-profile-revisions/:revision_id/test`
  - `POST /api/v1/admin/execution-profile-revisions/:revision_id/activate`
- 所有 Admin profile/revision API 使用 `SessionAuthGuard` + `SuperAdminGuard`；写操作使用 CSRF。
- Draft revision 可编辑，active/archived revision 不可编辑。
- Activate 会在事务中归档同 profile 旧 active revision，并同步 active revision 配置到 profile 表。
- `/admin/models` 编辑模型时显示执行配置面板，可查看 profile/revision、编辑 draft、lint、预览、dry-run test、发布。
- 已新增 `scripts/verify-execution-profile-admin.ts`，验证普通用户 guard 拒绝、super_admin 创建 draft、draft 不影响 active、lint、preview、test 和 activate 归档旧 active。

## 10. 阶段 8：Request Mapping、Preview 和排障日志

### 10.1 先查看资料

- `docs/16-dreamstudio-model-adapter-execution-profile-plan.md` 的 `Request Mapping` 和 `Request Log 和排障`。
- OpenAI Image API 和 Gemini Generate Content API。

### 10.2 再查看本地代码

- `apps/worker/src/modules/image-generation/`
- `apps/api/src/modules/admin/admin.service.ts`
- `apps/web/src/app/admin/request-logs/`
- `apps/web/src/lib/admin.ts`

### 10.3 修复计划

- 已实现 mapping compiler：`packages/config/src/request-mapping.compiler.ts`。
- 已支持：
  - `fields`
  - `constants`
  - `omit_if_null`
  - `reference_field`
  - 白名单 transforms
- preview request 已复用 mapping compiler。
- RequestLog 已写入：
  - adapter key
  - adapter version
  - profile revision id
  - sanitized request
  - upstream response summary
  - profile error hint
- Admin request log 页面已显示这些信息。
- 已新增 `scripts/verify-request-mapping.ts`。

### 10.4 验证操作

```bash
npx tsx scripts/verify-request-mapping.ts
npx tsx scripts/verify-m6-routes.ts
npm run typecheck
npm run build
```

脚本应验证：

- OpenAI JSON mapping 正确。
- OpenAI multipart mapping 正确。
- Gemini nested mapping 正确。
- 未知 transform 被拒绝。
- 非 adapter allowed target 被拒绝。
- preview request 不包含 API key、完整 prompt 密文、用户敏感信息。

### 10.5 小白手动测试

1. 打开 `http://localhost:3000/admin/models`。
2. 进入某模型执行配置。
3. 点击“预览请求”。
4. 确认显示的请求里有：
   - endpoint
   - method
   - sanitized body
   - adapter key
5. 提交一个会失败的任务，例如使用错误的 profile 参数。
6. 打开 `http://localhost:3000/admin/request-logs`。
7. 找到失败记录。
8. 打开详情。
9. 确认能看到 profile error hint。

### 10.6 达成效果

- 管理员能在请求发出前看到最终 payload。
- 上游 400 更容易定位为 profile 配置问题。
- 已完成：Worker、Admin lint 和 Admin preview 共用同一个 request mapping compiler，Admin request log 列表和详情可查看 adapter/profile、脱敏最终请求、上游响应摘要和 profile error hint。

## 11. 阶段 9：OpenAI 官方模板和 OpenAI-compatible 模板

### 11.1 先查看资料

- OpenAI Image Generation Guide。
- OpenAI Create Image API Reference。
- OpenAI Image Edit API Reference。
- OpenAI Responses API Reference。
- new-api OpenAI Image docs。
- 目标第三方渠道文档。

### 11.2 再查看本地代码

- Admin profile/revision API。
- Admin profile/revision UI。
- `scripts/init-m0.ts`
- 新增模板目录时查看项目现有目录命名风格。

### 11.3 修复计划

- 新增 OpenAI 官方 profile 模板。
- 模板必须包含：
  - `source_kind`
  - `source_url`
  - `source_checked_at`
  - `source_summary`
  - `adapter_key`
  - `parameter_schema`
  - `request_mapping`
- 模板导入只创建 draft revision。
- 支持 diff 和 preview。
- 支持复制 OpenAI 模板为 OpenAI-compatible 草稿。
- OpenAI-compatible 草稿默认提示管理员删掉未确认支持的字段。

### 11.4 验证操作

```bash
npx tsx scripts/verify-profile-templates.ts
npm run typecheck
npm run build
```

脚本应验证：

- 模板 JSON 可解析。
- 模板导入后 active revision 不变化。
- 发布后 public model profile 才变化。
- OpenAI-compatible 模板不会默认声明 OpenAI 全量参数。

### 11.5 小白手动测试

1. 打开 `http://localhost:3000/admin/models`。
2. 进入一个模型的执行配置。
3. 点击“从模板导入”。
4. 选择 OpenAI Image generation 模板。
5. 确认生成的是 draft。
6. 点击 diff。
7. 点击预览请求。
8. 点击发布。
9. 回到 Studio。
10. 确认参数选项更新。

### 11.6 达成效果

- OpenAI 官方参数更新变成模板导入和发布流程。
- OpenAI-compatible 不再误用 OpenAI 全量参数。

### 11.7 已完成

已完成：

- 新增 `profile-templates/` 内置模板目录。
- 已建立 OpenAI Image generation `gpt-image-2` 官方模板。
- 已建立 OpenAI Image edit `gpt-image-2` 官方模板。
- 已建立 OpenAI Responses `image_generation` tool 官方模板；该模板当前只用于生成 draft profile，Worker runtime adapter 仍待后续阶段接入。
- 已建立 OpenAI-compatible 最小文生图模板，默认只声明 `n`、`size` 和 `response_format`，不声明 OpenAI 官方全量参数。
- 模板均记录 `source_kind`、`source_url`、`source_checked_at` 和 `source_summary`。
- 新增 `GET /api/v1/admin/profile-templates`，用于 Admin 获取可导入模板列表。
- 新增 `POST /api/v1/admin/execution-profiles/{profile_id}/revisions/import-template/{template_id}`，导入模板只创建 draft revision。
- 新增 `GET /api/v1/admin/execution-profile-revisions/{revision_id}/diff`，比较目标 revision 和同 profile 当前 active revision。
- Admin 执行配置 UI 已支持选择模板、导入 draft、复制 OpenAI 官方模板为 OpenAI-compatible 草稿、显示兼容警告、导入后选中 draft、查看 diff、继续预览、测试和发布。
- 复制 OpenAI 官方模板为 OpenAI-compatible 草稿时，会把 `source_kind` 改为 `third_party_docs`，写入 `requires_provider_field_review`，并提示管理员删除未确认支持的字段。
- request mapping lint 已为 `openai_responses_image` 限制目标路径为 `/v1/responses`，避免 Responses 模板绕过 endpoint target 校验。
- 新增 `scripts/verify-profile-templates.ts`，验证模板列表、官方来源信息、导入 draft 不影响 public profile、preview、diff、OpenAI-compatible copy 警告、最小 compatible 模板字段边界和 activate 后 public profile 才变化。

已验证：

```bash
npx prettier --check apps/api/src/modules/model-catalog/profile-template.registry.ts apps/api/src/modules/model-catalog/model-catalog.service.ts scripts/verify-profile-templates.ts apps/web/src/components/model-catalog/model-components.tsx apps/web/src/lib/model-catalog.ts profile-templates/*.json
npx tsc -p apps/api/tsconfig.json --noEmit
npm run typecheck -w @dreamstudio/web
```

阶段 9 没有做：

- `openai_responses_image` Worker runtime adapter 已实现，并可由默认 active profile 驱动 Studio 提交。
- 没有接入 Gemini 原生 adapter。
- 没有让模板导入自动发布 active revision。
- 没有把 OpenAI 官方全量字段默认套用到 OpenAI-compatible 第三方模型。

## 12. 阶段 10：Gemini Adapter

### 12.1 先查看资料

- Gemini Image Generation Guide。
- Gemini Generate Content API。
- new-api 当前是否支持 Gemini 原生路径。
- `docs/16-dreamstudio-model-adapter-execution-profile-plan.md` 的 `Gemini 官方模型`。

### 12.2 再查看本地代码

- Adapter registry。
- Mapping compiler。
- Worker image-generation service。
- Storage result image 保存逻辑。
- new-api config transport 逻辑。

### 12.3 修复计划

- 实现 `gemini_generate_content` adapter。
- 构造 `contents.parts`。
- 支持 prompt 文本。
- 支持参考图映射。
- 支持 `generationConfig.responseModalities`。
- 支持 `generationConfig.responseFormat.image.aspectRatio`。
- 支持 `generationConfig.responseFormat.image.imageSize`。
- 解析 Gemini 响应中的 `inlineData`。
- 如果 new-api 不支持 Gemini 原生路径，用户侧禁用 Gemini profile。
- 不在本阶段新增 direct Gemini key 管理。

### 12.4 验证操作

```bash
npx tsx scripts/verify-gemini-adapter.ts
npm run typecheck
npm run build
```

脚本应验证：

- Gemini text prompt 能映射为 `contents[0].parts[]`。
- `responseModalities` 正确进入请求。
- `aspect_ratio` 和 `image_size` 正确进入 nested target。
- mock `inlineData` 图片能解析为 result image。
- transport 不支持时，该 profile 不会在 Studio 作为可提交模型出现。

### 12.5 小白手动测试

如果当前环境没有 Gemini 可用网关：

1. 打开 `http://localhost:3000/admin/models`。
2. 找到 Gemini profile。
3. 确认它显示为禁用或不可用。
4. 打开 Studio。
5. 确认普通用户不能提交该 Gemini profile。

如果当前环境有 Gemini 可用网关：

1. 配置支持 Gemini 的 new-api base URL 和 API key。
2. 打开 Studio。
3. 选择 Gemini 图片模型。
4. 输入 Prompt。
5. 提交任务。
6. 等待结果图出现。
7. 打开任务详情，确认 adapter key 是 `gemini_generate_content`。

### 12.6 达成效果

- 系统架构支持 Gemini 原生图片请求形状。
- 不破坏当前 v1 用户自带 new-api key 的产品边界。

### 12.7 已完成

已完成：

- 新增 Worker `gemini_generate_content` adapter，目标路径限制为 `/v1beta/models/{model}:generateContent`，并按任务快照中的 `upstream_endpoint_path` 调用 new-api。
- Gemini adapter 复用共享 request mapping compiler，构造 `contents[0].parts[0].text`、`generationConfig.responseModalities`、`generationConfig.responseFormat.image.aspectRatio` 和 `generationConfig.responseFormat.image.imageSize`。
- 参考图会追加为 Gemini `inlineData` parts，字段包含 base64 `data` 和 `mimeType`。
- `NewApiImageClient` 新增 `gemini_inline_data` response parser，解析 `candidates[].content.parts[].inlineData.data` 为现有 `b64_json` result image 形态。
- API 侧允许 `gemini_generate_content` active revision 解析为 image task endpoint type，并在脱敏请求快照中使用 Gemini 默认路径。
- Admin lint/preview 的 adapter target allowlist 已支持 `{model}` 占位路径，避免固定模板路径误拦截。
- 新增 Gemini 官方 profile template `profile-templates/gemini-generate-content-image.json`，记录 Gemini 官方来源、`responseModalities`、`responseFormat.image.*`、`gemini_inline_data` parser 和 gateway support warning。
- `scripts/init-m0.ts` 新增开发用 Gemini `generateContent` 非默认 profile 和 active revision；默认保持 disabled，直到管理员确认配置的 new-api 网关支持原生 Gemini 路径后再启用。
- `scripts/verify-gemini-adapter.ts` 使用 mock HTTP gateway 验证 Gemini 请求 JSON、参考图 inlineData 映射、`inlineData` 解析、unsupported adapter 错误归一化，以及默认环境下 Gemini profile 不作为用户侧可提交默认 profile。
- `scripts/verify-profile-templates.ts` 已覆盖 Gemini 模板存在性、`gemini_official` 来源和 `gemini_generate_content` adapter。

已验证：

```bash
npx tsc -p apps/api/tsconfig.json --noEmit
npx tsc -p apps/worker/tsconfig.json --noEmit
npm run typecheck -w @dreamstudio/web
npm run format:check
npm run lint
npm run typecheck
npm run build
npm run db:generate
VERIFY_ENV="DATABASE_URL=postgresql://dreamstudio:dreamstudio@127.0.0.1:5432/dreamstudio REDIS_URL=redis://127.0.0.1:6379/0 DREAMSTUDIO_SECRET_KEY=local-verification-secret-key-32chars COOKIE_SECRET=local-cookie-secret-key-32chars APP_BASE_URL=http://127.0.0.1:3000"
DATABASE_URL=postgresql://dreamstudio:dreamstudio@127.0.0.1:5432/dreamstudio npm run db:init:m0
env $VERIFY_ENV npx tsx scripts/verify-gemini-adapter.ts
env $VERIFY_ENV npx tsx scripts/verify-model-profiles.ts
env $VERIFY_ENV npx tsx scripts/verify-model-profile-api.ts
env $VERIFY_ENV npx tsx scripts/verify-image-adapters.ts
env $VERIFY_ENV npx tsx scripts/verify-request-mapping.ts
env $VERIFY_ENV npx tsx scripts/verify-parameter-schema-v2.ts
env $VERIFY_ENV npx tsx scripts/verify-image-task-profile-snapshot.ts
env $VERIFY_ENV npx tsx scripts/verify-execution-profile-admin.ts
DATABASE_URL=postgresql://dreamstudio:dreamstudio@127.0.0.1:5432/dreamstudio npm run db:init:m0
env $VERIFY_ENV npx tsx scripts/verify-profile-templates.ts
DATABASE_URL=postgresql://dreamstudio:dreamstudio@127.0.0.1:5432/dreamstudio npm run db:init:m0
docker compose up -d --build dreamstudio
docker compose ps
curl http://127.0.0.1:3001/healthz
curl http://127.0.0.1:3001/readyz
curl -I http://127.0.0.1:3000/
```

阶段 10 没有做：

- 没有实现 `openai_responses_image` Worker runtime adapter。
- 没有新增 direct Gemini key 管理；v1 继续使用用户配置的 new-api bearer transport。
- 没有把 Gemini profile 自动设为默认或自动暴露给普通用户提交。
- 没有完成最终 API/数据模型/Worker/模型接入指南同步；这属于阶段 11。

## 13. 阶段 11：最终文档、验收和发布

### 13.1 先查看资料

- `docs/README.md`
- `docs/04-dreamstudio-v1-data-model.md`
- `docs/05-dreamstudio-v1-api-contract.md`
- `docs/12-dreamstudio-m3-model-catalog-task-list.md`
- `docs/14-dreamstudio-m5-image-task-worker-task-list.md`
- `docs/15-dreamstudio-m6-admin-logs-task-list.md`
- `docs/16-dreamstudio-model-adapter-execution-profile-plan.md`
- 本文档。

### 13.2 再查看本地代码

- 所有本轮 touched files。
- Prisma schema 和 migrations。
- API modules。
- Worker modules。
- Web admin models 页面。
- Studio 页面。
- 验证脚本。

### 13.3 修复计划

- 更新数据模型文档。
- 更新 API 契约文档。
- 更新模型目录任务文档。
- 更新图片任务 Worker 文档。
- 更新管理后台和日志文档。
- 新增或更新模型接入指南。
- 确认 `docs/README.md` 索引完整。
- 清理过期或冲突描述。

### 13.4 验证操作

```bash
npm run format:check
npm run lint
npm run typecheck
npm run build
npm run db:generate
npx tsx scripts/verify-model-profiles.ts
npx tsx scripts/verify-image-task-profile-snapshot.ts
npx tsx scripts/verify-image-adapters.ts
npx tsx scripts/verify-request-mapping.ts
docker compose up -d --build dreamstudio
docker compose ps
curl http://127.0.0.1:3001/healthz
curl http://127.0.0.1:3001/readyz
curl -I http://127.0.0.1:3000/
```

如果某个验证脚本尚未在对应阶段创建，不允许假装通过；要么补脚本，要么在最终报告里明确说明还缺哪个脚本。

### 13.5 小白完整验收流程

1. 打开 `http://localhost:3000/`。
2. 使用 `Cherry` / `DreamStudio` 登录。
3. 打开 `http://localhost:3000/settings/new-api`。
4. 配置 new-api base URL 和 API key。
5. 点击测试连接，确认成功。
6. 打开 `http://localhost:3000/admin/models`。
7. 找到一个图片模型。
8. 打开执行配置。
9. 确认存在默认 profile 和 active revision。
10. 点击预览请求，确认能看到脱敏 payload。
11. 打开 `http://localhost:3000/studio`。
12. 选择该模型。
13. 确认张数、比例、分辨率来自 profile。
14. 输入 Prompt。
15. 点击生成。
16. 打开 `http://localhost:3000/studio/tasks`。
17. 等待任务成功。
18. 打开任务详情。
19. 确认结果图可见。
20. 确认任务详情显示参数快照和 profile/adapter 信息。
21. 打开 `http://localhost:3000/admin/request-logs`。
22. 打开对应请求日志。
23. 确认能看到 adapter、profile revision、脱敏请求。

### 13.6 达成效果

- OpenAI 官方模型、OpenAI-compatible 模型、Gemini 官方模型都能通过统一 profile/adapter 架构接入。
- 参数差异由 profile/revision 管理。
- 新任务都有执行快照。
- 管理员能预览、测试、发布、排障。
- 普通用户只看到当前模型明确支持的参数。

### 13.7 已完成

已完成：

- `docs/04-dreamstudio-v1-data-model.md` 已同步 profile/revision、任务快照、Gemini disabled profile 和 JSON draft 导入规则。
- `docs/05-dreamstudio-v1-api-contract.md` 已同步 Admin execution profile/revision API、模板导入、Revision JSON 导入导出、Gemini `generateContent` 请求和 `inlineData` 解析。
- `docs/12-dreamstudio-m3-model-catalog-task-list.md` 已补充 execution profile 管理接口和普通用户侧默认 active profile 规则。
- `docs/14-dreamstudio-m5-image-task-worker-task-list.md` 已补充 adapter registry 当前支持的 OpenAI generation/edit 和 Gemini runtime 行为。
- `docs/15-dreamstudio-m6-admin-logs-task-list.md` 已补充 profile/revision 管理、request log profile 排障字段和审计要求。
- 新增 `docs/18-dreamstudio-model-onboarding-guide.md`，覆盖 OpenAI 官方、OpenAI-compatible、Gemini 官方模型接入流程，Revision JSON 导入导出和新增协议开发边界。
- `docs/README.md` 已登记 18 号模型接入指南。
- Admin 模型详情执行配置区域已支持导出当前 revision JSON，并把粘贴的 revision JSON 导入为新的 draft revision。
- `scripts/verify-execution-profile-admin.ts` 已验证 JSON 导入只创建 draft revision，不影响 active revision。

已验证：

```bash
npm run format:check
npm run lint
npm run typecheck
npm run build
npm run db:generate
VERIFY_ENV="DATABASE_URL=postgresql://dreamstudio:dreamstudio@127.0.0.1:5432/dreamstudio REDIS_URL=redis://127.0.0.1:6379/0 DREAMSTUDIO_SECRET_KEY=local-verification-secret-key-32chars COOKIE_SECRET=local-cookie-secret-key-32chars APP_BASE_URL=http://127.0.0.1:3000"
DATABASE_URL=postgresql://dreamstudio:dreamstudio@127.0.0.1:5432/dreamstudio npm run db:init:m0
env $VERIFY_ENV npx tsx scripts/verify-model-profiles.ts
env $VERIFY_ENV npx tsx scripts/verify-model-profile-api.ts
env $VERIFY_ENV npx tsx scripts/verify-image-adapters.ts
env $VERIFY_ENV npx tsx scripts/verify-gemini-adapter.ts
env $VERIFY_ENV npx tsx scripts/verify-request-mapping.ts
env $VERIFY_ENV npx tsx scripts/verify-parameter-schema-v2.ts
env $VERIFY_ENV npx tsx scripts/verify-image-task-profile-snapshot.ts
env $VERIFY_ENV npx tsx scripts/verify-execution-profile-admin.ts
DATABASE_URL=postgresql://dreamstudio:dreamstudio@127.0.0.1:5432/dreamstudio npm run db:init:m0
env $VERIFY_ENV npx tsx scripts/verify-profile-templates.ts
DATABASE_URL=postgresql://dreamstudio:dreamstudio@127.0.0.1:5432/dreamstudio npm run db:init:m0
docker compose up -d --build dreamstudio
docker compose ps
curl http://127.0.0.1:3001/healthz
curl http://127.0.0.1:3001/readyz
curl -I http://127.0.0.1:3000/
```

阶段 11 没有做：

- 没有新增 direct OpenAI/Gemini 官方密钥管理；v1 继续使用用户配置的 new-api bearer transport。
- 没有做最终人工产品审阅；按用户要求，最终审阅由用户执行。

## 14. 阶段 12：Adapter Manifest、Responses Runtime 和官方参数补齐

### 14.1 先查看资料

- OpenAI Image Generation Guide。
- OpenAI Create Image API Reference。
- OpenAI Image Edit API Reference。
- OpenAI Responses API Reference。
- Gemini Image Generation Guide。
- Gemini Generate Content API。
- `docs/16-dreamstudio-model-adapter-execution-profile-plan.md` 的 adapter、template 和发布边界。

### 14.2 再查看本地代码

- `packages/config/src/request-mapping.compiler.ts`
- `packages/config/src/image-adapter-manifest.ts`
- `apps/api/src/modules/model-catalog/`
- `apps/worker/src/modules/image-generation/`
- `apps/web/src/components/model-catalog/model-components.tsx`
- `profile-templates/*.json`
- `scripts/verify-adapter-manifest.ts`
- `scripts/verify-image-adapters.ts`
- `scripts/verify-profile-templates.ts`

### 14.3 修复计划

- 新增共享 adapter manifest，集中声明 runtime support、publishable、allowed target path 和 response parser key。
- API lint、Admin preview、模板 summary 和 Worker adapter registry 共用 manifest，不再各自维护 adapter allowlist。
- 实现 `openai_responses_image` Worker runtime adapter。
- 支持 Responses `prompt -> input` 映射、参考图 `input_image` 追加和 `image_generation_call` 图片结果解析。
- 补齐 OpenAI Image generation/edit/Responses 官方模板字段和跨字段校验。
- Gemini Interactions 图片模板已升级为可运行/可发布官方主线，面向 `gemini-3-pro-image-preview` 及后续新官方模型。
- OpenAI-compatible copy 必须清空未确认官方默认参数，字段保持 `suspect` 并阻断 lint/发布。
- Admin 模板导入和 preview 显示 runtime/publish 状态、parser key 和 publish blockers。

### 14.4 验证操作

```bash
npm run typecheck -w @dreamstudio/api
npm run typecheck -w @dreamstudio/worker
npm run typecheck -w @dreamstudio/web
npm run build -w @dreamstudio/config
npx tsx scripts/verify-adapter-manifest.ts
npx tsx scripts/verify-image-adapters.ts
npx tsx scripts/verify-profile-templates.ts
npm run format:check
npm run lint
npm run typecheck
npm run build
docker compose up -d --build dreamstudio
docker compose ps
curl http://127.0.0.1:3001/healthz
curl http://127.0.0.1:3001/readyz
curl -I http://127.0.0.1:3000/
```

### 14.5 小白手动测试

1. 打开 `http://localhost:3000/admin/models`。
2. 进入任意图片模型执行配置。
3. 点击从模板导入。
4. 确认 OpenAI Responses image tool 显示 runtime supported/publishable。
5. 确认 Gemini Interactions image 显示 runtime unsupported/blocked。
6. 导入 OpenAI Responses image tool 为 draft。
7. 点击预览请求，确认 endpoint 是 `/v1/responses`，body 包含 `input` 和 `tools[0].type=image_generation`。
8. 复制 OpenAI 官方模板为 OpenAI-compatible 草稿。
9. 点击 lint，确认未确认字段会阻断发布；删除或确认字段后再发布。

### 14.6 达成效果

- Adapter 是否可运行、可发布、可用 parser 和允许路径有单一声明源。
- Responses image tool 不再只是模板，Worker 可按任务快照执行。
- Gemini Interactions 官方模板可以先作为草稿参考存在，但不会误发布到用户侧。
- OpenAI-compatible copy 不会把 OpenAI 官方全量字段带着默认值误发布。

### 14.7 已完成

已完成：

- 新增 `packages/config/src/image-adapter-manifest.ts`，声明 `openai_images_generation`、`openai_images_edit`、`openai_responses_image`、`gemini_generate_content` 和 `gemini_interactions_image`。
- API lint、Admin preview 和 Worker adapter registry 已改为读取 manifest，未知 adapter、runtime unsupported、publishable false 和 parser key 不匹配都会阻断发布。
- `openai_responses_image` Worker adapter 已支持 `/v1/responses` JSON 请求、Responses `input` 结构、参考图 `input_image` 和 `image_generation_call` parser。
- Request mapping compiler 新增 `promptToResponsesInput` 和 GPT Image 2 size 校验 transform。
- Parameter schema 校验新增 `openai_output_compression_requires_jpeg_or_webp`、`openai_partial_images_requires_stream` 和 `compatible_field_confirmed`。
- OpenAI generation/edit/Responses 模板已补齐本轮官方参数、跨字段校验和来源检查时间。
- 新增 `profile-templates/gemini-interactions-image.json`，作为 Gemini 新官方图片模型主模板。
- Admin 模板列表和 request preview 显示 runtime/publish 状态、parser 和 publish blockers；test 文案改为 dry-run。
- `scripts/verify-adapter-manifest.ts` 已验证 manifest 声明；`scripts/verify-image-adapters.ts` 已覆盖 Responses runtime；`scripts/verify-profile-templates.ts` 已覆盖 Gemini Interactions draft-only、Responses publishable 和 compatible copy 阻断。

## 15. 建议提交顺序

建议每个阶段至少一个 commit：

1. `docs: add model adapter execution checklist`
2. `feat(db): add execution profiles`
3. `feat(seed): initialize model execution profiles`
4. `feat(api): expose default execution profiles`
5. `feat(tasks): snapshot execution profiles`
6. `feat(worker): add image adapter registry`
7. `feat(schema): support parameter schema v2`
8. `feat(admin): manage execution profile revisions`
9. `feat(logs): record adapter request snapshots`
10. `feat(templates): add official image profile templates`
11. `feat(worker): add gemini image adapter`
12. `docs: finalize model adapter implementation guide`
13. `feat(adapters): support responses image profiles`

每次提交前至少运行：

```bash
git diff --check
npm run format:check
npm run typecheck
```

涉及运行时代码时还需要：

```bash
npm run lint
npm run build
docker compose up -d --build dreamstudio
```

## 16. 当前下一步

阶段 12 已完成。后续如继续扩展，建议按独立阶段处理：

1. 增加 direct OpenAI/Gemini 官方密钥管理时，先写独立 transport/密钥方案。
2. 如果 new-api 网关确认支持 Gemini `/v1beta/interactions`，再把 `gemini_interactions_image` manifest 改为 runtime supported/publishable，并补 Worker adapter/verifier。
3. 根据用户最终人工审阅反馈调整默认模型、模板和 Studio 暴露策略。
