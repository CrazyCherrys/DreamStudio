# DreamStudio 文档索引

本文档用于说明当前有效文档，避免维护人员阅读到过期内容后偏离开发方向。

## 当前有效文档

- Studio 当前 UI 规则以 `07`、`12` 和 `14` 中更新后的描述为准：右侧为开放画布，Prompt 子容器位于底部中间且不铺满，只保留最外层边框；第一行是左侧放大参考图预览和右侧无边框文本输入，第二行是从参考图下方开始向右排列的操作 rail，快捷参数主态使用图标加数值，且只来自当前模型已配置的 `parameter_schema`；`张数` 提供 `1-9 + 自定义` 的快捷选择层，但最终仍受当前模型 schema 的范围约束；左侧模型选择和快捷参数覆写值都保存在浏览器本地，其中模型选择按当前可见模型恢复，快捷参数按 `model_id + execution_profile_revision_id` 分桶；右侧画布始终绑定当前模型最新一批任务，提交后立即按本次张数生成一组方形占位卡片，完成后原位替换为图片，失败态也保留在最新 batch 中；最新 batch 使用紧凑作品组展示，顶部为小封面、Prompt 和低高度参数胶囊，结果摘要只保留结果图张数/返回进度，不重复显示参数里的 `张数`；小封面有参考图时显示 2-3 张叠卡预览并支持 hover 提示“点击可复用照片”，点击后将该任务整组参考图替换到当前上传照片区域，无参考图时回退为首张结果图；图片区单图/多图都保持小卡片，点击后打开大图预览，底部提供低高度的全部引用、重新编辑、再次生成、全部下载、删除操作；桌面端使用紧凑工作台比例，左侧模型栏约 `280px`，底部 Prompt 子容器约占右侧画布 `60%` 到 `65%`，避免标题、按钮和输入器压迫画布；快捷参数浮层和左上任务列表均支持点击外部自动关闭。
- 用户后台当前路由以 `06-dreamstudio-v1-ia-and-roadmap.md` 的最新描述为准：主路径为 `/console/*`，旧的 `/settings/*`、`/studio/tasks*`、`/studio/assets` 仅保留兼容重定向。

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
- `17-dreamstudio-model-adapter-execution-profile-task-list.md`：多模型生图适配层执行任务清单，用于按阶段落地 `16` 的设计，明确每阶段要阅读的资料、本地代码 seam、修复计划、验证命令和面向小白的手动测试步骤。
- `18-dreamstudio-model-onboarding-guide.md`：模型接入指南，用于说明 OpenAI 官方、OpenAI-compatible、Gemini 官方模型的 profile/revision/template 接入流程，以及 Revision JSON 导入导出和新增协议开发边界。
- `19-dreamstudio-admin-model-configuration-guide.md`：后台模型配置手册，用于说明管理员如何在 `/admin/models` 中把 OpenAI 官方和 Gemini 官方图片模型配置成 `/studio` 可用的默认 active profile。

## 已清理文档

- `00-dreamstudio-project-questionnaire.md`：原始立项问卷已删除。该文档包含早期未收敛答案，继续保留会干扰后续开发方向。
- `02-dreamstudio-v1-prd-question-list.md`：第二阶段问答清单已删除。有效结论已合并进 PRD、架构和数据模型文档。

## 维护规则

- 当新文档已经替代旧文档时，应删除旧文档，或者将旧文档内容合并进当前有效文档后再删除。
- 每次新增规划文档后，需要更新本索引。
- 当前开发方向以编号靠后的有效文档为准，但不得与 `01-dreamstudio-v1-product-shape.md` 中的核心边界冲突。
