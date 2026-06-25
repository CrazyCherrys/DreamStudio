# DreamStudio 模型接入指南

当前状态：阶段 12 确认版。本文档说明管理员或开发者如何把 OpenAI 官方图片模型、OpenAI-compatible 第三方图片模型和 Gemini 官方图片模型接入 DreamStudio 的 profile/adapter 架构。

## 1. 核心流程

DreamStudio 图片模型执行链路固定为：

```text
Studio UI 参数
-> 默认 execution profile 的 active revision
-> request mapping
-> Worker adapter
-> 用户配置的 new-api gateway
-> 上游模型
```

规则：

- 普通用户侧只自动使用模型的默认启用 profile。
- 新任务会快照 profile、revision、adapter、request mapping 和最终脱敏请求。
- 已排队任务和历史任务不受后续 active revision 变更影响。
- 模板导入、JSON 导入和手动编辑都只生成 draft revision。
- 发布前应依次运行 lint、预览请求、diff 和 dry-run test。
- v1 不保存 OpenAI 或 Gemini 官方直连密钥；默认 transport 是 `new_api_bearer`。

## 2. OpenAI 官方图片模型

1. 在 `/admin/models` 创建或打开 image 模型。
2. 创建或选择 execution profile。
3. 选择模板：
   - OpenAI Image generation：`openai_images_generation`
   - OpenAI Image edit：`openai_images_edit`
   - OpenAI Responses image tool：`openai_responses_image`
4. 设置 `upstream_model_id` 为官方模型 ID。
5. 审阅 `parameter_schema`，只保留该模型官方支持的参数。
6. 运行 lint、预览请求、diff 和 test。
7. 发布 revision。
8. 只有确认可作为普通用户入口时，才把 profile 设为默认且启用。

OpenAI Responses image tool 请求边界：

- 默认路径是 `/v1/responses`。
- Prompt 会映射为 Responses `input` 消息结构。
- 参考图会追加为 `input_image` content。
- 图片结果通过 `output[].type=image_generation_call` 解析。

## 3. OpenAI-Compatible 第三方模型

OpenAI-compatible 不等于 OpenAI full-compatible。

接入规则：

- 优先从 `openai-compatible-image-generation-minimal` 模板开始。
- 默认只声明经过确认的最小字段，例如 `model`、`prompt`、`n`、`size`、`response_format`。
- 不要直接复制 OpenAI 官方全量参数。
- 如果使用 OpenAI 官方模板的 compatible copy，系统会清空未确认字段默认值并把字段标记为 `suspect`；必须按第三方文档删除字段或确认支持后才能发布。
- `source_kind` 应为 `third_party_docs`，并填写第三方文档 URL、检查时间和摘要。

发布前必须确认：

- 目标路径在 adapter allowlist 内。
- request mapping 只发送第三方确认支持的字段。
- 预览请求中没有内部字段、密钥或未声明参数。
- lint 不再包含 `OpenAI-compatible 字段必须删除或确认支持后才能发布`。

## 4. Gemini 官方图片模型

Gemini 原生图片请求使用 `gemini_generate_content` adapter。

默认模板：

- `profile-templates/gemini-generate-content-image.json`
- Adapter：`gemini_generate_content`
- Parser：`gemini_inline_data`
- 默认路径：`/v1beta/models/{model}:generateContent`

请求映射：

- Prompt -> `contents[0].parts[0].text`
- 参考图 -> `contents[0].parts[] inlineData`
- `aspect_ratio` -> `generationConfig.responseFormat.image.aspectRatio`
- `image_size` -> `generationConfig.responseFormat.image.imageSize`
- 常量 `generationConfig.responseModalities=["IMAGE"]`

边界：

- DreamStudio 不直接管理 Gemini 官方 API key。
- 当前仍通过用户配置的 new-api gateway 调用。
- 种子 Gemini profile 默认禁用且非默认。
- 只有确认 new-api gateway 支持 `/v1beta/models/{model}:generateContent` 后，管理员才应启用 Gemini profile。

Gemini Interactions：

- `profile-templates/gemini-interactions-image.json` 只作为官方参数参考草稿。
- Adapter：`gemini_interactions_image`
- 默认路径：`/v1beta/interactions`
- 当前 manifest 标记为 `runtime_supported=false`、`publishable=false`。
- 只有确认 new-api gateway 和 Worker runtime 都支持 Interactions 后，才能把 manifest 改为可运行/可发布。

## 5. Revision JSON 导入导出

Admin 模型详情页支持：

- 导出当前 revision JSON。
- 粘贴 revision JSON 并导入为新的 draft revision。

导入 JSON 使用与 `POST /api/v1/admin/execution-profiles/{profile_id}/revisions` 相同的字段形态。允许字段包括：

- `source_kind`
- `source_url`
- `source_checked_at`
- `source_summary`
- `adapter_key`
- `adapter_version`
- `transport_key`
- `upstream_model_id`
- `upstream_endpoint_path`
- `reference_transfer_mode`
- `supports_reference_image`
- `max_reference_images`
- `parameter_schema`
- `default_params`
- `request_mapping`
- `response_parser_key`
- `capabilities`
- `validation_rules`
- `change_summary`

规则：

- 导入 JSON 永远创建 draft revision。
- 没有显式 `source_kind` 时，UI 会按 `imported_json` 处理。
- 导入后必须 lint、预览、diff、test，再发布。
- 不要在 JSON 中保存 API key、Authorization header、S3 secret 或本地绝对路径。

## 6. 开发者新增协议

只有新增协议、鉴权、请求结构或响应结构时才应改 Worker 代码。

步骤：

1. 新增 adapter key 和 allowed target path。
2. 用共享 request mapping compiler 构造请求。
3. 增加 response parser 或复用现有 parser。
4. 写 mock upstream verifier。
5. 新增 profile template。
6. 更新 docs 和验证脚本。
7. 通过全局验证后再发布 profile。

当前 runtime adapter：

- `openai_images_generation`
- `openai_images_edit`
- `openai_responses_image`
- `gemini_generate_content`

当前 draft-only 模板：

- `gemini_interactions_image`
