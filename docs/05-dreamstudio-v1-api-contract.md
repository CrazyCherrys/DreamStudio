# DreamStudio v1 API 契约设计

本文档基于 `02-dreamstudio-v1-prd.md`、`03-dreamstudio-v1-architecture.md` 和 `04-dreamstudio-v1-data-model.md` 编写，用于指导前端、API、Worker 和测试用例实现。

当前版本状态：确认版。

第五阶段的目标是把已确认的产品边界、架构边界和数据模型转换为可开发的接口契约。本文档用于指导页面流程、开发里程碑和代码实现阶段。

---

## 1. 设计边界

### 1.1 v1 API 只覆盖

- DreamStudio 用户注册、登录和会话。
- 用户自己的 `new-api` 配置。
- 管理员代用户配置或重置 `new-api` 密钥。
- 固定模型类型、模型目录、模型收藏和模型参数 Schema。
- 参考图上传。
- AI 图片任务创建、查询、取消和重新提交。
- 结果图和参考图资产管理。
- 系统设置、存储设置、请求日志和审计日志。
- Worker 内部任务 payload。
- DreamStudio 调用 `new-api` 的上游契约。

### 1.2 v1 API 不覆盖

- DreamStudio 支付、订阅、订单和发票。
- `new-api` 账号注册、充值、渠道、倍率和成本。
- 视频生成接口。
- AI 对话接口。
- 团队空间、分享链接、模板市场和社区。
- 前端直接调用用户配置的 `new-api`。

### 1.3 上游接口依据

DreamStudio v1 对接 `new-api` 时，第一验收路径使用：

- `GET /v1/models`：连接测试和模型候选拉取。
- `POST /v1/images/generations`：文生图。
- `POST /v1/images/edits`：参考图、图生图或编辑。
- `POST /v1beta/models/{model}:generateContent`：Gemini 原生图片请求形状，由 `gemini_generate_content` adapter 构造。

Gemini 原生路径仍通过用户配置的 new-api bearer transport 调用；如果当前 new-api 网关不支持该路径，Gemini profile 必须保持禁用或不设为用户侧默认 profile。

参考依据：

- [QuantumNous/new-api](https://github.com/QuantumNous/new-api)
- [new-api 用户 API 文档](https://docs.newapi.pro/zh/docs/guide/feature-guide/user/api)
- [new-api OpenAI Image 文档](https://github.com/QuantumNous/new-api-docs/blob/main/docs/en/api/openai-image.md)

---

## 2. 通用约定

### 2.1 API 前缀

DreamStudio 后端 API 统一使用：

```text
/api/v1
```

健康检查可以不带业务前缀：

```text
/healthz
/readyz
```

### 2.2 数据格式

默认请求和响应：

- `Content-Type: application/json`
- `Accept: application/json`

上传文件接口：

- `multipart/form-data`

时间格式：

- ISO 8601 字符串。
- 示例：`2026-06-19T12:00:00.000Z`

ID 格式：

- PostgreSQL 主键使用 UUID。
- API 字段统一使用 snake_case。

### 2.3 认证方式

DreamStudio Web 端使用同站点 Cookie 会话。

建议 Cookie：

- `ds_session`：HttpOnly、Secure、SameSite=Lax。

规则：

- 不使用 localStorage 保存登录 token。
- 登录成功后由 API 设置 Cookie。
- 登出时 API 清理 Cookie，并撤销服务端会话。
- Redis 保存会话快速校验状态。
- PostgreSQL `user_sessions` 保存可审计会话记录。
- 被禁用用户的所有会话必须失效。

### 2.4 CSRF

使用 Cookie 会话时，非 GET 请求建议要求：

```text
X-CSRF-Token: <csrf_token>
```

规则：

- 登录后由 API 返回 CSRF token，前端保存在内存中。
- 页面刷新后，前端通过 `GET /api/v1/auth/me` 重新获取 CSRF token。
- 除注册、登录、刷新会话这类认证入口外，`POST`、`PUT`、`PATCH`、`DELETE` 需要校验 CSRF。
- 注册、登录和刷新会话接口必须校验 `Origin` 或 `Referer`，并配合登录限流。
- 纯服务端 Worker 内部任务不使用浏览器 Cookie，不需要 CSRF。

### 2.5 权限模型

角色：

- `user`
- `super_admin`

权限规则：

- 普通用户只能访问自己的配置、任务、资产和账号信息。
- 超级管理员可以访问管理后台接口。
- 超级管理员不能查看用户已保存的 `new-api` 密钥明文。
- 超级管理员查看完整 prompt 或完整参数快照必须写审计日志。
- 任何跨用户资源访问必须返回 `404` 或 `403`，实现时优先避免泄露资源是否存在。

---

## 3. 标准响应格式

### 3.1 成功响应

```json
{
  "success": true,
  "data": {},
  "request_id": "req_01hxyz"
}
```

### 3.2 失败响应

```json
{
  "success": false,
  "error": {
    "code": "validation_failed",
    "message": "参数校验失败",
    "details": [
      {
        "field": "prompt",
        "message": "prompt 不能为空"
      }
    ]
  },
  "request_id": "req_01hxyz"
}
```

### 3.3 分页响应

列表接口统一返回：

```json
{
  "success": true,
  "data": {
    "items": [],
    "pagination": {
      "page": 1,
      "page_size": 20,
      "total": 100,
      "total_pages": 5
    }
  },
  "request_id": "req_01hxyz"
}
```

分页查询参数：

- `page`：默认 `1`。
- `page_size`：默认 `20`，最大 `100`。

### 3.4 通用错误码

| code | HTTP | 说明 |
| --- | --- | --- |
| `unauthorized` | 401 | 未登录或会话失效 |
| `forbidden` | 403 | 无权限 |
| `not_found` | 404 | 资源不存在 |
| `validation_failed` | 400 | 参数校验失败 |
| `conflict` | 409 | 状态冲突或唯一约束冲突 |
| `rate_limited` | 429 | 触发限流 |
| `csrf_failed` | 403 | CSRF 校验失败 |
| `model_disabled` | 400 | 模型未启用或不可选 |
| `new_api_config_missing` | 400 | 用户未配置 `new-api` |
| `new_api_config_invalid` | 400 | 用户 `new-api` 配置异常 |
| `new_api_auth_failed` | 400 | `new-api` 密钥认证失败 |
| `new_api_quota_insufficient` | 400 | 疑似 `new-api` 额度不足 |
| `new_api_connection_failed` | 400 | `new-api` 服务不可达 |
| `task_not_cancelable` | 409 | 任务当前状态不可取消 |
| `storage_error` | 500 | 存储读写失败 |
| `internal_error` | 500 | 未分类服务端错误 |

---

## 4. 认证与账号接口

### 4.1 注册

```http
POST /api/v1/auth/register
```

请求：

```json
{
  "username": "alice",
  "password": "password",
  "display_name": "Alice"
}
```

响应：

```json
{
  "success": true,
  "data": {
    "user": {
      "id": "uuid",
      "username": "alice",
      "display_name": "Alice",
      "role": "user",
      "status": "active"
    },
    "csrf_token": "csrf_token"
  },
  "request_id": "req_01hxyz"
}
```

规则：

- 注册是否开放由 `registration_enabled` 控制。
- 用户名唯一。
- 密码只保存哈希。
- 注册成功后可直接登录并设置会话 Cookie。

### 4.2 登录

```http
POST /api/v1/auth/login
```

请求：

```json
{
  "username": "alice",
  "password": "password"
}
```

响应：

```json
{
  "success": true,
  "data": {
    "user": {
      "id": "uuid",
      "username": "alice",
      "display_name": "Alice",
      "role": "user",
      "status": "active"
    },
    "csrf_token": "csrf_token"
  },
  "request_id": "req_01hxyz"
}
```

规则：

- 被禁用用户不能登录。
- 登录成功更新 `last_login_at`。
- 管理员登录后台行为需要写审计日志。

### 4.3 登出

```http
POST /api/v1/auth/logout
```

规则：

- 撤销当前会话。
- 清理 `ds_session` Cookie。

### 4.4 当前用户

```http
GET /api/v1/auth/me
```

响应：

```json
{
  "success": true,
  "data": {
    "user": {
      "id": "uuid",
      "username": "alice",
      "display_name": "Alice",
      "role": "user",
      "status": "active"
    },
    "new_api_config_status": "valid",
    "csrf_token": "csrf_token"
  },
  "request_id": "req_01hxyz"
}
```

### 4.5 刷新会话

```http
POST /api/v1/auth/refresh
```

规则：

- 当前会话有效且未过期时延长会话。
- 默认登录态 30 天。
- 被禁用用户刷新失败，并撤销会话。
- 刷新成功后返回新的 CSRF token。

### 4.6 更新个人资料

```http
PATCH /api/v1/me/profile
```

请求：

```json
{
  "display_name": "Alice"
}
```

规则：

- 仅允许当前登录用户更新自己的展示名。
- `display_name` 允许留空，留空时回退为未设置展示名。
- 更新成功后返回最新 `AuthPayload`，用于刷新前端当前登录态。

### 4.7 修改密码

```http
PATCH /api/v1/me/password
```

请求：

```json
{
  "current_password": "old_password",
  "new_password": "new_password"
}
```

规则：

- 修改成功后建议撤销其他会话。
- 修改密码写审计日志。

---

## 5. 用户 new-api 配置接口

### 5.1 获取当前配置状态

```http
GET /api/v1/me/new-api-config
```

响应：

```json
{
  "success": true,
  "data": {
    "configured": true,
    "new_api_base_url": "https://new-api.example.com",
    "uses_custom_base_url": false,
    "masked_api_key": "sk-***abcd",
    "status": "valid",
    "last_tested_at": "2026-06-19T12:00:00.000Z",
    "last_test_error": null,
    "allow_custom_base_url": false,
    "default_new_api_base_url": "https://new-api.example.com"
  },
  "request_id": "req_01hxyz"
}
```

规则：

- 不返回 API 密钥明文。
- 管理员关闭自定义服务地址时，普通用户不能提交自定义 `new_api_base_url`。

### 5.2 保存或更新配置

```http
PUT /api/v1/me/new-api-config
```

请求：

```json
{
  "api_key": "sk-xxxxxxxx",
  "new_api_base_url": "https://new-api.example.com",
  "test_before_save": true
}
```

响应：

```json
{
  "success": true,
  "data": {
    "configured": true,
    "masked_api_key": "sk-***xxxx",
    "status": "valid",
    "last_tested_at": "2026-06-19T12:00:00.000Z",
    "last_test_error": null
  },
  "request_id": "req_01hxyz"
}
```

规则：

- `api_key` 新建时必填。
- 已有配置更新服务地址时，`api_key` 可省略，表示继续使用原密钥。
- `test_before_save` 默认 `true`。
- 测试失败时允许保存，但状态为 `invalid`。
- 保存或重置密钥必须写审计日志。
- 密钥使用 AES-256-GCM 加密保存。

### 5.3 测试配置

```http
POST /api/v1/me/new-api-config/test
```

请求：

```json
{
  "api_key": "sk-xxxxxxxx",
  "new_api_base_url": "https://new-api.example.com"
}
```

响应：

```json
{
  "success": true,
  "data": {
    "ok": true,
    "model_count": 128,
    "tested_at": "2026-06-19T12:00:00.000Z"
  },
  "request_id": "req_01hxyz"
}
```

规则：

- 如果请求中提供 `api_key`，只用于本次测试，不直接保存。
- 如果请求中不提供 `api_key`，使用已保存密钥测试。
- 连接测试调用上游 `GET /v1/models`。
- 测试请求使用 `Authorization: Bearer <api_key>`。
- 测试请求不发送 Anthropic 或 Gemini 特定请求头，优先获取 OpenAI 格式模型列表。

---

## 6. 普通用户模型接口

### 6.1 模型类型与筛选

模型类型固定为：

- `chat`
- `image`
- `video`

不再提供动态模型分类配置接口。`/api/v1/model-categories` 废弃，前端 Studio 使用固定筛选：全部、聊天、图片、视频、我的。

### 6.2 获取可用模型列表

```http
GET /api/v1/models?modality=image&q=gpt&favorite=false&recommended=true
```

查询参数：

- `modality`：可选，`chat | image | video`。
- `q`：可选，搜索展示名称、模型 ID、厂商和描述。
- `favorite`：可选，`true` 返回我的收藏，`false` 返回未收藏。
- `recommended`：可选，按推荐状态过滤。

响应：

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "uuid",
        "model_id": "gpt-image-1",
        "display_name": "GPT Image",
        "provider_name": "OpenAI",
        "modality": "image",
        "icon_url": "/api/v1/model-icons/example.png",
        "description": "适合高质量图片生成和编辑。",
        "endpoint_types": ["openai_image_generations", "openai_image_edits"],
        "supports_reference_image": true,
        "reference_transfer_mode": "multipart",
        "is_recommended": true,
        "is_favorite": false,
        "default_params": {
          "size": "1024x1024",
          "n": 1
        },
        "parameter_schema": [],
        "default_execution_profile": {
          "id": "profile_uuid",
          "revision_id": "revision_uuid",
          "operation": "text_to_image",
          "adapter_key": "openai_images_generation",
          "adapter_version": "1",
          "reference_transfer_mode": "none",
          "supports_reference_image": false,
          "max_reference_images": 0,
          "parameter_schema": [
            {
              "key": "size",
              "label": "分辨率",
              "type": "select",
              "required": false,
              "default": "1024x1024",
              "ui": {
                "group": "quick",
                "slot": "resolution",
                "order": 20
              }
            }
          ],
          "default_params": {
            "size": "1024x1024",
            "n": 1
          },
          "capabilities": {
            "supports_reference_image": false,
            "max_reference_images": 0
          }
        }
      }
    ]
  },
  "request_id": "req_01hxyz"
}
```

规则：

- 普通用户只看到启用模型。
- 对 `modality=image` 的模型，普通用户侧只展示有默认启用 profile 且存在 active revision 的模型。
- `default_execution_profile.parameter_schema` 是 Studio 渲染图片任务参数面板的优先来源，且必须保留 Schema v2 的 `ui.group`、`ui.slot`、`ui.order`。
- `default_execution_profile.default_params` 是 Studio 图片任务参数默认值的优先来源。
- 旧 `parameter_schema` 和 `default_params` 暂时保留给模型表单和分阶段迁移使用，不再作为图片模型的用户侧执行配置来源。
- `is_favorite` 只表示当前登录用户是否收藏。

### 6.2.1 收藏模型

```http
PUT /api/v1/models/{model_record_id}/favorite
DELETE /api/v1/models/{model_record_id}/favorite
```

规则：

- 要求登录。
- 非 GET 请求要求 CSRF。
- 只能收藏启用且未软删除模型。

### 6.3 获取模型详情

```http
GET /api/v1/models/{model_record_id}
```

规则：

- 只允许访问启用模型。
- 被禁用模型返回 `404` 或 `model_disabled`。

---

## 7. 参考图上传与资产接口

### 7.1 上传参考图

```http
POST /api/v1/assets/reference-images
Content-Type: multipart/form-data
```

表单字段：

- `file`：图片文件。

响应：

```json
{
  "success": true,
  "data": {
    "asset": {
      "id": "uuid",
      "kind": "reference_image",
      "status": "available",
      "mime_type": "image/png",
      "file_ext": "png",
      "size_bytes": 123456,
      "width": 1024,
      "height": 1024,
      "expires_at": "2026-06-20T00:00:00.000Z",
      "created_at": "2026-06-19T12:00:00.000Z"
    }
  },
  "request_id": "req_01hxyz"
}
```

规则：

- 默认支持 `image/png`、`image/jpeg`、`image/webp`。
- 参考图大小上限由 `system_settings.reference_image_max_mb` 控制，默认 10MB。
- 上传后立即保存到当前存储。
- 参考图默认按配置过期清理。
- 上传接口只创建参考图资产，不创建生图任务。
- `/studio` 结果区的“全部引用”和“重新编辑”不直接把 `result_image` ID 传入 `reference_asset_ids`；前端需要先读取用户自己的结果图下载 URL，作为文件重新调用本接口创建 `reference_image`，再把返回的参考图 ID 加入后续任务。

### 7.2 获取资产列表

```http
GET /api/v1/assets?kind=result_image&status=available&page=1&page_size=20
```

规则：

- 普通用户只能查看自己的资产。
- 默认不返回已删除资产。

### 7.3 获取资产详情

```http
GET /api/v1/assets/{asset_id}
```

规则：

- 不返回本地绝对路径、S3 secret、S3 object private 信息。
- 可以返回可展示的缩略图或预览 URL。

### 7.4 下载资产

```http
GET /api/v1/assets/{asset_id}/download
```

规则：

- 本地存储可由 API 流式返回文件。
- S3 存储可返回 302 到短期签名 URL，或由 API 代理下载。
- 不能直接暴露需要鉴权的私有对象地址。

### 7.5 删除资产

```http
DELETE /api/v1/assets/{asset_id}
```

规则：

- 删除后不可恢复。
- 需要同步删除物理文件。
- 删除失败时返回 `storage_error`，并保留资产记录状态供排查。

### 7.6 批量删除资产

```http
POST /api/v1/assets/batch-delete
```

请求：

```json
{
  "asset_ids": ["uuid", "uuid"]
}
```

规则：

- 前端必须二次确认。
- 后端逐个校验所有权。
- 响应需要包含成功和失败数量。

---

## 8. AI 图片任务接口

### 8.1 创建图片任务

```http
POST /api/v1/image-tasks
```

请求：

```json
{
  "model_record_id": "uuid",
  "execution_profile_id": "uuid",
  "prompt": "一只在月光下奔跑的白色狐狸",
  "negative_prompt": "low quality, blurry",
  "parameters": {
    "size": "1024x1024",
    "n": 1,
    "quality": "high"
  },
  "reference_asset_ids": ["uuid"],
  "client_request_id": "client_01hxyz"
}
```

响应：

```json
{
  "item": {
    "id": "uuid",
    "model_record_id": "uuid",
    "model_id": "gpt-image-1",
    "endpoint_type": "openai_image_edits",
    "execution_profile_id": "profile_uuid",
    "execution_profile_revision_id": "revision_uuid",
    "execution_profile_name": "OpenAI Image generation",
    "adapter_key": "openai_images_generation",
    "adapter_version": "1",
    "prompt_summary": "一只在月光下奔跑的白色狐狸",
    "negative_prompt_summary": "low quality, blurry",
    "sanitized_parameter_snapshot": {
      "size": "1024x1024",
      "n": 1,
      "quality": "high"
    },
    "resolved_request_sanitized_snapshot": {
      "adapter_key": "openai_images_generation",
      "adapter_version": "1",
      "transport_key": "new_api_bearer",
      "endpoint_type": "openai_image_generations",
      "endpoint_path": "/v1/images/generations",
      "content_type": "json",
      "body": {
        "model": "gpt-image-1",
        "prompt": "一只在月光下奔跑的白色狐狸",
        "size": "1024x1024",
        "n": 1,
        "quality": "high"
      },
      "profile": {
        "id": "profile_uuid",
        "revision_id": "revision_uuid",
        "operation": "text_to_image"
      }
    },
    "reference_asset_ids": ["uuid"],
    "status": "pending",
    "error_code": null,
    "error_message": null,
    "client_request_id": "client_01hxyz",
    "queued_at": "2026-06-19T12:00:00.000Z",
    "started_at": null,
    "completed_at": null,
    "created_at": "2026-06-19T12:00:00.000Z",
    "updated_at": "2026-06-19T12:00:00.000Z",
    "deleted_at": null,
    "result_assets": []
  },
}
```

规则：

- 用户必须拥有 `valid` 状态的 `new-api` 配置。
- 模型必须启用。
- 如果不传 `execution_profile_id`，后端使用模型默认启用 profile。
- 创建任务必须找到 active profile revision，否则返回 `model_profile_missing`。
- 后端必须按 active profile revision 的 `parameter_schema` 做最终校验。
- 后端先合并 active revision 的 `default_params` 和用户提交参数，再保存 `parameter_snapshot` 和 `sanitized_parameter_snapshot`。
- 参考图必须属于当前用户且状态为 `available`。
- 不支持参考图的 profile 不能提交 `reference_asset_ids`，参考图数量不能超过 profile 的 `max_reference_images`。
- 创建任务时保存模型、接口、服务地址、参数、profile/revision、adapter、request mapping 和最终脱敏请求快照。
- prompt 和 negative prompt 完整内容加密保存。
- 队列 payload 中只放任务 ID 等非敏感信息。
- `client_request_id` 用于防止前端重试重复创建任务。
- 同一用户重复提交相同 `client_request_id` 时，后端应返回第一次创建的任务，而不是创建新任务。

### 8.2 获取任务列表

```http
GET /api/v1/image-tasks?status=pending&model_record_id=uuid&page=1&page_size=20
```

查询参数：

- `status`：可选，任务状态。
- `model_record_id`：可选，按当前用户拥有的指定模型记录过滤；格式必须是 UUID。
- `page`：可选，默认 `1`。
- `page_size`：可选，默认 `20`，最大 `100`。

规则：

- 普通用户只能查看自己的任务。
- 设置 `model_record_id` 时仍按当前用户过滤，不会返回其他用户任务。
- 默认按 `created_at desc` 排序。
- 默认排除软删除任务。

### 8.3 获取任务详情

```http
GET /api/v1/image-tasks/{task_id}
```

响应重点：

- 任务基础信息。
- 任务状态。
- 失败摘要。
- 关联参考图资产。
- 关联结果图资产。
- 参数脱敏快照。

规则：

- 普通用户不直接获取加密完整 prompt。
- 管理员查看完整 prompt 走日志受限接口，不走普通任务详情。

### 8.4 取消任务

```http
POST /api/v1/image-tasks/{task_id}/cancel
```

规则：

- `pending` 任务可取消。
- API 需要尝试从 BullMQ 移除 job 或标记为不可执行。
- 成功后任务状态为 `canceled`。
- `running` 任务 v1 返回 `task_not_cancelable`。
- v1 不做“前端假取消”状态，避免任务状态和上游真实执行状态不一致。

### 8.5 重新提交任务

```http
POST /api/v1/image-tasks/{task_id}/retry
```

规则：

- 只允许重新提交 `failed`、`timeout`、`canceled` 任务。
- 重新提交会复制原任务的 prompt、参数和参考图，使用当前仍启用的原模型记录创建一个新任务，并重新生成任务快照。
- 如果原模型已禁用，仍不允许用旧模型重新提交，返回 `model_disabled`。
- 如果用户 `new-api` 配置无效，返回 `new_api_config_invalid`。

### 8.6 删除任务

```http
DELETE /api/v1/image-tasks/{task_id}
```

规则：

- v1 可做软删除。
- 删除任务不强制删除已生成资产。
- 前端如需删除资产，应调用资产删除接口。

---

## 9. 管理员用户接口

所有管理接口都要求 `super_admin`。

### 9.1 用户列表

```http
GET /api/v1/admin/users?status=active&keyword=alice&page=1&page_size=20
```

响应字段：

- 用户基础信息。
- 用户状态。
- 最近登录时间。
- `new-api` 配置状态。
- 密钥掩码。

规则：

- 不返回密钥明文。

### 9.2 用户详情

```http
GET /api/v1/admin/users/{user_id}
```

### 9.3 更新用户状态

```http
PATCH /api/v1/admin/users/{user_id}/status
```

请求：

```json
{
  "status": "disabled"
}
```

规则：

- 禁用用户后必须撤销现有会话。
- 启用、禁用、软删除用户必须写审计日志。

### 9.4 重置用户密码

```http
POST /api/v1/admin/users/{user_id}/reset-password
```

请求：

```json
{
  "new_password": "new_password"
}
```

规则：

- 重置成功后撤销该用户现有会话。
- 必须写审计日志。

### 9.5 代用户配置 new-api 密钥

```http
PUT /api/v1/admin/users/{user_id}/new-api-config
```

请求：

```json
{
  "api_key": "sk-xxxxxxxx",
  "new_api_base_url": "https://new-api.example.com",
  "test_before_save": true
}
```

规则：

- 管理员可以代用户配置或替换密钥。
- 管理员仍不能读取已保存密钥明文。
- 如果 `test_before_save` 为 `true`，保存前调用 `GET /v1/models`。
- 操作必须写审计日志。

### 9.6 清空用户 new-api 配置

```http
DELETE /api/v1/admin/users/{user_id}/new-api-config
```

规则：

- 清空后用户不能提交新任务。
- 历史任务和日志保留原服务地址快照。
- 操作必须写审计日志。

---

## 10. 管理员模型接口

### 10.1 模型分类配置废弃

以下接口废弃，不再作为当前实现要求：

```http
GET /api/v1/admin/model-categories
POST /api/v1/admin/model-categories
PATCH /api/v1/admin/model-categories/{category_id}
DELETE /api/v1/admin/model-categories/{category_id}
```

模型类型固定为 `chat | image | video`，管理员只在模型目录中选择类型。

### 10.2 模型管理

```http
GET /api/v1/admin/models
POST /api/v1/admin/models
GET /api/v1/admin/models/{model_record_id}
PATCH /api/v1/admin/models/{model_record_id}
DELETE /api/v1/admin/models/{model_record_id}
```

`GET /api/v1/admin/models` 支持查询参数：

- `q`
- `modality`
- `endpoint_type`
- `enabled`
- `recommended`
- `missing_profile`

创建或更新请求核心字段：

```json
{
  "modality": "image",
  "model_id": "gpt-image-1",
  "display_name": "GPT Image",
  "provider_name": "OpenAI",
  "icon_url": "/api/v1/model-icons/example.png",
  "description": "适合高质量图片生成和编辑。",
  "endpoint_types": ["openai_image_generations", "openai_image_edits"],
  "reference_transfer_mode": "multipart",
  "supports_reference_image": true,
  "is_enabled": true,
  "is_recommended": true,
  "sort_order": 10,
  "default_params": {
    "size": "1024x1024",
    "n": 1
  },
  "parameter_schema": []
}
```

规则：

- `modality` 只允许 `chat`、`image`、`video`。
- `endpoint_types` 至少包含一个端点，可同时包含生成和编辑。
- `parameter_schema` 必须能被前端渲染，也必须能被后端校验。
- `openai_image_generations` 默认不需要参考图。
- `openai_image_edits` 通常需要参考图或 mask 类文件能力。
- `gemini_generate_content` 用于 Gemini 原生 `generateContent` profile；默认种子 profile 保持禁用，管理员确认网关支持后才能启用。

管理员列表响应中的每个模型现在额外包含：

```json
{
  "management_summary": {
    "profile_count": 1,
    "draft_revision_count": 1,
    "active_revision_count": 1,
    "latest_draft_profile_id": "uuid-or-null",
    "latest_draft_revision_id": "uuid-or-null",
    "has_default_active_profile": true
  }
}
```

说明：

- `management_summary` 只用于后台 `/admin/models` 的状态提示和快捷管理。
- 普通用户侧运行时真值仍以 `default_execution_profile` 为准。

### 10.2.1 上传模型图标

```http
POST /api/v1/admin/model-icons
Content-Type: multipart/form-data
```

表单字段：

- `file`：JPG、PNG、WebP、GIF 或 SVG。

响应：

```json
{
  "success": true,
  "data": {
    "url": "/api/v1/model-icons/filename.png"
  },
  "request_id": "req_01hxyz"
}
```

### 10.3 执行 Profile 管理

```http
GET /api/v1/admin/models/{model_record_id}/execution-profiles
POST /api/v1/admin/models/{model_record_id}/execution-profiles
GET /api/v1/admin/execution-profiles/{profile_id}
PATCH /api/v1/admin/execution-profiles/{profile_id}
DELETE /api/v1/admin/execution-profiles/{profile_id}
```

Profile 请求核心字段：

```json
{
  "name": "OpenAI Image generation",
  "operation": "text_to_image",
  "adapter_key": "openai_images_generation",
  "adapter_version": "1",
  "transport_key": "new_api_bearer",
  "upstream_model_id": "gpt-image-2",
  "upstream_endpoint_path": "/v1/images/generations",
  "reference_transfer_mode": "none",
  "supports_reference_image": false,
  "max_reference_images": 0,
  "parameter_schema": [],
  "default_params": {},
  "request_mapping": {},
  "response_parser_key": "openai_image_data",
  "capabilities": {},
  "validation_rules": {},
  "is_default": true,
  "is_enabled": true,
  "sort_order": 10
}
```

规则：

- 全部要求 `super_admin`；写操作要求 CSRF。
- 一个模型可以有多个 profile，但普通用户侧只自动使用默认启用 profile。
- 将某个 profile 设为默认时，服务端会取消同模型其他 profile 的默认标记。
- 删除 profile 是软删除，同时取消默认和启用状态。

### 10.4 执行 Profile Revision 管理

```http
GET /api/v1/admin/execution-profiles/{profile_id}/revisions
POST /api/v1/admin/execution-profiles/{profile_id}/revisions
POST /api/v1/admin/execution-profiles/{profile_id}/revisions/import-template/{template_id}
PATCH /api/v1/admin/execution-profile-revisions/{revision_id}
POST /api/v1/admin/execution-profile-revisions/{revision_id}/lint
POST /api/v1/admin/execution-profile-revisions/{revision_id}/preview-request
POST /api/v1/admin/execution-profile-revisions/{revision_id}/test
GET /api/v1/admin/execution-profile-revisions/{revision_id}/diff
POST /api/v1/admin/execution-profile-revisions/{revision_id}/activate
GET /api/v1/admin/profile-templates
```

Revision 请求核心字段和 Admin UI 导出的 JSON 形态一致：

```json
{
  "source_kind": "imported_json",
  "source_url": null,
  "source_checked_at": null,
  "source_summary": "Imported profile revision JSON.",
  "adapter_key": "gemini_generate_content",
  "adapter_version": "1",
  "transport_key": "new_api_bearer",
  "upstream_model_id": "gemini-2.5-flash-image",
  "upstream_endpoint_path": "/v1beta/models/gemini-2.5-flash-image:generateContent",
  "reference_transfer_mode": "url",
  "supports_reference_image": true,
  "max_reference_images": 8,
  "parameter_schema": [],
  "default_params": {},
  "request_mapping": {
    "content_type": "json",
    "fields": [{ "source": "prompt", "target": "contents[0].parts[0].text" }]
  },
  "response_parser_key": "gemini_inline_data",
  "capabilities": {},
  "validation_rules": {},
  "change_summary": "Imported from revision JSON."
}
```

规则：

- 创建 revision 总是生成 `draft`，不会直接影响用户侧任务。
- 模板导入只创建 draft revision；OpenAI-compatible copy 会把来源改为 `third_party_docs` 并要求管理员审阅字段。
- Admin UI 支持导出当前 revision JSON，也支持粘贴 revision JSON 导入为新的 draft revision。
- 发布 revision 前应先运行 lint、请求预览、dry-run test 和 diff。
- Activate 会把同 profile 的旧 active revision 归档，并把目标 revision 发布为 active。

---

## 11. 管理员系统设置接口

### 11.1 获取系统设置

```http
GET /api/v1/admin/system-settings
```

返回设置：

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
- `reference_image_max_mb`
- `result_image_max_mb`

### 11.2 更新系统设置

```http
PATCH /api/v1/admin/system-settings
```

请求：

```json
{
  "default_new_api_base_url": "https://new-api.example.com",
  "allow_user_custom_new_api_base_url": false,
  "image_task_timeout_seconds": 600,
  "image_task_max_attempts": 3,
  "reference_image_max_mb": 10,
  "result_image_max_mb": 25
}
```

规则：

- 更新默认 `new-api` 地址必须写审计日志。
- 更新是否允许用户自定义服务地址必须写审计日志。
- 更新任务超时和重试配置必须写审计日志。
- 更新参考图和结果图大小上限必须写审计日志。

---

## 12. 管理员存储设置接口

### 12.1 获取当前存储设置

```http
GET /api/v1/admin/storage-settings
```

规则：

- 返回当前生效存储配置。
- S3 access key 和 secret key 只返回掩码或配置状态。
- 不返回密钥明文。

### 12.2 更新存储设置

```http
PUT /api/v1/admin/storage-settings
```

请求示例：

```json
{
  "driver": "s3",
  "s3_endpoint": "https://s3.example.com",
  "s3_region": "auto",
  "s3_input_bucket": "dreamstudio-input",
  "s3_output_bucket": "dreamstudio-output",
  "s3_input_prefix": "input/",
  "s3_output_prefix": "output/",
  "s3_public_base_url": "https://cdn.example.com",
  "s3_access_key_id": "access_key",
  "s3_secret_access_key": "secret_key",
  "reference_retention_hours": 12,
  "result_retention_hours": 12
}
```

规则：

- S3 密钥必须加密保存。
- 更新后新上传文件使用新配置。
- 历史资产按资产记录中的 `storage_driver`、`bucket` 和 `object_key` 读取。
- 修改存储配置必须写审计日志。

### 12.3 测试存储设置

```http
POST /api/v1/admin/storage-settings/test
```

规则：

- 可以测试当前已保存配置。
- 也可以测试请求中临时传入的配置。
- 临时传入的 S3 密钥不保存。

---

## 13. 管理员日志接口

### 13.1 请求日志列表

```http
GET /api/v1/admin/request-logs?status=failed&user_id=uuid&task_id=uuid&model_id=gpt-image-1&page=1&page_size=20
```

默认返回：

- 请求用户。
- 任务 ID。
- 模型 ID。
- 接口类型。
- 状态。
- HTTP 状态码。
- 耗时。
- 错误摘要。
- prompt 摘要。
- 脱敏参数。
- 创建时间。

规则：

- 不返回完整 Authorization Header。
- 不返回用户 `new-api` 密钥。

### 13.2 请求日志详情

```http
GET /api/v1/admin/request-logs/{log_id}
```

规则：

- 默认只返回摘要和脱敏字段。

### 13.3 查看完整 prompt

```http
POST /api/v1/admin/request-logs/{log_id}/reveal-prompt
```

规则：

- 需要 `super_admin`。
- 必须写审计日志。
- 响应只返回本次查看结果，不在前端长期缓存。

### 13.4 查看完整参数快照

```http
POST /api/v1/admin/request-logs/{log_id}/reveal-params
```

规则：

- 需要 `super_admin`。
- 必须写审计日志。
- 响应需要继续脱敏密钥类字段。

### 13.5 审计日志列表

```http
GET /api/v1/admin/audit-logs?action=admin_set_user_new_api_key&actor_user_id=uuid&page=1&page_size=20
```

规则：

- 审计日志只允许超级管理员查看。
- 审计日志不记录密钥明文。

---

## 14. Worker 内部契约

### 14.1 image-generation 队列 payload

队列名：

```text
image-generation
```

payload：

```json
{
  "job_version": 1,
  "task_id": "uuid",
  "user_id": "uuid",
  "enqueued_at": "2026-06-19T12:00:00.000Z",
  "client_request_id": "client_01hxyz"
}
```

规则：

- payload 不包含 prompt 明文。
- payload 不包含 `new-api` 密钥。
- payload 不包含完整参数。
- Worker 必须从 PostgreSQL 重新读取任务、模型快照、用户配置和资产信息。
- Worker 解密密钥只存在内存中，不写日志。

### 14.2 asset-cleanup 队列 payload

队列名：

```text
asset-cleanup
```

payload：

```json
{
  "job_version": 1,
  "asset_kind": "reference_image",
  "before": "2026-06-19T12:00:00.000Z",
  "limit": 500
}
```

规则：

- Worker 扫描过期资产。
- 删除物理文件。
- 更新资产状态和 `cleaned_at`。
- 写入 `cleanup_runs`。

### 14.3 Worker 状态流转

任务状态流转：

```text
pending -> running -> succeeded
pending -> running -> failed
pending -> running -> timeout
pending -> canceled
```

规则：

- Worker 开始执行前必须确认任务仍为 `pending`。
- 任务已 `canceled` 时直接跳过。
- 每次尝试都写 `image_task_attempts`。
- 每次上游调用都写 `request_logs`。
- 最终成功后创建结果图资产。

---

## 15. DreamStudio 调用 new-api 契约

### 15.1 连接测试和模型拉取

```http
GET {new_api_base_url}/v1/models
Authorization: Bearer <user_or_temp_api_key>
```

规则：

- 用于用户密钥测试。
- 用于管理员拉取模型候选。
- 不发送聊天请求，避免消耗用户额度。
- 默认按 OpenAI 格式解析返回。

### 15.2 文生图

```http
POST {new_api_base_url}/v1/images/generations
Authorization: Bearer <user_api_key>
Content-Type: application/json
```

请求由模型配置和任务参数组装：

```json
{
  "model": "gpt-image-1",
  "prompt": "prompt",
  "n": 1,
  "size": "1024x1024",
  "quality": "high",
  "response_format": "b64_json"
}
```

规则：

- 只传递模型 Schema 允许的参数。
- 不把 DreamStudio 内部字段传给 `new-api`。
- 请求超时由系统设置控制。

### 15.3 图像编辑或参考图模式

v1 第一验收路径优先使用 multipart 参考图上传。

```http
POST {new_api_base_url}/v1/images/edits
Authorization: Bearer <user_api_key>
Content-Type: multipart/form-data
```

表单字段由模型配置决定：

- `model`
- `prompt`
- `image` 或 `image[]`
- `mask`
- `n`
- `size`
- `quality`
- 其他 Schema 允许字段

规则：

- `multipart` 模式下 Worker 从存储读取参考图后上传。
- `url` 模式仅在模型 Schema 明确声明上游字段支持图片 URL 时启用。
- `url` 模式下 Worker 传递可被 `new-api` 访问的参考图 URL，具体请求格式由模型 Schema 的字段映射决定。
- 如果模型不支持参考图，不能调用 edits 路径。

### 15.4 结果解析

`new-api` 可能返回：

- `data[].url`
- `data[].b64_json`
- `candidates[].content.parts[].inlineData.data`
- `data[].revised_prompt`
- `usage`

规则：

- `url` 结果必须由 Worker 下载后保存到 DreamStudio storage。
- `b64_json` 结果必须由 Worker 解码后保存到 DreamStudio storage。
- Gemini `inlineData.data` 结果会按 `b64_json` 形态进入同一保存链路。
- DreamStudio 不依赖上游 URL 作为长期资产地址。
- `usage` 可以保存到请求日志脱敏参数或后续扩展字段，v1 不做成本计算。

### 15.4.1 Gemini generateContent 图片请求

```http
POST {new_api_base_url}/v1beta/models/{model}:generateContent
Authorization: Bearer <user_api_key>
Content-Type: application/json
```

请求由 `gemini_generate_content` adapter 和 profile `request_mapping` 构造：

```json
{
  "contents": [
    {
      "parts": [
        { "text": "prompt" },
        {
          "inlineData": {
            "data": "base64-reference-image",
            "mimeType": "image/png"
          }
        }
      ]
    }
  ],
  "generationConfig": {
    "responseModalities": ["IMAGE"],
    "imageConfig": {
      "aspectRatio": "16:9",
      "imageSize": "2K"
    }
  }
}
```

规则：

- DreamStudio 不直接保存 Gemini 官方 API key；v1 仍使用用户配置的 new-api bearer transport。
- Gemini profile 默认不设为用户侧默认 profile，且种子 profile 默认 disabled。
- 只有在管理员确认 new-api 网关支持该原生路径后，才应启用 Gemini profile。
- 参考图会作为 `contents[0].parts[]` 中的 `inlineData` 追加。

### 15.5 错误映射

| 上游情况 | DreamStudio 错误码 | 是否自动重试 |
| --- | --- | --- |
| 网络错误 | `new_api_connection_failed` | 是 |
| DNS 临时失败 | `new_api_connection_failed` | 是 |
| 请求超时 | `new_api_connection_failed` | 是 |
| HTTP 401 | `new_api_auth_failed` | 否 |
| HTTP 403 | `new_api_auth_failed` | 否 |
| HTTP 400 参数错误 | `validation_failed` | 否 |
| HTTP 404 模型不存在 | `model_disabled` | 否 |
| HTTP 429 | `rate_limited` | 是 |
| HTTP 5xx | `new_api_connection_failed` | 是 |
| 疑似额度不足 | `new_api_quota_insufficient` | 否 |

规则：

- 上游错误详情需要脱敏后保存。
- 不记录完整 Authorization Header。
- 密钥错误时用户配置可标记为 `invalid`。

---

## 16. 安全与脱敏规则

### 16.1 永不返回的字段

API 响应永不返回：

- `encrypted_api_key`
- `key_iv`
- `key_tag`
- `DREAMSTUDIO_SECRET_KEY`
- S3 secret key 明文。
- 完整 Authorization Header。
- 本地存储绝对路径。

### 16.2 默认脱敏字段

默认只返回：

- `masked_api_key`
- `prompt_summary`
- `negative_prompt_summary`
- `sanitized_parameter_snapshot`
- `sanitized_params`

### 16.3 需要审计的接口

必须写审计日志：

- 用户自行保存或重置密钥。
- 管理员代用户配置或清空密钥。
- 管理员启用、禁用、软删除用户。
- 管理员重置用户密码。
- 管理员修改系统设置。
- 管理员修改存储设置。
- 管理员查看完整 prompt。
- 管理员查看完整参数快照。

---

## 17. 前端集成规则

### 17.1 页面启动

前端启动后调用：

```http
GET /api/v1/auth/me
```

分流规则：

- 未登录进入登录或注册页。
- 已登录但未配置有效 `new-api` 进入密钥配置引导。
- 已登录且配置有效进入 AI 创作台。
- `super_admin` 可进入管理后台。
- `GET /api/v1/auth/me` 返回的 CSRF token 保存在前端内存中，用于后续非 GET 请求。

### 17.2 创作台加载

创作台加载顺序：

1. `GET /api/v1/me/new-api-config`
2. `GET /api/v1/models`
3. 前端使用固定筛选和搜索框过滤模型。
4. 用户选择模型后加载 `GET /api/v1/image-tasks?model_record_id={id}&page=1&page_size=50`。
5. 用户选择模型后按 `parameter_schema` 渲染底部 Prompt 子容器内的参数控件。

### 17.3 任务状态刷新

v1 基线方案：

- 创建任务后前端轮询任务详情或任务列表。
- 推荐轮询间隔 2 到 5 秒。
- 任务进入终态后停止轮询。

终态：

- `succeeded`
- `failed`
- `timeout`
- `canceled`

### 17.4 表单校验

前端负责：

- 基于 `parameter_schema` 做即时校验。
- 禁止提交明显非法参数。
- 切换模型时移除不兼容参数。

后端负责：

- 做最终可信校验。
- 拒绝绕过前端的非法请求。

---

## 18. v1 API 验收标准

第五阶段接口契约确认后，v1 API 至少需要满足：

- 用户可以注册、登录、登出、刷新会话和修改密码。
- 用户可以保存、测试和更新自己的 `new-api` 密钥。
- 管理员可以代用户配置或清空 `new-api` 密钥。
- 密钥明文不会被任何查询接口返回。
- 用户连接测试使用 `GET /v1/models`。
- 管理员可以拉取 `new-api` 模型候选，但不会自动暴露给普通用户。
- 管理员可以维护固定类型模型、模型启用状态、图标、描述、端点能力和参数 Schema。
- 普通用户可以上传参考图。
- 普通用户可以创建图片任务。
- Worker 可以通过队列 payload 执行任务。
- 任务可以查询、取消和重新提交。
- 结果图可以保存、展示、下载和删除。
- 管理员可以查看请求日志和审计日志。
- 查看完整 prompt 或完整参数快照必须记录审计。
- 所有跨用户数据访问都受到后端权限校验。
