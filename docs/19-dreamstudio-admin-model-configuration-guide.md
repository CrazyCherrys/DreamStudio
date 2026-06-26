# DreamStudio 后台模型配置手册

当前状态：阶段 12 配置手册版。本文档面向管理员，说明如何在 `/admin/models` 里把模型真正配置成 `/studio` 可用的官方生图模型。

## 1. 先理解什么决定 Studio 能不能用

`/studio` 能否使用某个图片模型，不看模型表单里的“端点标签”，而看下面这条链路：

```text
模型已启用
-> 该模型存在默认启用的 execution profile
-> 该 profile 存在 active revision
-> active revision 的 adapter/request mapping/lint/preview/test 均通过
-> `/studio` 自动读取 default_execution_profile
```

结论：

- `endpoint_types` 只用于目录展示和筛选提示，不决定实际协议。
- 真正决定 Studio 调用协议的是 `default_execution_profile.adapter_key`。
- 图片模型如果没有默认 active profile，普通用户不会在 `/studio` 看见它。

## 2. 后台页面怎么进入

1. 打开 `http://localhost:3000/admin/models`
2. 点击 `新增模型`，或者打开已有模型的 `编辑`
3. 在模型弹窗里先保存模型基础信息
4. 在同一个弹窗下方的 `执行配置` 区域配置 profile / revision

推荐先建好模型，再在同一个弹窗里完成 execution profile 配置，不要只保存模型表单后就离开。

## 3. 模型表单怎么填

### 通用字段

- `模型 ID`：填真实上游模型 ID，或者你希望 DreamStudio 默认显示的模型 ID
- `展示名称`：填给用户看的名字
- `厂商`：
  - OpenAI 官方填 `OpenAI`
  - Gemini 官方填 `Google` 或 `Gemini`
- `模型类型`：选 `图片`
- `参考图传递`：
  - OpenAI Image generation 选 `none`
  - OpenAI Responses image tool 选 `url`
  - Gemini Interactions 选 `url`
- `端点标签`：只作展示用途，建议按实际可能协议勾选
- `支持参考图`：只作模型级展示提示，真正生效仍以 active revision 为准
- `启用`：勾选
- `推荐`：按产品需要决定

### 端点标签推荐值

不是运行时真值，只是后台展示建议：

- OpenAI GPT Image 2 文生图：勾 `openai_image_generations`
- OpenAI Responses 图片工具：勾 `openai_responses_image`
- Gemini `gemini-3-pro-image-preview`：勾 `gemini_interactions_image`
- 同一模型未来可能切协议时，可以同时勾多个标签

## 4. 执行配置区怎么操作

执行配置区里，真正重要的是这几个概念：

- `Profile`：某个模型的一条可执行配置
- `Revision`：该配置的版本
- `Draft`：草稿，不会影响 Studio
- `Active`：已发布版本，Studio 实际使用它
- `Default`：该模型的默认 profile，普通用户只自动用这条

标准操作顺序：

1. 创建或选中一个 profile
2. 从模板导入 draft revision
3. 检查 `adapter_key`、`upstream_model_id`、`parameter_schema`、`request_mapping`
4. 依次执行 `Lint`、`请求预览`、`Test`
5. 确认无误后点击 `发布`
6. 确认该 profile 同时是 `默认` 且 `启用`

只要没有 `发布`，`/studio` 都不会切到新配置。

## 5. OpenAI 官方怎么配

### 场景 A：`gpt-image-2` 文生图

适用：

- 当前使用 `gpt-image-2`
- 或未来仍兼容 OpenAI Image API `/v1/images/generations` 的官方模型

推荐配置：

- 模型表单：
  - `模型 ID`：`gpt-image-2`
  - `展示名称`：`GPT Image 2`
  - `参考图传递`：`none`
  - `端点标签`：勾 `openai_image_generations`
- 执行配置：
  - 新建 profile，名称可用 `OpenAI Image generation`
  - 模板导入：`openai-image-generation-gpt-image-2`
  - `upstream_model_id`：保持 `gpt-image-2`，或改成未来兼容该接口的官方模型 ID
  - 保持 `adapter_key=openai_images_generation`
  - 发布后，把该 profile 设成 `默认` + `启用`

这样配置后：

- `/studio` 会按 Image API generation 协议提交
- 快捷参数来自该 active revision 的 `parameter_schema`
- 不支持参考图

### 场景 B：OpenAI 官方 Responses 图片工具

适用：

- 上游官方模型要求走 `/v1/responses`
- 或希望通过 `image_generation` tool 调用官方模型

推荐配置：

- 模型表单：
  - `模型 ID`：填真实官方模型 ID
  - `参考图传递`：`url`
  - `端点标签`：勾 `openai_responses_image`
- 执行配置：
  - 新建 profile，名称可用 `OpenAI Responses image`
  - 模板导入：`openai-responses-image-tool`
  - `upstream_model_id`：改成真实官方模型 ID
  - 保持 `adapter_key=openai_responses_image`
  - 检查 `request_mapping` 中：
    - Prompt -> `input`
    - `tools[0].type=image_generation`
  - 发布后，把该 profile 设成 `默认` + `启用`

这样配置后：

- `/studio` 会直接按 Responses 协议提交
- 参考图会自动追加为 `input_image`
- 任务详情和请求日志里的 `adapter_key` 会显示 `openai_responses_image`

### OpenAI 官方选择建议

- 明确使用 `gpt-image-2` 时，优先 `openai_images_generation`
- 明确使用需要 Responses image tool 的新官方模型时，优先 `openai_responses_image`
- 不要靠改 `endpoint_types` 来切协议，必须改默认 active profile

## 6. Gemini 官方怎么配

### 主线：`gemini-3-pro-image-preview`

当前 DreamStudio 对 Gemini 新官方图片模型的主线是 Interactions。

推荐配置：

- 模型表单：
  - `模型 ID`：`gemini-3-pro-image-preview`
  - `展示名称`：例如 `Gemini 3 Pro Image Preview`
  - `厂商`：`Google`
  - `参考图传递`：`url`
  - `端点标签`：勾 `gemini_interactions_image`
- 执行配置：
  - 新建 profile，名称可用 `Gemini Interactions image`
  - 模板导入：`gemini-interactions-image`
  - `upstream_model_id`：改成真实 Gemini 官方模型 ID
  - 保持 `adapter_key=gemini_interactions_image`
  - 检查 `request_mapping` 中：
    - Prompt -> `input[0].text`
    - `response_format.type=image`
    - `response_format.mime_type`
    - `response_format.aspect_ratio`
    - `response_format.image_size`
  - 发布后，把该 profile 设成 `默认` + `启用`

这样配置后：

- `/studio` 会按 Gemini Interactions 协议提交
- 支持参考图
- 后续 Gemini 新官方图片模型只需要改 `upstream_model_id`，不需要改代码

### Gemini legacy 说明

- `gemini-generate-content-image` 模板仍保留
- 只用于旧 `generateContent` 官方链路参考
- 不推荐用于 `gemini-3-pro-image-preview` 及后续新官方模型

## 7. 发布前必须检查什么

每次改 revision，至少做这四步：

1. `Lint`
2. `请求预览`
3. `Diff`
4. `Test`

含义：

- `Lint`：检查 adapter、parser、allowed path、参数 schema、兼容字段门禁
- `请求预览`：确认最终脱敏请求结构正确
- `Diff`：看 draft 相比 active 改了什么
- `Test`：当前是 dry-run，只确认能构造请求，不会真的打上游

注意：

- `Test` 通过不代表你的 new-api gateway 一定支持该官方协议
- 对 OpenAI Responses 和 Gemini Interactions，仍需要你自己确认网关实际兼容

## 8. 怎样确认 Studio 已经切过去

发布并设为默认后，按下面检查：

1. 打开 `http://localhost:3000/studio`
2. 确认模型出现在左侧列表
3. 选择模型后确认快捷参数和参考图能力符合该 profile
4. 提交一条图片任务
5. 打开任务详情页或 `/admin/request-logs`
6. 确认：
   - `adapter_key` 是预期协议
   - `endpoint_type` 是预期协议
   - `resolved_request_sanitized` 结构正确

预期示例：

- GPT Image 2 文生图：`openai_images_generation`
- OpenAI Responses：`openai_responses_image`
- Gemini 3 Pro Image Preview：`gemini_interactions_image`

## 9. 最常见的配置错误

- 只建了模型，没有建默认 active profile
- 建了 draft revision，但没有点击 `发布`
- profile 已发布，但没有设为 `默认`
- profile 是默认，但没有 `启用`
- `upstream_model_id` 还保留模板默认值，没改成真实模型 ID
- Gemini 新模型误用了 `gemini_generate_content`
- 以为勾选 `endpoint_types` 就能切协议，实际上不会

## 10. 推荐最小操作清单

### 配 OpenAI GPT Image 2

1. 新增图片模型
2. 新建 profile
3. 导入 `openai-image-generation-gpt-image-2`
4. 确认 `upstream_model_id=gpt-image-2`
5. `Lint -> 预览 -> Test -> 发布`
6. 设为默认启用

### 配 OpenAI Responses 官方模型

1. 新增图片模型
2. 新建 profile
3. 导入 `openai-responses-image-tool`
4. 改 `upstream_model_id`
5. `Lint -> 预览 -> Test -> 发布`
6. 设为默认启用

### 配 Gemini `gemini-3-pro-image-preview`

1. 新增图片模型
2. 新建 profile
3. 导入 `gemini-interactions-image`
4. 确认 `upstream_model_id=gemini-3-pro-image-preview`
5. `Lint -> 预览 -> Test -> 发布`
6. 设为默认启用
