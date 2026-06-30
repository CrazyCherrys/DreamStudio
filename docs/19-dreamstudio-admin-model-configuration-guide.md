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
- 真正决定 Studio 调用协议的是默认主 profile、参考图编辑 companion profile，以及本次是否上传参考图。
- 图片模型如果没有默认 active profile，普通用户不会在 `/studio` 看见它。
- 参考图上传大小和结果图保存大小不在模型级配置里控制，统一由 `/admin/system-settings` 的全局图片大小上限控制。

## 2. 后台页面怎么进入

1. 打开 `http://localhost:3000/admin/models`
2. 在列表页先按需要筛选：
   - 搜索关键字
   - 模型类型
   - 端点标签
   - 启用状态 / 推荐状态
   - `只看缺 Profile`
3. 点击 `新增模型`，或者在现有模型卡片上点 `编辑` / `继续配置`
4. 在弹窗中按步骤完成：
   - `1. 基础信息`
   - `2. 执行配置`
   - `3. 发布检查`

重要变化：

- 新建模型保存成功后，弹窗不会关闭。
- 系统会直接把你带到 `执行配置` 步骤，不需要回列表再点一次编辑。
- 列表卡片上的 `Profile 可用 / 缺默认 Profile / Draft 数` 才是当前维护优先级提示。

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
  - Gemini generateContent 选 `url`
- `端点标签`：只作展示用途，建议按实际可能协议勾选
- `支持参考图`：只作模型级展示提示，真正生效仍以 active revision 为准
- `启用`：勾选
- `推荐`：按产品需要决定

现在基础信息页会把这些字段放在“展示与兼容信息”区域里，表示：

- 它们仍然要维护，但主要用于目录展示、筛选和兼容回退
- 配置官方模型和日常修错时，优先关注默认启用 Profile 的 Active revision

### 图标区怎么用

- 基础信息页不再直接显示 `图标 URL` 输入框。
- 左侧图标卡片就是主入口：
  - 没有图标时，直接在卡片内点击 `上传图标`
  - 已有图标时，卡片显示预览，悬停可看到 `更换图标`
- 右侧保留：
  - `上传图标` / `更换图标`
  - `移除图标`
- 图标仍然会保存为模型的 `icon_url`，只是后台默认不再让管理员手填 URL。

### 端点标签推荐值

不是运行时真值，只是后台展示建议：

- OpenAI GPT Image 2 文生图：勾 `OpenAI generation`
- OpenAI GPT Image 2 参考图编辑：勾 `OpenAI edits`
- OpenAI Responses 图片工具：勾 `openai_responses_image`
- Gemini 官方图片模型：勾 `gemini_generate_content`
- 同一模型未来可能切协议时，可以同时勾多个标签

### 模型级回退参数说明

基础信息页底部的 `模型级回退参数` 已经降为兼容区：

- `/studio` 优先读取默认 active execution profile 的 `parameter_schema` 和 `default_params`
- 这里的 `默认参数 JSON / Studio 快捷参数 / Schema` 只在没有可用 default profile 时作为回退
- 正常配置官方图片模型时，不建议把这里当成主配置入口

## 4. 执行配置区怎么操作

执行配置区里，真正重要的是这几个概念：

- `Profile`：某个模型的一条可执行配置
- `Revision`：该配置的版本
- `Draft`：草稿，不会影响 Studio
- `Active`：已发布版本，Studio 实际使用它
- `Default`：该模型的主 profile，普通用户无参考图时自动用这条
- `Reference edit companion`：该模型在存在参考图时自动切换到的编辑 profile

标准操作顺序：

1. 如果模型还没有默认 Profile，优先使用 `一键生成默认 Profile`
2. 选择合适模板并生成首个 Draft revision
3. 检查 `adapter_key`、`upstream_model_id`、`parameter_schema`、`request_mapping`
4. 依次执行 `Lint`、`请求预览`、`Diff`、`Dry run`
5. 确认无误后点击 `发布`
6. 确认主 profile 是 `默认` 且 `启用`；如果同一模型还要支持参考图编辑，再单独配置 `Reference edit companion`

只要没有 `发布`，`/studio` 都不会切到新配置。

### 当前配置工作区怎么理解

新版执行配置区会先显示“当前配置工作区”，直接告诉你：

- 当前是否已经有默认可用 Profile
- 当前 Draft revision 是哪一个
- 当前 Active revision 是哪一个
- 下一步应该继续改 Draft，还是先基于 Active 新建 Draft

日常维护建议按下面做：

1. 先选中要维护的 Profile
2. 如果已经有 Draft，直接继续改当前 Draft
3. 如果只有 Active，没有 Draft，点 `基于当前 Active 新建 Draft`
4. 完成后执行 `Lint`、`预览请求`、`Diff`、`Dry run`
5. 确认无误再点击 `发布`

### 新版执行配置界面怎么理解

- `执行配置` 步骤：
  - 重点看 Profile 基础信息、当前 Draft、快捷参数和默认参数
  - 适合日常配置、修错和官方模板维护
- `发布检查` 步骤：
  - 重点看 `Lint / 预览请求 / Diff / Dry run / 发布`
  - 请求预览会直接显示 `runtime_supported / publishable / parser / publish_blockers`
- `模板导入`：
  - 默认折叠
  - 只有需要按模板重建 Draft 或导入 compatible 草稿时再展开
- `专家字段`：
  - `Profile 专家字段`、`Revision JSON`、`request_mapping`、`capabilities`、`validation_rules`、原始 revision 字段默认折叠
  - 只在需要协议级自定义、JSON 导入导出或排障时展开

### Draft / Active / 历史怎么处理

- `Draft`：
  - 可以直接修改
  - 现在可以直接删除
  - 删除后不会影响已发布版本
- `Active`：
  - 是当前 Studio 真正使用的版本
  - 不能直接删除
  - 修错时应该新建 Draft 或继续编辑现有 Draft，再重新发布覆盖
- `Archived`：
  - 只保留历史对照
  - 不直接删除

当前规则：

- 只允许删除 `Draft revision`
- 不提供 `Active revision` / `Archived revision` 删除
- 当前版本不提供 `Profile` 删除入口，主要通过 `默认 / 启用` 来控制是否参与运行时选择

## 5. OpenAI 官方怎么配

### 场景 A：`gpt-image-2` 单模型同时支持文生图和参考图编辑

适用：

- 当前使用 `gpt-image-2`
- 或未来仍兼容 OpenAI Image API `/v1/images/generations` 的官方模型

推荐配置：

- 模型表单：
  - `模型 ID`：`gpt-image-2`
  - `展示名称`：`GPT Image 2`
  - `参考图传递`：`none`
  - `端点标签`：至少勾 `OpenAI generation`；如果要支持参考图编辑，再同时勾 `OpenAI edits`
- 执行配置：
  - 先创建主 profile，名称可用 `OpenAI Image generation`
  - 主 profile 模板导入：`openai-image-generation-gpt-image-2`
  - 主 profile 的 `routing_role` 设为 `Primary generation`
  - 主 profile 的 `upstream_model_id`：保持 `gpt-image-2`
  - 主 profile 保持 `adapter_key=openai_images_generation`
  - 主 profile 发布后，设成 `默认` + `启用`
  - 再创建 companion edit profile，名称可用 `OpenAI Image edit`
  - edit profile 模板导入：`openai-image-edit-gpt-image-2`
  - edit profile 的 `routing_role` 设为 `Reference edit`
  - edit profile 的 `upstream_model_id`：保持 `gpt-image-2`
  - edit profile 保持 `adapter_key=openai_images_edit`
  - edit profile 发布后，保持 `启用`，但不要设成 `默认`

这样配置后：

- `/studio` 无参考图时会自动走 `OpenAI generation`
- `/studio` 上传参考图后会自动切到 `OpenAI edits`
- generation 和 edit 各自使用自己的 `parameter_schema` 和 `default_params`

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

- 明确使用 `gpt-image-2` 且希望单模型同时支持文生图和参考图编辑时，推荐同一模型下配一主一辅两条 profile：
  - `openai_images_generation` 作为默认主 profile
  - `openai_images_edit` 作为 `Reference edit companion`
- 明确使用需要 Responses image tool 的新官方模型时，优先 `openai_responses_image`
- 不要靠改 `endpoint_types` 来切协议，必须改默认 active profile

## 6. Gemini 官方怎么配

### 主线：`gemini-3-pro-image-preview`

当前 DreamStudio 对 Gemini 官方图片模型只支持 `generateContent`。

推荐配置：

- 模型表单：
  - `模型 ID`：填当前网关实际支持的 Gemini 图片模型 ID
  - `展示名称`：按实际模型名称填写
  - `厂商`：`Google`
  - `参考图传递`：`url`
  - `端点标签`：勾 `gemini_generate_content`
- 执行配置：
  - 新建 profile，名称可用 `Gemini generateContent image`
  - 模板导入：`gemini-generate-content-image`
  - `upstream_model_id`：改成真实 Gemini 官方模型 ID
  - 保持 `adapter_key=gemini_generate_content`
  - 检查 `request_mapping` 中：
    - Prompt -> `contents[0].parts[0].text`
    - `generationConfig.responseModalities=["IMAGE"]`
    - `generationConfig.imageConfig.aspectRatio`
    - `generationConfig.imageConfig.imageSize`
  - 发布后，把该 profile 设成 `默认` + `启用`

这样配置后：

- `/studio` 会按 Gemini generateContent 协议提交
- 支持参考图
- 后续 Gemini 新官方图片模型只需要改 `upstream_model_id`，不需要改代码

## 7. 发布前必须检查什么

每次改 revision，至少做这四步：

1. `Lint`
2. `请求预览`
3. `Diff`
4. `Dry run`

含义：

- `Lint`：检查 adapter、parser、allowed path、参数 schema、兼容字段门禁
- `请求预览`：确认最终脱敏请求结构正确
- `Diff`：看 draft 相比 active 改了什么
- `Dry run`：只确认能构造请求，不会真的打上游

注意：

- `Dry run` 通过不代表你的 new-api gateway 一定支持该官方协议
- 对 OpenAI Responses 和 Gemini generateContent，仍需要你自己确认网关实际兼容

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
- Gemini 官方图片模型：`gemini_generate_content`

## 9. 最常见的配置错误

- 只建了模型，没有建默认 active profile
- 建了 draft revision，但没有点击 `发布`
- profile 已发布，但没有设为 `默认`
- profile 是默认，但没有 `启用`
- `upstream_model_id` 还保留模板默认值，没改成真实模型 ID
- Gemini 模型配置了当前网关不支持的 `generateContent` 模型 ID
- 以为勾选 `endpoint_types` 就能切协议，实际上不会

## 10. 推荐最小操作清单

### 配 OpenAI GPT Image 2

1. 新增图片模型
2. 新建 profile
3. 导入 `openai-image-generation-gpt-image-2`
4. 确认 `upstream_model_id=gpt-image-2`
5. `Lint -> 预览 -> Diff -> Dry run -> 发布`
6. 设为默认启用

### 配 OpenAI Responses 官方模型

1. 新增图片模型
2. 新建 profile
3. 导入 `openai-responses-image-tool`
4. 改 `upstream_model_id`
5. `Lint -> 预览 -> Diff -> Dry run -> 发布`
6. 设为默认启用

### 配 Gemini 官方图片模型

1. 新增图片模型
2. 新建 profile
3. 导入 `gemini-generate-content-image`
4. 确认 `upstream_model_id` 为当前网关实际支持的 Gemini 图片模型 ID
5. `Lint -> 预览 -> Test -> 发布`
6. 设为默认启用
