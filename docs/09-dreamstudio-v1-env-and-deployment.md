# DreamStudio v1 环境变量、部署与运维文档

本文档基于 `03-dreamstudio-v1-architecture.md`、`06-dreamstudio-v1-ia-and-roadmap.md` 和 `08-dreamstudio-v1-implementation-plan.md` 编写，用于在正式编码前明确 DreamStudio v1 的环境变量、Docker Compose 形态、单容器进程模型、初始化流程、存储挂载、云 PostgreSQL/Redis 接入、主密钥风险和可选备份建议。

当前版本状态：确认版。

第九阶段的目标是避免开发阶段出现“代码能跑但部署说不清”的问题。本文档确认后，DreamStudio v1 可以进入 M0 项目骨架编码阶段。

---

## 1. 部署目标

### 1.1 v1 部署形态

DreamStudio v1 采用：

```text
一个 dreamstudio 应用容器 + PostgreSQL + Redis + Storage
```

其中：

- `dreamstudio` 应用容器内部运行 Web、API 和 Worker 逻辑进程。
- PostgreSQL 可以使用 Docker Compose 本地服务，也可以使用云 PostgreSQL。
- Redis 可以使用 Docker Compose 本地服务，也可以使用云 Redis。
- Storage 可以使用本地 volume，也可以使用 S3 兼容对象存储。

### 1.2 v1 不采用

v1 不采用：

- `dreamstudio-web` 独立部署容器。
- `dreamstudio-api` 独立部署容器。
- `dreamstudio-worker` 独立部署容器。
- Kubernetes。
- 多副本 Worker 横向扩容。
- 内置自动备份服务。

说明：

- Web/API/Worker 是逻辑模块，不是 v1 的三个部署单元。
- 当任务量增长时，可以后续再把 Worker 拆出为独立容器。

---

## 2. 环境变量分层

### 2.1 启动级环境变量

环境变量只保存应用启动所需配置和主密钥。

必须环境变量：

| 变量 | 说明 | 示例 |
| --- | --- | --- |
| `DATABASE_URL` | PostgreSQL 连接串 | `postgresql://dreamstudio:password@postgres:5432/dreamstudio` |
| `REDIS_URL` | Redis 连接串 | `redis://redis:6379/0` |
| `DREAMSTUDIO_SECRET_KEY` | AES-256-GCM 主密钥 | 32 bytes base64 或 hex |
| `COOKIE_SECRET` | Cookie/session 签名密钥 | 随机高强度字符串 |
| `APP_BASE_URL` | DreamStudio 外部访问地址 | `https://studio.example.com` |
| `NODE_ENV` | 运行环境 | `production` |

推荐环境变量：

| 变量 | 说明 | 默认建议 |
| --- | --- | --- |
| `PORT` | 应用入口端口 | `3000` |
| `API_PORT` | API 内部端口 | `3001` |
| `WEB_PORT` | Web 内部端口 | `3000` |
| `LOCAL_STORAGE_ROOT` | 本地存储根路径 | `/data` |
| `LOG_LEVEL` | 日志等级 | `info` |
| `TRUST_PROXY` | 是否信任反向代理 | `false` |

### 2.2 不放入长期环境变量的配置

以下配置不作为长期环境变量维护：

- 默认 `new-api` 服务地址。
- 是否允许用户自定义 `new-api` 服务地址。
- 存储驱动。
- 本地参考图路径。
- 本地结果图路径。
- S3 endpoint。
- S3 region。
- S3 bucket。
- S3 access key。
- S3 secret key。
- S3 public base URL。
- 任务超时时间。
- 任务重试次数。
- 日志保留时间。

这些配置通过：

- 初始化系统设置。
- 管理员后台。
- 数据库 `system_settings`。
- 数据库 `storage_settings`。

进行管理。

### 2.3 为什么 S3 不走长期环境变量

原因：

- S3 密钥需要加密保存。
- 管理员需要在后台修改存储配置。
- 历史资产需要按资产记录中的 driver、bucket、object key 读取。
- 环境变量变更需要重启容器，不适合业务配置。

允许例外：

- 初次部署可以通过初始化脚本导入默认存储配置。
- 初始化完成后，存储配置以数据库和后台为准。

---

## 3. 密钥要求

### 3.1 DREAMSTUDIO_SECRET_KEY

用途：

- 加密用户 `new-api` API 密钥。
- 加密 S3 access key。
- 加密 S3 secret key。
- 加密完整 prompt。
- 加密完整参数快照。

要求：

- 生产环境必须设置。
- 不能写入镜像。
- 不能提交到 Git。
- 不能打印到日志。
- 如果运维方选择备份数据库，也应同步安全备份该主密钥。

建议格式：

```text
base64 encoded 32 bytes
```

示例生成命令：

```bash
openssl rand -base64 32
```

### 3.2 主密钥丢失后果

如果 `DREAMSTUDIO_SECRET_KEY` 丢失：

- 已保存用户 `new-api` 密钥不可恢复。
- 已保存 S3 密钥不可恢复。
- 已加密 prompt 和参数不可恢复。
- 用户需要重新填写密钥。
- 管理员需要重新配置 S3 密钥。

如果运维方选择备份数据库，数据库备份和主密钥备份应成对管理。

### 3.3 COOKIE_SECRET

用途：

- Cookie 或 session 签名。

要求：

- 生产环境必须设置。
- 长度建议不低于 32 字节随机值。
- 轮换后现有登录态可能失效。

---

## 4. 单容器进程模型

### 4.1 容器内部进程

`dreamstudio` 容器内部运行：

- Web 进程：Next.js Web。
- API 进程：NestJS API。
- Worker 进程：BullMQ Worker。

### 4.2 进程管理要求

要求：

- entrypoint 启动三个逻辑进程。
- Web/API/Worker 日志输出到 stdout/stderr。
- 任一关键进程退出时，容器整体退出。
- Docker restart policy 负责拉起容器。
- Worker 崩溃不能静默失败。

### 4.3 健康检查

接口：

```text
/healthz
/readyz
```

`/healthz` 检查：

- API 进程仍可响应。
- Web 入口可访问。

`/readyz` 检查：

- PostgreSQL 可连接。
- Redis 可连接。
- 必要系统设置存在。
- 当前存储配置存在。

说明：

- `/healthz` 用于容器存活。
- `/readyz` 用于判断是否可接收业务流量。

---

## 5. Docker Compose 形态

### 5.1 本地完整 Compose

本地开发或小规模部署可以包含：

```text
dreamstudio
postgres
redis
```

适用：

- 本地开发。
- 内网测试。
- 小规模单机部署。

### 5.2 云 PostgreSQL 和云 Redis Compose

如果使用云 PostgreSQL 和云 Redis，Compose 只需要：

```text
dreamstudio
```

并通过：

- `DATABASE_URL`
- `REDIS_URL`

连接外部服务。

### 5.3 本地存储 volume

本地存储建议挂载：

```text
/data
```

默认目录：

```text
/data/image/input
/data/image/output
```

规则：

- 本地存储路径不能只存在容器临时层。
- 生产环境必须挂载 volume 或宿主机目录。
- 如果运维方选择备份本地文件，需要备份 `/data`。

---

## 6. 初始化流程

### 6.1 首次启动需要完成

首次启动需要支持：

1. 检查环境变量。
2. 执行数据库迁移。
3. 初始化默认系统设置。
4. 初始化默认存储配置。
5. 创建默认超级管理员。
6. 输出初始化结果。

### 6.2 默认系统设置

需要初始化：

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

### 6.3 默认存储配置

默认可以初始化为本地存储：

- driver：`local`
- input path：`/data/image/input`
- output path：`/data/image/output`
- reference retention hours：`12`
- result retention hours：`12`

### 6.4 默认超级管理员

需要提供一种创建默认超级管理员的方式。

推荐环境变量：

- `INITIAL_ADMIN_USERNAME`
- `INITIAL_ADMIN_PASSWORD`

规则：

- 仅在没有任何超级管理员时生效。
- 初始化完成后应提示管理员修改密码。
- 不应在日志中打印密码。

---

## 7. PostgreSQL 部署要求

### 7.1 版本

v1 使用：

```text
PostgreSQL 17
```

### 7.2 数据库要求

要求：

- 支持 UUID。
- 支持 JSONB。
- 支持 partial unique index。
- 时区使用 UTC。

### 7.3 连接串

示例：

```text
postgresql://dreamstudio:password@postgres:5432/dreamstudio?schema=public
```

云 PostgreSQL 可能需要：

```text
sslmode=require
```

### 7.4 迁移

规则：

- Prisma migration 管理常规表结构。
- partial unique index 使用 raw migration。
- 生产迁移前建议按运维策略备份数据库，但备份不作为 v1 强制验收项。
- 迁移失败不得自动清库。

---

## 8. Redis 部署要求

### 8.1 用途

Redis 用于：

- BullMQ 队列。
- 队列锁。
- 会话或 refresh token 状态。
- 短期任务状态缓存。
- 速率限制计数。

### 8.2 连接串

本地示例：

```text
redis://redis:6379/0
```

带密码示例：

```text
redis://:password@redis.example.com:6379/0
```

TLS 示例：

```text
rediss://:password@redis.example.com:6380/0
```

### 8.3 规则

- Redis 不作为长期业务数据的唯一来源。
- Redis 数据丢失后，长期业务状态应能从 PostgreSQL 恢复。
- BullMQ 队列数据丢失可能影响 pending 任务，需要后续补偿扫描机制。

---

## 9. 存储配置

### 9.1 本地存储

本地存储适合：

- 开发环境。
- 测试环境。
- 小规模单机部署。

要求：

- `LOCAL_STORAGE_ROOT` 指向持久化挂载目录。
- 默认路径为 `/data`。
- input/output 子目录由初始化或应用自动创建。

### 9.2 S3 兼容存储

S3 配置通过管理员后台写入 `storage_settings`。

需要支持：

- endpoint。
- region。
- input bucket。
- output bucket。
- input prefix。
- output prefix。
- public base URL。
- access key。
- secret key。
- reference retention hours。
- result retention hours。

规则：

- access key 和 secret key 必须加密入库。
- 查询接口只返回掩码或配置状态。
- 修改存储配置必须写审计日志。

### 9.3 存储切换

规则：

- 新上传文件使用当前生效存储配置。
- 历史资产按 `assets` 表中的 driver、bucket、object_key 读取。
- 切换存储不自动迁移历史文件。

---

## 10. 反向代理与 HTTPS

### 10.1 推荐

生产环境推荐使用反向代理终止 HTTPS：

- Nginx。
- Caddy。
- 云负载均衡。
- Cloudflare Tunnel。

### 10.2 Cookie 要求

生产环境：

- Cookie 必须 `Secure`。
- `SameSite=Lax`。
- `HttpOnly`。

如果使用反向代理：

- 设置 `TRUST_PROXY=true`。
- 正确传递 `X-Forwarded-Proto`。
- 正确传递 `X-Forwarded-For`。

---

## 11. 日志与保留

### 11.1 容器日志

要求：

- 输出到 stdout/stderr。
- 不打印密钥。
- 不打印完整 Authorization Header。
- 带 request id。
- Worker 日志带 task id。

### 11.2 业务日志

数据库保留：

- 请求日志默认 180 天。
- 审计日志默认 365 天。

配置位置：

- `system_settings.request_log_retention_hours`
- `system_settings.audit_log_retention_hours`

---

## 12. 可选备份与恢复建议

### 12.1 备份策略

v1 不强制要求生产部署必须配置备份，备份不作为 v1 强制验收项。

如果运维方选择备份，建议覆盖：

- PostgreSQL 数据库。
- `DREAMSTUDIO_SECRET_KEY`。
- 本地存储 `/data`，如果使用本地存储。
- S3 bucket 数据，按对象存储服务能力配置。

### 12.2 PostgreSQL 备份示例

```bash
pg_dump "$DATABASE_URL" > dreamstudio-$(date +%F).sql
```

### 12.3 PostgreSQL 恢复示例

```bash
psql "$DATABASE_URL" < dreamstudio-2026-06-19.sql
```

### 12.4 本地文件备份

```bash
tar -czf dreamstudio-data-$(date +%F).tar.gz /data
```

### 12.5 恢复注意

恢复时建议保证：

- 数据库和 `/data` 文件来自一致时间点。
- 数据库和 `DREAMSTUDIO_SECRET_KEY` 匹配。
- 如果主密钥不匹配，已加密内容不可恢复。

---

## 13. 最小部署验收

部署完成后必须验证：

- `/healthz` 正常。
- `/readyz` 正常。
- 可以创建超级管理员。
- 可以登录后台。
- 可以配置默认 `new-api` 服务地址。
- 可以配置用户 `new-api` 密钥。
- 可以通过 `/v1/models` 测试连接。
- 可以配置至少一个图片模型。
- 可以使用本地存储上传参考图。
- 可以提交文生图任务。
- Worker 能执行任务。
- 结果图保存到资产仓库。

---

## 14. 第九阶段确认项

以下部署策略已确认：

- 环境变量只保存启动级配置，S3 和业务设置走后台与数据库。
- 默认本地存储根路径为 `/data`。
- 初始化默认本地存储路径为 `/data/image/input` 和 `/data/image/output`。
- 通过 `INITIAL_ADMIN_USERNAME` 和 `INITIAL_ADMIN_PASSWORD` 创建初始超级管理员。
- v1 不要求生产部署必须配置备份，备份不作为强制验收项；文档仅保留可选备份建议和主密钥丢失风险说明。
