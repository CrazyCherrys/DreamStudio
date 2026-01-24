# DreamStudio 修改规范（必读）

本文件是每次修改前的必读规范，未阅读不得开始改动。

## 部署方式（强制）

- 统一使用 `docker-compose` 部署与运行项目。
- 不直接在宿主机运行服务进程；如需新增/调整服务，必须反映在 compose 配置中。

## 数据库连接（强制）

- 内网数据库（开发/内网）：
  - PostgreSQL：`postgresql://root:Swiss5Rebirth9suburbinapt@192.168.3.14:33090/dreamstudio?sslmode=disable`
  - Redis：`redis://:Swiss5Rebirth9suburbinapt@192.168.3.14:6379/0`
- 切换数据库时必须同步更新 `deploy/.env` 并重启服务；如内网数据库为空，需清理 `/app/data/config.yaml` 与 `/app/data/.installed` 触发自动初始化。


## 热更新与重启（强制）

- 若修改内容可被热更新（例如前端资源或支持热重载的后端变更），**不要**重启项目。
- 若修改无法热更新（例如依赖变更、构建产物、配置文件、数据库迁移），**必须**重启相关服务或项目。

## 复用 sub2api（强制）

- sub2api 是成熟系统，优先复用其已有功能、结构与实现方式，避免重复造轮子。
- 新功能或改造应先评估能否直接迁移或复用 sub2api 中的模块与组件。

## 业务规则（已确认）

- 计费不在 DreamStudio 内处理；用户在 NewAPI 自行创建令牌，仅需填写 Token。
- NewAPI 默认 Base URL：`https://api.haokun.de`
- NewAPI 地址：`https://api.haokun.de/`，密钥：`sk-rftx7tVVNy9KSh6Juk36zMyau0tfdGJhVMsvXipm67Jtncye`
- 管理员可在后台开启/关闭"允许用户自定义 API 地址与 Key"的能力。
- 模型列表通过 NewAPI 接口获取，无需本地维护固定模型清单。
- 用户 Token 明文存储（按当前需求实现）。
- 图片存储支持本地或 S3 兼容存储：
  - Access Key: `8aavp12t`
  - Secret Key: `hphcl5mv5vkmgwm6`
  - Internal: `object-storage.objectstorage-system.svc.cluster.local`
  - External: `objectstorageapi.gzg.sealos.run`
  - Bucket: `8aavp12t-dreamstudio-img`
- 用户允许删除自己图片。
- 图片广场由用户决定是否公开。
- 图片生成需要支持文生图与图生图。
- AI 视频生成功能：
  - 使用 Sora 格式请求，参考文档：`https://docs.newapi.ai/zh/docs/api/ai-model/videos/sora/createvideo`
  - 接口地址：`POST /v1/videos`（NewAPI）
  - 支持异步任务处理：用户提交视频生成请求后即可关闭网页，系统在后台处理任务
  - 任务状态持久化：用户再次打开网页时能够查看已提交任务的生成状态和结果
  - 需要实现任务状态查询接口：`GET /v1/videos/{id}` 用于获取任务状态
  - 需要实现视频内容获取接口：`GET /v1/videos/{id}/content` 用于获取生成的视频内容
- 无配额/限额，不需要邮箱验证。

## 变更记录要求（强制）

- 每次修改完成后，必须同步更新：
  - `docs/dreamstudio-features.md`（功能清单）
  - `docs/sub2api-to-dreamstudio-changes.md`（变更记录）
- 变更记录至少包含：日期、变更摘要、涉及路径、是否需要重启。
- 仅调整文档或配置也需要记录。
