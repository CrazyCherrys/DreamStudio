# DreamStudio 多模型生图适配层实现方案

当前状态：阶段 12 已完成；任务创建已写入默认 active profile snapshot、adapter snapshot、request mapping snapshot 和最终脱敏请求预览，Worker 已通过 adapter registry 执行 OpenAI Image generation/edit、OpenAI Responses image tool 和 Gemini `generateContent` 基础闭环，Parameter Schema v2 元数据已被后端校验、Admin 可编辑、Studio 按 `ui.group=quick` 和 `ui.slot` 渲染快捷参数；Admin 已能管理 execution profile 和 draft/active/archived revision；Request Mapping compiler 已沉到共享包并被 Worker、Admin lint、Admin preview 复用；RequestLog 已写入并展示 adapter/profile、脱敏最终请求、上游响应摘要和 profile 排障提示；Admin 已支持 OpenAI 官方模板、Gemini 官方模板和 OpenAI-compatible 最小模板导入为 draft revision、查看 active/draft diff、预览、测试、Revision JSON 导出和 JSON 导入为 draft；Adapter manifest 已集中声明 runtime/publish/parser/path 边界，Gemini Interactions 模板保持 draft-only；最终 API、数据模型、Worker、Admin 日志和模型接入指南已同步。

目标：在 DreamStudio 继续以 new-api 作为统一网关的前提下，将 OpenAI 官方生图模型、Gemini 官方生图模型、OpenAI-compatible 第三方生图模型都包装为 DreamStudio 异步图片任务，并尽量把“模型参数更新”降级为配置更新，而不是每次都修改 Worker 代码。

## 1. 结论先行

DreamStudio 要统一的不是 OpenAI、Gemini、第三方厂商的参数全集，而是自己的稳定任务语义：

```text
Studio UI 参数
-> DreamStudio 稳定任务语义
-> Execution Profile 版本快照
-> Request Mapping
-> Adapter
-> new-api
-> 上游官方或兼容模型
```

因此：

- OpenAI 官方 Image/Responses 接口是重要协议基线，但不是所有模型的统一真理。
- Gemini 原生图片生成不是 OpenAI Image API 的字段子集，必须通过 Gemini adapter 构造 `generateContent` 请求。
- OpenAI-compatible 只代表路径、鉴权、基础字段或响应风格接近 OpenAI，不代表支持 OpenAI 官方全部参数。
- 官方模型也必须按“模型支持的参数子集”建 profile，不能把同一套 OpenAI 参数表展示给所有 OpenAI 模型。
- 模型参数更新时，应导入为新的 profile revision 草稿，经过 diff、请求预览和 smoke test 后发布；已经排队的任务继续使用创建任务时快照的旧 profile。

## 2. 参考依据

- OpenAI Image Generation Guide: https://developers.openai.com/api/docs/guides/image-generation
- OpenAI Create Image API Reference: https://developers.openai.com/api/reference/resources/images/methods/generate
- OpenAI Image Edit API Reference: https://developers.openai.com/api/reference/python/resources/images/methods/edit
- OpenAI Responses API Reference: https://developers.openai.com/api/reference/responses
- Gemini Image Generation Guide: https://ai.google.dev/gemini-api/docs/image-generation
- Gemini Generate Content API: https://ai.google.dev/api/generate-content
- new-api OpenAI Image docs: https://github.com/QuantumNous/new-api-docs/blob/main/docs/en/api/openai-image.md

文档维护要求：

- 官方模型模板必须记录 `source_url`、`source_checked_at`、`source_summary`。
- 不允许把当前官方参数表当成永久事实写死在代码里。
- 每次同步官方文档或 third-party 文档，只生成草稿 profile revision，不自动影响线上启用 profile。

## 3. 当前开发阶段边界

当前 DreamStudio 仍处于开发阶段，允许在数据结构出现大调整时重新创建本地或测试环境。因此，本方案不以旧数据平滑迁移为优先目标。

实施边界：

- 不要求保留旧 `ImageTask` 的执行兼容。
- 不要求为历史 `AiModel` 自动 backfill 出可执行 profile。
- 不要求 Worker 保留没有 profile snapshot 的 legacy fallback。
- 不要求 API 长期兼容旧的执行字段，只需要在过渡提交内避免前后端同时崩坏。
- 可以调整初始化脚本、种子数据和验证脚本，让新环境直接创建 `AiModel + ExecutionProfile + active Revision`。
- 如果本地或测试环境因 schema 改动无法复用旧数据，可以直接重新创建环境并重新初始化。

仍然必须保留：

- 任务创建时快照 adapter、profile revision、request mapping 和脱敏请求结构。
- 重试任务默认沿用原任务快照。
- active revision 发布前必须经过 lint、请求预览和 smoke test。

这些要求不是为了兼容旧数据，而是为了保证排队任务、重试任务、历史日志和故障排查可复现。

## 4. 当前代码情况

当前项目已有模型目录、参数 Schema、异步图片任务和 Worker 基础；阶段 1 已先落地 execution profile 数据结构，阶段 2 已补齐开发期默认 profile 初始化，阶段 8 已补齐共享 request mapping compiler 和 request log 排障链路：

- `ModelEndpointType` 是 Prisma enum，当前固定为 `openai_image_generations`、`openai_image_edits`、`gemini_generate_content`。
- `AiModel` 同时保存展示属性和执行属性：`modelId`、`endpointTypes`、`referenceTransferMode`、`supportsReferenceImage`、`defaultParams`、`parameterSchema`。
- Prisma schema 已新增 `AiModelExecutionProfile`、`AiModelExecutionProfileRevision`、`ExecutionProfileOperation`、`ExecutionProfileRevisionStatus`、`ExecutionProfileSourceKind`。
- `ImageTask` 已新增可空的 profile/revision 关系和 `adapterKeySnapshot`、`adapterVersionSnapshot`、`executionProfileSnapshot`、`requestMappingSnapshot`、`resolvedRequestSanitizedSnapshot`。
- `RequestLog` 已新增可空的 adapter/profile 字段、`resolvedRequestSanitized`、`upstreamResponseSummary`、`profileErrorHint`。
- 新增迁移为 `packages/db/prisma/migrations/20260621010000_execution_profiles/migration.sql`。
- `scripts/init-m0.ts` 已创建开发默认图片模型 `gpt-image-2`，并写入默认 `OpenAI Image generation` profile 和 active revision。
- 初始化脚本还会给当前启用、未删除、`modality=image` 且包含 `openai_image_generations` 端点的模型补齐默认 OpenAI Image generation profile。
- 初始化补齐 profile 时，`upstream_model_id` 使用该模型自己的 `model_id`；Gemini 或 edit-only 模型不会被硬套 OpenAI generation profile。
- 初始化补齐 profile 时，`provider_name=OpenAI` 的模型标记为 `openai_official` 来源；其他兼容模型标记为 `third_party_docs` 来源，避免把 OpenAI-compatible 误标成官方模型。
- 新增 `scripts/verify-model-profiles.ts`，用于检查启用图片模型的默认 profile、active revision、adapter key、Schema v2 快捷 slot 和 request mapping。
- `parameter_schema` 当前支持 `string`、`number`、`integer`、`boolean`、`select`，用于 Studio 表单和 API 基础校验。
- Profile/revision 内的 `parameter_schema` 已开始保存 Schema v2 扩展字段；旧 `AiModel.parameterSchema` 暂时仍只保存前端和旧校验器能识别的兼容字段。
- 创建图片任务时，后端读取当前模型默认 active profile revision 的 `parameter_schema`，校验用户提交参数，并将合法参数写入 `parameterSnapshot`。
- 任务创建逻辑已切到 active profile revision，并写入 profile、adapter、request mapping 和最终脱敏请求快照。
- Worker 当前通过 adapter registry 调用 `NewApiImageClient` 的底层 JSON/multipart 能力，请求字段由 snapped `request_mapping` 编译生成。
- 文生图请求由 `openai_images_generation` adapter 使用 JSON body，并限制目标路径为 `/v1/images/generations`。
- 编辑请求由 `openai_images_edit` adapter 使用 multipart form，参考图字段名来自 snapped `request_mapping.reference_field.target`。
- Responses 图片请求由 `openai_responses_image` adapter 使用 JSON body，并限制目标路径为 `/v1/responses`；prompt 会映射为 Responses `input` 消息结构，参考图追加为 `input_image` content。
- 响应解析已支持 OpenAI Image 风格的 `data[].url`、`data[].b64_json`，OpenAI Responses `output[].type=image_generation_call` 结果，以及 Gemini `candidates[].content.parts[].inlineData.data`。
- Studio 快捷参数当前按 Schema v2 的 `ui.group=quick` 和 `ui.slot` 渲染“张数、比例、分辨率”，不再依赖 key/label/description 猜测。
- `profile-templates/` 已内置 OpenAI Image generation、OpenAI Image edit、OpenAI Responses image tool 和 OpenAI-compatible 最小文生图模板。
- `profile-templates/` 已内置 Gemini `generateContent` 图片模板，映射 `contents.parts`、`generationConfig.responseModalities` 和 `generationConfig.responseFormat.image.*`；Gemini Interactions 图片模板仅作为 draft-only 占位，直到网关确认支持 `/v1beta/interactions`。
- Admin API 已支持列出模板、把模板导入为 draft revision、复制 OpenAI 官方模板为 OpenAI-compatible 草稿，以及比较 draft revision 与当前 active revision。
- Admin 模型详情页的执行配置区域已支持模板导入、OpenAI-compatible copy 警告、导入后选择 draft、Revision JSON 导出、Revision JSON 导入为 draft、查看 active/draft diff。
- `scripts/verify-profile-templates.ts` 验证模板可列出、导入只创建 draft、draft 不影响 public profile、发布后 public profile 才变化、runtime/publish 状态准确，以及 OpenAI-compatible copy 的未确认字段会阻断发布。
- `packages/config/src/image-adapter-manifest.ts` 集中声明 adapter allowed target path、runtime 支持、publishable 状态和 parser 白名单；API lint、Admin preview 和 Worker adapter registry 共享该边界。
- `scripts/init-m0.ts` 已创建开发用 Gemini `generateContent` 非默认 profile 和 active revision；默认保持 disabled，直到管理员确认 new-api 网关支持 `/v1beta/models/{model}:generateContent` 后再启用。
- Worker 已新增 `gemini_generate_content` adapter，通过 snapped request mapping 构造 Gemini JSON 请求，把参考图作为 `inlineData` parts 追加，并使用 `gemini_inline_data` parser 解析生成图。

这说明当前系统已经具备“模型级参数白名单”、profile/revision 管理、任务快照、request mapping compiler、adapter manifest、adapter registry、OpenAI/Gemini runtime adapter 基础、官方/兼容模板导入、Revision JSON 导入导出和模型接入指南；后续扩展应优先新增 manifest/template/verifier，再按需新增 Worker adapter。

## 5. 当前痛点

1. `parameter_schema` 只能表达“允许哪些参数”，不能表达“这些参数如何映射到上游请求”。
2. 当前默认 DreamStudio 参数名等于上游参数名，无法处理 Gemini 的嵌套字段、Responses API 的工具结构、第三方兼容模型的自定义字段。
3. `endpoint_type` 是固定 enum，新增协议会牵动 Prisma enum、API 类型、前端类型和 Worker 分支。
4. Worker 直接透传参数，第三方 OpenAI-compatible 模型不支持某参数时，可能报 400，也可能静默忽略。
5. 新官方协议或网关路径仍需要先进入 adapter manifest，再决定是否可 publish，不能只靠模板字段约定。
6. Studio 快捷参数依赖猜测的问题已解决，但后续新增 slot 仍需要先定义稳定 UI 语义。
7. request log 已能展示 adapter/profile/request 快照；后续应继续避免把密钥、完整敏感 prompt 或本地路径写入日志。

## 6. 设计原则

- 默认 allowlist：模型未声明支持的参数，不显示、不提交、不发送。
- 模型展示信息和模型执行配置分离。
- 协议差异由 adapter 处理，模型差异由 execution profile 配置处理。
- 新增同协议模型时优先只改后台配置。
- 新增协议、新响应结构、新鉴权方式时才新增代码。
- 任务执行必须快照 adapter、adapter version、profile revision 和 request mapping。
- 数据库中不保存任意 JS 表达式，只允许声明式 mapping 和后端白名单 transform。
- 官方文档变化只更新 profile 草稿，不自动改变线上默认 profile。
- 用户侧 Studio 只看到当前 profile 明确支持的参数；管理员侧才能编辑 profile、查看预览和测试。
- 开发阶段可以破坏旧数据兼容，但不能破坏新任务的快照和可复现性设计。

## 7. 概念拆分

### 7.1 AiModel

`AiModel` 继续作为展示记录：

- `model_id`: DreamStudio 展示和默认上游模型 ID。
- `display_name`
- `provider_name`
- `modality`
- `icon_url`
- `description`
- `is_recommended`
- `sort_order`
- `is_enabled`

执行属性应从运行链路中迁移出 `AiModel`：

- `endpointTypes`
- `referenceTransferMode`
- `supportsReferenceImage`
- `defaultParams`
- `parameterSchema`

开发阶段允许直接让新增逻辑只读取默认 `ExecutionProfile`。旧字段可在短期内保留用于表单展示或代码过渡，但不得再作为新任务执行来源。

### 7.2 ExecutionProfile

`ExecutionProfile` 表示某个模型的一种可执行配置。一个 `AiModel` 可以有多个 profile，例如：

- OpenAI Image 文生图 profile
- OpenAI Image 编辑 profile
- OpenAI Responses 图片工具 profile
- Gemini `generateContent` profile
- 某第三方 OpenAI-compatible 文生图 profile

建议新增 `ai_model_execution_profiles`：

```text
id
ai_model_id
name
operation: text_to_image | image_to_image | image_edit | conversational_image
adapter_key
adapter_version
transport_key
upstream_model_id
upstream_endpoint_path
reference_transfer_mode
supports_reference_image
max_reference_images
parameter_schema
default_params
request_mapping
response_parser_key
capabilities
validation_rules
is_default
is_enabled
sort_order
created_at
updated_at
deleted_at
```

字段说明：

- `adapter_key`: 后端白名单字符串，例如 `openai_images_generation`、`openai_images_edit`、`openai_responses_image`、`gemini_generate_content`。
- `transport_key`: v1 默认 `new_api_bearer`，表示仍使用用户配置的 new-api base URL 和 API key。未来如果 DreamStudio 直连 OpenAI/Gemini 官方 API，必须新增 direct transport 和密钥管理方案，不在本阶段隐式加入。
- `upstream_model_id`: 真实传给上游的模型 ID。
- `upstream_endpoint_path`: 默认由 adapter 决定，只在兼容模型需要自定义路径时覆盖。
- `parameter_schema`: 该 profile 允许用户设置的参数。
- `default_params`: 该 profile 的默认参数。
- `request_mapping`: DreamStudio 参数到上游请求字段的声明式映射。
- `capabilities`: 面向产品逻辑的能力摘要，例如最大参考图、是否支持透明背景、是否支持 partial image。
- `validation_rules`: 跨字段组合约束，例如 `quality=hd` 只允许部分尺寸。

### 7.3 ExecutionProfileRevision

为避免“模型参数更新后立即影响线上任务”，建议新增 revision 概念。可以单独建表，也可以在 profile 表中加入 revision 字段并用不可变快照存历史。

推荐表：`ai_model_execution_profile_revisions`

```text
id
execution_profile_id
revision_no
status: draft | active | archived
source_kind: manual | openai_official | gemini_official | third_party_docs | imported_json
source_url
source_checked_at
source_summary
adapter_key
adapter_version
upstream_model_id
parameter_schema
default_params
request_mapping
response_parser_key
capabilities
validation_rules
change_summary
created_by
created_at
activated_by
activated_at
archived_at
```

发布规则：

- 同一个 profile 同一时间只能有一个 `active` revision。
- 导入官方文档或第三方文档只创建 `draft` revision。
- `draft` 必须通过 schema lint、mapping lint、请求预览和 smoke test 后才能发布。
- 创建图片任务时只允许使用 `active` revision。
- 已创建任务永远使用任务内快照，不再读取最新 active revision。

## 8. Parameter Schema v2

扩展现有 `parameter_schema`。开发阶段不要求长期兼容旧 schema，但可在短期过渡中保留旧字段读取，方便分阶段提交。

示例：

```json
{
  "key": "aspect_ratio",
  "label": "比例",
  "type": "select",
  "required": false,
  "default": "1:1",
  "options": [
    { "label": "1:1", "value": "1:1" },
    { "label": "16:9", "value": "16:9" }
  ],
  "ui": {
    "group": "quick",
    "slot": "aspect_ratio",
    "order": 10
  },
  "capability": "aspect_ratio",
  "send_policy": "when_present",
  "validation": {
    "enum": ["1:1", "16:9"]
  }
}
```

新增字段：

- `ui.group`: `quick | advanced | hidden`
- `ui.slot`: `count | aspect_ratio | resolution | quality | format | background | style | seed | safety | reference`
- `ui.order`: 前端排序
- `capability`: 参数所属能力
- `send_policy`: `always | when_present | never`
- `validation`: 正则、范围、枚举、组合约束
- `help_url`: 可选，指向官方或厂商参数说明
- `deprecated`: 可选，用于发布新 revision 时保留兼容但不再推荐

Studio 行为：

- 快捷参数按 `ui.group=quick` 和 `ui.slot` 渲染，不再猜测 key/label。
- 高级参数按 `ui.group=advanced` 渲染。
- `hidden` 参数只用于默认值或 mapping，不展示给普通用户。
- 参数默认值从 active profile revision 读取。
- 不在 schema 中的参数，API 必须拒绝。
- `send_policy=never` 的参数可以参与默认值和内部校验，但不会写入任务参数快照或最终上游请求。

## 9. Request Mapping

`request_mapping` 用于把 DreamStudio 内部参数转换为上游请求。

阶段 8 已实现共享 compiler：`packages/config/src/request-mapping.compiler.ts`。Worker 执行、Admin revision lint、Admin 请求预览共用同一套编译逻辑，避免预览 payload 和真实上游 payload 分叉。

OpenAI Image generation 示例：

```json
{
  "content_type": "json",
  "fields": [
    { "source": "model", "target": "model" },
    { "source": "prompt", "target": "prompt" },
    { "source": "params.n", "target": "n", "omit_if_null": true },
    { "source": "params.size", "target": "size", "omit_if_null": true },
    { "source": "params.quality", "target": "quality", "omit_if_null": true },
    { "source": "params.output_format", "target": "output_format", "omit_if_null": true }
  ]
}
```

OpenAI Image edit multipart 示例：

```json
{
  "content_type": "multipart",
  "reference_field": {
    "target": "image[]",
    "mode": "repeat"
  },
  "fields": [
    { "source": "model", "target": "model" },
    { "source": "prompt", "target": "prompt" },
    { "source": "params.quality", "target": "quality", "omit_if_null": true },
    { "source": "params.size", "target": "size", "omit_if_null": true }
  ]
}
```

Gemini `generateContent` 示例：

```json
{
  "content_type": "json",
  "fields": [
    { "source": "prompt", "target": "contents[0].parts[0].text" },
    {
      "source": "params.aspect_ratio",
      "target": "generationConfig.responseFormat.image.aspectRatio",
      "omit_if_null": true
    },
    {
      "source": "params.image_size",
      "target": "generationConfig.responseFormat.image.imageSize",
      "omit_if_null": true
    }
  ],
  "constants": [
    {
      "target": "generationConfig.responseModalities",
      "value": ["IMAGE"]
    }
  ]
}
```

Transform 必须来自后端白名单，例如：

```text
validateOpenAIImageSize
aspectRatioToOpenAISize
dropUnsupported
numberToString
booleanToFlag
joinArray
```

禁止：

- 在数据库保存任意 JS、SQL、模板执行代码。
- 用户侧提交未在 schema 中声明的透传参数。
- 用 `extra` 或 `raw_payload` 绕过 schema 和 mapping。

管理员可以有实验字段，但也必须经过 mapping lint 和脱敏预览。

当前 compiler 已支持：

- `fields`、`constants`、`omit_if_null`、`reference_field`。
- `json` 和 `multipart` content type。
- `params.*`、`model`、`prompt` source。
- dot path 和数组 path，如 `contents[0].parts[0].text`。
- 白名单 transform：`validateOpenAIImageSize`、`aspectRatioToOpenAISize`、`dropUnsupported`、`numberToString`、`booleanToFlag`、`joinArray`。
- adapter allowed target lint，避免 profile 把 adapter 指到不允许的上游路径。

## 10. Adapter Registry

新增 adapter registry。

接口草案：

```ts
interface ImageGenerationAdapter {
  key: string;
  version: number;
  allowedTargetPaths: string[];
  buildRequest(input: AdapterInput): Promise<UpstreamRequest>;
  parseResponse(response: UpstreamResponse): Promise<GeneratedImage[]>;
  normalizeError(error: unknown): WorkerFailure;
}
```

首批 adapter：

- `openai_images_generation`
  - 默认 `POST /v1/images/generations`
  - JSON body
  - 解析 `data[].b64_json` 或 `data[].url`
- `openai_images_edit`
  - 默认 `POST /v1/images/edits`
  - multipart body
  - 支持可配置图片字段名：`image`、重复 `image`、重复 `image[]`
  - 支持可选 mask 字段
- `openai_responses_image`
  - 默认 `POST /v1/responses`
  - 用于多轮编辑、上下文图片输入和 Responses 图片工具能力
  - 响应解析不能复用 `data[].url` 假设，必须独立 parser
- `gemini_generate_content`
  - 默认 `POST /v1beta/models/{model}:generateContent`
  - 构造 `contents.parts`
  - 支持文本 prompt 和参考图 `inline_data`/file reference 映射
  - 解析 Gemini 候选结果中的图片 `inlineData`

adapter key 使用字符串字段并由后端白名单校验，不继续扩展 Prisma enum 作为协议扩展入口。这样新增 adapter 仍然要写代码，但不会被数据库 enum 阻塞；新增同协议模型则只改 profile。

## 11. 官方和兼容模型的参数适配策略

### 11.1 OpenAI 官方模型

OpenAI 官方模型也不是同一组参数。Image API、Image Edit API、Responses API 图片能力的请求结构不同；同一个 Image endpoint 下，不同模型对 `n`、`size`、`quality`、`style`、`background`、`output_format`、`response_format` 等支持范围也可能不同。

适配规则：

- 每个官方模型按官方文档创建一个或多个 profile。
- profile 只声明当前模型明确支持的参数。
- 参数模板记录 `source_url` 和 `source_checked_at`。
- 官方文档更新后，导入新 draft revision，通过 diff 和 smoke test 后再发布。
- 不要给所有 OpenAI 模型套同一个 `OpenAIImageFullParameterSet`。

示例：`dall-e-3` generation profile 可以只展示 `n=1`、部分 `size`、`quality`、`style`；如果某 GPT Image 模型支持 `output_format` 或透明背景，则只在对应 GPT Image profile 中声明。

### 11.2 Gemini 官方模型

Gemini 官方图片生成走 `generateContent` 语义，不是 OpenAI Image 参数集合。

适配规则：

- 使用 `gemini_generate_content` adapter。
- DreamStudio 内部参数建议使用稳定语义，例如 `aspect_ratio`、`image_size`、`reference_images`。
- mapping 映射到 Gemini `generationConfig.responseFormat.image.*`、`generationConfig.responseModalities` 和 `contents.parts`。
- 响应解析走 Gemini parser，读取候选内容里的图片 `inlineData`。
- 如果当前 new-api 网关不支持 Gemini 原生路径，则该 profile 应保持禁用或仅用于未来 direct transport，不应在用户侧显示。

### 11.3 OpenAI-compatible 第三方模型

OpenAI-compatible 只表示兼容 OpenAI 风格协议的一部分。

适配规则：

- 优先复用 `openai_images_generation` 或 `openai_images_edit` adapter。
- `parameter_schema` 只放第三方厂商文档明确支持的字段。
- 不复制 OpenAI 官方完整参数。
- 不支持的参数不显示、不提交、不发送。
- 上游 400 参数错误应归类为 `invalid_upstream_request`，并在管理后台提示“profile 配置可能与上游实际能力不一致”。
- 第三方模型每个渠道可以有自己的 profile，即使 `upstream_model_id` 看起来相同。

## 12. 任务快照升级

`ImageTask` 建议新增：

```text
execution_profile_id
execution_profile_revision_id
adapter_key_snapshot
adapter_version_snapshot
execution_profile_snapshot
request_mapping_snapshot
resolved_request_sanitized_snapshot
```

创建任务时：

1. 根据 `model_record_id` 和可选 `execution_profile_id` 找到 active profile revision。
2. 用 profile revision 的 `parameter_schema` 校验参数。
3. 校验参考图数量和能力。
4. 合并 `default_params` 和用户参数。
5. 生成脱敏后的最终请求预览。
6. 把 adapter/profile/mapping/request 快照写入 `ImageTask`。
7. 入队异步任务。

阶段 4 已完成上述创建任务快照：`ImageTask` 会写入 `executionProfileId`、`executionProfileRevisionId`、`adapterKeySnapshot`、`adapterVersionSnapshot`、`executionProfileSnapshot`、`requestMappingSnapshot`、`resolvedRequestSanitizedSnapshot`；`modelIdSnapshot` 使用 active revision 的 `upstream_model_id`。阶段 5 已将 Worker 执行路径迁移到 adapter registry。阶段 8 已将 request mapping 编译逻辑抽到共享包，Admin preview 和 Worker 实际请求共用 compiler。

Worker 执行时：

- 优先读取任务内的 profile snapshot。
- 不实时读取模型当前 active profile。
- 没有 profile snapshot 的任务在开发阶段可以直接失败并提示重新提交；不需要保留 legacy OpenAI Image client 路径。

重试任务时：

- 默认沿用原任务的 profile snapshot，保证“重试同一个任务”语义稳定。
- 如果用户选择“用当前模型配置重新提交”，应创建新任务并重新解析 active profile。

## 13. Request Log 和排障

`RequestLog` 建议新增或扩展：

```text
adapter_key
adapter_version
execution_profile_id
execution_profile_revision_id
resolved_request_sanitized
upstream_response_summary
profile_error_hint
```

阶段 8 已完成写入和展示：

- Worker 成功时写入 `upstream_response_summary`，当前包含生成图片数量、是否包含 URL、是否包含 b64。
- Worker 失败时对 `invalid_request_mapping`、`adapter_target_not_allowed`、`adapter_not_supported`、`profile_snapshot_missing`、`invalid_upstream_request` 写入 `profile_error_hint`。
- Admin request log 列表显示 adapter key、profile revision 和 profile error hint。
- Admin request log 详情显示 adapter/profile 标识、脱敏参数、脱敏上游请求和上游响应摘要。

排障目标：

- 用户只看到任务失败原因。
- 管理员可以看到脱敏后的最终上游请求结构。
- 上游 400 能定位到是用户参数错误、profile mapping 错误，还是上游模型能力变更。
- 上游 429/5xx/timeout 仍按现有重试策略处理。

## 14. API 调整

管理员接口：

```text
GET    /api/v1/admin/models/{model_id}/execution-profiles
POST   /api/v1/admin/models/{model_id}/execution-profiles
GET    /api/v1/admin/execution-profiles/{profile_id}
PATCH  /api/v1/admin/execution-profiles/{profile_id}
DELETE /api/v1/admin/execution-profiles/{profile_id}

GET    /api/v1/admin/execution-profiles/{profile_id}/revisions
POST   /api/v1/admin/execution-profiles/{profile_id}/revisions
POST   /api/v1/admin/execution-profiles/{profile_id}/revisions/import-template/{template_id}
GET    /api/v1/admin/profile-templates
POST   /api/v1/admin/execution-profile-revisions/{revision_id}/preview-request
POST   /api/v1/admin/execution-profile-revisions/{revision_id}/lint
POST   /api/v1/admin/execution-profile-revisions/{revision_id}/test
POST   /api/v1/admin/execution-profile-revisions/{revision_id}/activate
GET    /api/v1/admin/execution-profile-revisions/{revision_id}/diff
```

阶段 7 已实现基础 Admin profile/revision API。阶段 9 已补齐模板列表、模板导入和 revision diff API。所有接口由 `SessionAuthGuard` + `SuperAdminGuard` 保护，写操作要求 CSRF。`PATCH /api/v1/admin/execution-profile-revisions/{revision_id}` 用于编辑 draft revision；发布 revision 会在事务中归档同 profile 下旧 active revision，并把 active revision 的执行配置同步回 profile 表。`test` 当前为 dry-run smoke test，验证 lint 和脱敏请求预览可构造，不直接请求真实上游。模板导入只创建 draft revision，不自动发布；复制 OpenAI 官方模板为 OpenAI-compatible 草稿时会写入 provider field review 警告。

普通模型接口返回默认 active profile 的公开字段：

```json
{
  "id": "model_record_id",
  "model_id": "gpt-image-2",
  "display_name": "GPT Image 2",
  "default_execution_profile": {
    "id": "profile_id",
    "revision_id": "revision_id",
    "operation": "text_to_image",
    "adapter_key": "openai_images_generation",
    "adapter_version": "1",
    "reference_transfer_mode": "none",
    "supports_reference_image": false,
    "max_reference_images": 0,
    "parameter_schema": [],
    "default_params": {},
    "capabilities": {
      "supports_reference_image": false,
      "max_reference_images": 0
    }
  }
}
```

创建任务接口增加：

```json
{
  "model_record_id": "uuid",
  "execution_profile_id": "uuid",
  "prompt": "...",
  "parameters": {},
  "reference_asset_ids": []
}
```

如果不传 `execution_profile_id`，使用模型默认启用 profile。返回任务时可增加：

```json
{
  "execution_profile_id": "profile_id",
  "execution_profile_name": "OpenAI Image generation",
  "adapter_key": "openai_images_generation"
}
```

## 15. 前端调整

Studio：

- 从选中模型的默认 active profile 读取 `parameter_schema` 和 `default_params`。
- 快捷参数按 `ui.group=quick` 和 `ui.slot` 渲染。
- 高级参数按 `ui.group=advanced` 渲染。
- `ui.group=hidden` 参数不展示。
- 当前 profile 不支持参考图时，隐藏或禁用参考图上传。
- 当前 profile 有 `max_reference_images` 时，上传数量以 profile 为准，而不是全局常量。
- 提交任务时带上 `execution_profile_id`。

阶段 3 已完成其中的读取和展示部分：公共模型接口返回 `default_execution_profile`，普通用户侧 image 模型没有默认 active profile 时不展示，Studio 快捷参数优先按 profile Schema v2 的 `ui.group=quick` 和 `ui.slot` 渲染，参考图上传状态和数量读取 profile 能力。提交任务时带 `execution_profile_id` 属于阶段 4，与任务 snapshot 一起落地。

管理后台：

- 模型表单保留展示属性。
- 新增“执行配置”区域。
- 支持 profile 列表、默认 profile、启用/禁用。
- 支持 revision 草稿编辑、diff、lint、预览、测试、发布。
- 支持选择 adapter，但 adapter 列表来自后端 registry。
- 支持编辑参数 Schema v2、默认参数、request mapping。
- 支持导入官方模板 JSON，但导入结果必须先成为 draft。
- 支持显示 `source_url`、`source_checked_at` 和最近 smoke test 结果。
- 阶段 9 已支持从内置模板导入 draft revision、OpenAI-compatible copy 警告、以及查看 active/draft diff；阶段 12 起模板 summary 和 preview 会显示 manifest runtime/publish 状态，draft-only 模板不能被发布。

## 16. 实现计划

### 阶段 1：数据模型重塑

- 新增 execution profile 和 revision 数据模型。
- 不为旧数据编写复杂 backfill。
- 已完成：新增 execution profile/revision 数据模型和任务/request log 快照字段。

### 阶段 2：初始化数据和默认 Profile

- 调整初始化脚本，让新环境直接创建 `AiModel + 默认 ExecutionProfile + active Revision`。
- 给启用的 OpenAI generation 图片模型补齐默认 profile。
- 新增 `scripts/verify-model-profiles.ts` 验证默认 profile 和 active revision。
- Profile/revision 初始化数据使用 Schema v2；旧模型字段短期保留兼容 schema。
- 已完成：开发默认 `gpt-image-2` 和现有启用 OpenAI generation 图片模型可通过 verifier。

### 阶段 3：模型 API 改为 Profile 来源

- 普通模型接口返回 `default_execution_profile`。
- Studio 优先读取 profile 的 `parameter_schema` 和 `default_params`。
- 如果模型没有 active default profile，普通用户侧不可提交。
- Admin 模型列表显示默认 profile 状态。
- 已新增 `scripts/verify-model-profile-api.ts` 校验公共 profile API contract、active revision 身份字段、Schema v2 `ui.slot` 保留和 reference image capability。

### 阶段 4：任务创建写入 Profile Snapshot

- 新任务必须依赖 active profile revision。
- 创建任务时快照 profile revision、adapter、request mapping 和脱敏请求结构。
- 使用 active revision 的 `parameter_schema` 校验用户参数。
- 重试任务默认沿用原任务 snapshot。
- 没有 active profile 的模型直接拒绝提交。

### 阶段 5：Adapter Registry 和 OpenAI Image 基础闭环

- 已实现 adapter registry：`apps/worker/src/modules/image-generation/image-adapter.registry.ts`。
- 已实现 `openai_images_generation` adapter：通过 snapped `request_mapping` 构造 JSON 请求，默认只允许 `/v1/images/generations`。
- 已实现 `openai_images_edit` adapter：通过 snapped `request_mapping` 构造 multipart 请求，默认只允许 `/v1/images/edits`，参考图字段支持 `image` 和 `image[]`。
- Worker 只走 profile snapshot 和 adapter registry；没有 `executionProfileSnapshot` 或 `requestMappingSnapshot` 的任务会失败并提示重新提交。
- `NewApiImageClient` 保留为底层 HTTP 能力，业务分支已迁移到 adapter。
- 已增加 `scripts/verify-image-adapters.ts` mock upstream 测试。

### 阶段 6：Parameter Schema v2

- 已扩展后端 schema 类型和校验。
- 已支持并保留 `ui`、`capability`、`send_policy`、`validation`、`help_url`、`deprecated`。
- 已限制 `ui.group`、`ui.slot`、`send_policy` 为白名单值。
- Studio 已改为只按 `ui.group=quick` 和 `ui.slot` 渲染快捷参数，不再猜测 key/label。
- 管理后台 schema builder 已支持编辑新字段，Studio 快捷参数卡片会写入 Schema v2 quick slot。
- `send_policy=never` 已在任务创建阶段从最终参数快照和 resolved request 中剔除。
- 已新增 `scripts/verify-parameter-schema-v2.ts` 验证 Schema v2 quick slot、`deprecated`、非法枚举拒绝、未声明参数拒绝和 `send_policy=never` 剔除。

### 阶段 7：Admin Profile 和 Revision 管理

- Admin 模型详情已支持查看 profile、revision 和来源。
- 已支持 profile 创建、编辑、启用/禁用、删除和默认 profile 切换。
- 已支持创建 draft revision、编辑 Schema v2、默认参数、request mapping、capabilities 和 validation rules。
- 已支持 lint、请求预览、dry-run test 和 activate。
- activate 会归档旧 active revision，保证同一 profile 同时只有一个 active revision。
- 已新增 `scripts/verify-execution-profile-admin.ts`，验证 admin guard、draft 创建、draft 不影响 active、lint、preview、test 和 activate 归档旧 active。
- 导入模板 JSON 仍属于后续模板阶段，当前 UI/API 支持手动 draft 编辑。

### 阶段 8：Request Mapping、Preview 和排障日志

- 已实现 mapping compiler：`packages/config/src/request-mapping.compiler.ts`。
- 已实现 transform 白名单和 `fields`、`constants`、`omit_if_null`、`reference_field`。
- 已实现 adapter allowed target lint。
- Admin 请求预览已复用 compiler。
- request log 已写入并展示脱敏后的最终请求结构。
- 上游 invalid request、mapping、adapter target 和缺失 profile snapshot 等错误会写入 profile 配置排查提示。
- 已新增 `scripts/verify-request-mapping.ts`，验证 OpenAI JSON、OpenAI multipart、Gemini nested mapping、未知 transform 拒绝、非 adapter allowed target 拒绝和 preview 脱敏边界。

### 阶段 9：OpenAI 官方模板和 OpenAI-compatible 模板

- 已建立 OpenAI Image generation/edit profile 模板。
- 已建立 OpenAI Responses image profile 模板；阶段 12 已接入 `openai_responses_image` runtime adapter。
- 已新增 OpenAI-compatible 最小文生图模板规范。
- 已明确 OpenAI-compatible 不等于 OpenAI full-compatible。
- 模板已记录官方或第三方 `source_url`、`source_checked_at` 和 `source_summary`。
- 已支持导入为 draft revision、diff、预览和测试。
- 已支持复制 OpenAI 官方模板为 OpenAI-compatible 草稿；草稿会清空未确认字段默认值，标记字段为 `suspect`，并在字段删除或确认前阻断 lint/发布。
- 官方模板变更不会自动发布，public model profile 只在管理员 activate 后变化。
- 已新增 `scripts/verify-profile-templates.ts` 验证模板导入、diff、compatible copy 和发布边界。

### 阶段 10：Gemini 原生 adapter

- 已实现 `gemini_generate_content` adapter。
- 已支持 `contents.parts` 请求和 prompt 文本映射。
- 已支持 `generationConfig.responseModalities` 和 `generationConfig.responseFormat.image.aspectRatio/imageSize` 配置。
- 已支持把参考图追加为 Gemini `inlineData` parts。
- 已支持 `inlineData` 响应解析，并复用现有 result image 保存链路。
- 已新增 Gemini 官方 profile 模板和开发种子 profile；种子 profile 默认 disabled 且非默认，只有管理员确认 new-api 网关支持该 Gemini 原生路径后才应启用。
- 未在本阶段新增 direct Gemini key 管理；v1 仍通过用户配置的 new-api bearer transport。

### 阶段 11：文档、验收和发布

- 已更新 API 契约文档。
- 已更新数据模型文档。
- 已更新模型目录文档。
- 已更新图片任务 Worker 文档。
- 已更新管理后台和日志文档。
- 已新增模型接入指南。
- 已支持 revision JSON 导出，以及粘贴 JSON 导入为 draft revision。
- 已完成最终验证和 Docker rebuild。

### 阶段 12：Adapter manifest、Responses runtime 和官方参数补齐

- 已新增共享 `IMAGE_ADAPTER_MANIFESTS`，集中声明 `openai_images_generation`、`openai_images_edit`、`openai_responses_image`、`gemini_generate_content` 和 draft-only `gemini_interactions_image` 的 allowed target path、parser key、runtime 支持和 publishable 状态。
- API lint、Admin preview 和 Worker adapter registry 已复用 manifest，未知 adapter、runtime 未实现、不可发布 adapter 和 parser key 不匹配都会阻断发布。
- Admin 模板列表和 preview 会显示 runtime/publish 状态、parser key 和 publish blockers。
- `openai_responses_image` Worker adapter 已接入 `/v1/responses`，支持 `promptToResponsesInput`、参考图 `input_image` 追加和 `image_generation_call` 解析。
- OpenAI 官方模板已补齐 `stream`、`partial_images`、`output_compression` 跨字段约束、`moderation`、edit `n`、edit 最大参考图和 Responses `size/action/partial_images` 等字段。
- `openai-compatible` copy 会把官方字段标为待审查，并在字段删除或 `review_status=confirmed` 前阻断发布。
- 新增 `scripts/verify-adapter-manifest.ts`，`scripts/verify-image-adapters.ts` 和 `scripts/verify-profile-templates.ts` 已覆盖 Responses runtime、manifest publish 状态和 compatible copy 阻断。

## 17. 新增模型流程

### 17.1 新增 OpenAI 官方模型

1. 创建或编辑 `AiModel` 展示记录。
2. 新建 execution profile。
3. 选择 `openai_images_generation`、`openai_images_edit` 或 `openai_responses_image` adapter。
4. `upstream_model_id` 填官方模型 ID。
5. 按官方文档配置该模型支持的参数子集。
6. 填写 `source_url`、`source_checked_at`、`source_summary`。
7. 配置 validation rules。
8. 运行 lint。
9. 预览最终请求。
10. 执行 smoke test。
11. 发布 revision，并设为默认 profile。

### 17.2 新增第三方 OpenAI-compatible 模型

1. 查看第三方厂商或 new-api 渠道文档，确认实际支持字段。
2. 选择 `openai_images_generation` 或 `openai_images_edit` adapter。
3. 只把厂商明确支持的参数加入 schema。
4. 不全量复制 OpenAI 官方参数。
5. 对不支持的参数不展示、不提交、不发送。
6. 用请求预览确认最终 payload。
7. 用真实 new-api 或 mock upstream 做 smoke test。
8. 发布 revision，并启用 profile。

### 17.3 新增 Gemini 官方模型

1. 确认当前 transport：v1 默认通过 new-api；若 new-api 不支持 Gemini 原生路径，该 profile 不对用户启用。
2. 选择 `gemini_generate_content` adapter。
3. `upstream_model_id` 填 Gemini 模型 ID。
4. 用 DreamStudio 内部参数语义配置 schema，例如 `aspect_ratio`、`image_size`、`reference_images`。
5. 用 request mapping 映射到 Gemini 请求结构。
6. 测试 `inlineData` 响应解析。
7. 发布 revision，并启用 profile。

### 17.4 新增全新协议模型

1. 不直接在后台硬配。
2. 先新增 adapter。
3. 写 adapter allowed target path 和 response parser。
4. 写 mock upstream 测试。
5. 实现请求构造、响应解析、错误归一化。
6. 再创建 execution profile。
7. 文档补充接入说明。

## 18. 验收标准

- 新环境初始化后，图片模型拥有默认 execution profile 和 active revision。
- 没有 active profile 的模型不能提交图片任务。
- 未声明参数不会发送到上游。
- 新增同协议模型不需要改 Worker 代码。
- 第三方 OpenAI-compatible 模型只发送 profile 声明支持的参数。
- OpenAI 官方模型按模型子集展示参数，不使用统一全集。
- Gemini profile 能构造 `generateContent` 请求并解析图片结果。
- OpenAI Responses profile 能构造 `/v1/responses` 图片工具请求并解析 `image_generation_call` 图片结果。
- Adapter manifest 中标记为 runtime unsupported 或 publishable false 的模板不能被发布。
- Studio 快捷参数不再依赖 key/label 猜测。
- 创建任务时快照 adapter/profile/revision/mapping。
- 重试任务默认沿用原 profile snapshot。
- 任务详情和 request log 能看到脱敏后的 adapter/profile/request 快照。
- 管理员能预览最终上游请求。
- 上游 400 参数错误可以定位到 profile 配置问题。
- 官方模板更新只生成 draft revision，不自动影响线上任务。
- 文档明确说明：OpenAI-compatible 不等于 OpenAI full-compatible。
- OpenAI-compatible copy 中未确认的官方字段必须删除或确认后才能发布。

## 19. 风险和边界

- 如果 new-api 网关不支持某官方协议路径，DreamStudio adapter 只能构造请求，不能保证该 profile 可执行；这种 profile 必须保持禁用或标记为需要 direct transport。
- direct OpenAI/Gemini 官方密钥管理不在本阶段默认加入，因为当前 v1 产品边界是用户配置 new-api key。
- 官方文档可能随时间变化，参数模板必须带来源和检查时间。
- 不允许自动抓取官方文档后直接覆盖 active profile；必须人工审核并发布。
- 不建议开放用户自定义 raw payload；这会破坏白名单、安全脱敏和排障。
- 开发阶段可以重建环境，但每次数据模型调整仍必须同步初始化脚本、验证脚本和相关文档，避免新环境不可启动。

## 20. 关键结论

长期稳定方案是让 DreamStudio 拥有自己的异步任务模型和参数语义，而不是追着每个供应商的参数表写业务分支。

新增普通模型主要是新增或更新 execution profile；新增协议、新鉴权、新响应结构才是代码工作。
