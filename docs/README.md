# DreamStudio 文档索引

本文档用于说明当前有效文档，避免维护人员阅读到过期内容后偏离开发方向。

## 当前有效文档

- `01-dreamstudio-v1-product-shape.md`：v1 产品形态与关键决策，是当前方向的基础文档。
- `02-dreamstudio-v1-prd.md`：v1 PRD 确认版，用于指导架构设计、数据模型、接口契约和开发里程碑。
- `03-dreamstudio-v1-architecture.md`：v1 架构设计确认版，定义 DreamStudio 单容器部署、Web/API/Worker 逻辑模块、PostgreSQL、Redis 和存储边界。
- `04-dreamstudio-v1-data-model.md`：v1 数据模型确认版，定义 PostgreSQL 表、枚举、索引、关系和 Prisma 映射注意事项。
- `05-dreamstudio-v1-api-contract.md`：v1 API 契约确认版，定义 Web/API/Worker/new-api 调用边界、接口路径、响应格式、权限和脱敏规则。
- `06-dreamstudio-v1-ia-and-roadmap.md`：v1 页面流程、信息架构与开发里程碑确认版，定义路由、页面职责、关键交互和开发顺序。
- `07-dreamstudio-v1-ui-design-system.md`：v1 UI 视觉方向与组件规范确认版，定义视觉定位、布局、组件、状态、动效和可访问性规则。
- `08-dreamstudio-v1-implementation-plan.md`：v1 实施计划与开发任务拆分确认版，定义 M0-M7 任务、验收标准、风险和开发顺序。
- `09-dreamstudio-v1-env-and-deployment.md`：v1 环境变量、部署与运维确认版，定义启动变量、Compose 形态、初始化、存储、反向代理、主密钥风险和可选备份建议。
- `10-dreamstudio-m1-auth-task-list.md`：M1 认证与用户基础开发任务清单，用于 M0 验收后进入注册、登录、会话、CSRF 和路由守卫开发准备。

## 已清理文档

- `00-dreamstudio-project-questionnaire.md`：原始立项问卷已删除。该文档包含早期未收敛答案，继续保留会干扰后续开发方向。
- `02-dreamstudio-v1-prd-question-list.md`：第二阶段问答清单已删除。有效结论已合并进 PRD、架构和数据模型文档。

## 维护规则

- 当新文档已经替代旧文档时，应删除旧文档，或者将旧文档内容合并进当前有效文档后再删除。
- 每次新增规划文档后，需要更新本索引。
- 当前开发方向以编号靠后的有效文档为准，但不得与 `01-dreamstudio-v1-product-shape.md` 中的核心边界冲突。
