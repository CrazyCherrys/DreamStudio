# DreamStudio 文档索引

本文档用于说明当前有效文档，避免维护人员阅读到过期内容后偏离开发方向。

## 当前有效文档

- Studio 当前 UI 规则以 `07`、`12` 和 `14` 中更新后的描述为准：右侧为开放画布，Prompt 子容器位于底部中间且不铺满，快捷参数只来自当前模型已配置的 `parameter_schema`。

- `01-dreamstudio-v1-product-shape.md`：v1 产品形态与关键决策，是当前方向的基础文档。
- `02-dreamstudio-v1-prd.md`：v1 PRD 确认版，用于指导架构设计、数据模型、接口契约和开发里程碑。
- `03-dreamstudio-v1-architecture.md`：v1 架构设计确认版，定义 DreamStudio 单容器部署、Web/API/Worker 逻辑模块、PostgreSQL、Redis 和存储边界。
- `04-dreamstudio-v1-data-model.md`：v1 数据模型确认版，定义 PostgreSQL 表、枚举、索引、关系和 Prisma 映射注意事项。
- `05-dreamstudio-v1-api-contract.md`：v1 API 契约确认版，定义 Web/API/Worker/new-api 调用边界、接口路径、响应格式、权限和脱敏规则。
- `06-dreamstudio-v1-ia-and-roadmap.md`：v1 页面流程、信息架构与开发里程碑确认版，定义路由、页面职责、关键交互和开发顺序。
- `07-dreamstudio-v1-ui-design-system.md`：v1 UI 视觉方向与组件规范确认版，定义当前默认暗色主题、布局、组件、状态、动效和可访问性规则。
- `08-dreamstudio-v1-implementation-plan.md`：v1 实施计划与开发任务拆分确认版，定义 M0-M7 任务、验收标准、风险、开发顺序和当前暗色 UI 扩展规则。
- `09-dreamstudio-v1-env-and-deployment.md`：v1 环境变量、部署与运维确认版，定义启动变量、Compose 形态、初始化、存储、反向代理、主密钥风险和可选备份建议。
- `10-dreamstudio-m1-auth-task-list.md`：M1 认证与用户基础开发任务清单，用于 M0 验收后进入注册、登录、会话、CSRF 和路由守卫开发准备。
- `11-dreamstudio-m2-new-api-config-task-list.md`：M2 new-api 配置与系统设置开发任务清单，用于 M1 完成后进入用户密钥配置、连接测试、系统设置和管理员代配置开发准备。
- `12-dreamstudio-m3-model-catalog-task-list.md`：M3 模型目录与参数 Schema 开发任务清单，用于 M2 完成后进入模型分类、模型管理、模型候选快照和参数 Schema 表单开发准备。
- `13-dreamstudio-m4-storage-assets-task-list.md`：M4 存储、资产与上传开发任务清单，用于 M3 完成后进入本地/S3 存储、参考图上传、资产库、下载/删除和清理队列开发验收。
- `14-dreamstudio-m5-image-task-worker-task-list.md`：M5 图片任务与 Worker 主闭环开发任务清单，用于 M4 完成后进入图片任务提交、new-api 图片调用、结果图存储入库和任务页面开发验收。
- `15-dreamstudio-m6-admin-logs-task-list.md`：M6 管理后台与日志审计完善开发任务清单，用于 M5 完成后进入用户管理、请求日志、敏感内容 reveal 和审计日志页面开发验收。
- `16-dreamstudio-model-adapter-execution-profile-plan.md`：多模型生图适配层实施方案，用于后续将 OpenAI 官方模型、Gemini 官方模型和 OpenAI-compatible 模型统一包装为异步图片任务，并通过 execution profile、revision、request mapping 和 adapter registry 管理模型参数差异。

## 已清理文档

- `00-dreamstudio-project-questionnaire.md`：原始立项问卷已删除。该文档包含早期未收敛答案，继续保留会干扰后续开发方向。
- `02-dreamstudio-v1-prd-question-list.md`：第二阶段问答清单已删除。有效结论已合并进 PRD、架构和数据模型文档。

## 维护规则

- 当新文档已经替代旧文档时，应删除旧文档，或者将旧文档内容合并进当前有效文档后再删除。
- 每次新增规划文档后，需要更新本索引。
- 当前开发方向以编号靠后的有效文档为准，但不得与 `01-dreamstudio-v1-product-shape.md` 中的核心边界冲突。
