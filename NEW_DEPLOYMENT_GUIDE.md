# DreamStudio 新设备部署完整指南

## 🎯 问题回答

**问题：** 如果已经将最新代码提交到GitHub上，在新设备上clone代码，直接build镜像再使用外部PG17和Redis，启动项目后，会出现上述问题吗？

**答案：是的，仍然会出现问题！** ⚠️

---

## 📊 问题分析

### 为什么会出现问题？

```
┌─────────────────────────────────────────────────────────┐
│ 新设备部署流程                                            │
├─────────────────────────────────────────────────────────┤
│ 1. git clone 代码                        ✅ 包含代码     │
│ 2. docker build 镜像                     ✅ 包含迁移脚本 │
│ 3. 连接外部 PG17 + Redis                 ✅ 数据库连接   │
│ 4. docker-compose up -d                  ✅ 启动应用     │
│    ├─ 自动执行迁移脚本                    ✅ 创建所有表   │
│    ├─ 创建管理员账号                      ✅ 创建admin    │
│    └─ 生成配置文件                        ✅ 生成config   │
│                                                          │
│ ❌ 但是：admin_model_settings 配置数据不会自动创建！      │
└─────────────────────────────────────────────────────────┘
```

### 核心问题

| 内容 | 是否在代码仓库中 | 是否自动创建 | 说明 |
|------|----------------|------------|------|
| **代码** | ✅ 是 | ✅ 自动 | Git clone 获取 |
| **迁移脚本** | ✅ 是 | ✅ 自动 | `backend/migrations/*.sql` |
| **表结构** | ❌ 否 | ✅ 自动 | 通过迁移脚本创建 |
| **管理员账号** | ❌ 否 | ✅ 自动 | 通过初始化流程创建 |
| **应用配置数据** | ❌ 否 | ❌ **不会自动创建** | `admin_model_settings` 等 |

---

## 🔍 详细说明

### 什么会自动创建？

#### 1. 数据库表结构 ✅

**自动创建的表：**
```sql
-- 通过 backend/migrations/*.sql 自动创建
users                    -- 用户表
accounts                 -- 上游账号表
api_keys                 -- API密钥表
groups                   -- 分组表
proxies                  -- 代理表
settings                 -- 配置表 ← 表结构会创建
usage_logs               -- 使用记录表
image_generation_tasks   -- 图片生成任务表
video_generation_tasks   -- 视频生成任务表
... 等50+张表
```

**执行时机：**
```go
// backend/internal/setup/setup.go:278-298
func initializeDatabase(cfg *SetupConfig) error {
    // 自动应用所有迁移脚本
    return repository.ApplyMigrations(ctx, db)
}
```

#### 2. 管理员账号 ✅

**自动创建：**
```go
// backend/internal/setup/setup.go:301-360
func createAdminUser(cfg *SetupConfig) error {
    // 检查是否已存在管理员
    // 如果不存在，创建管理员账号
    admin := &service.User{
        Email:    cfg.Admin.Email,
        Role:     service.RoleAdmin,
        Balance:  0,
    }
    // 插入到 users 表
}
```

**配置来源：**
```bash
# deploy/.env
ADMIN_EMAIL=admin@dreamstudio.local
ADMIN_PASSWORD=  # 留空自动生成
```

### 什么不会自动创建？ ❌

#### 1. admin_model_settings 配置数据

**问题：**
```sql
-- settings 表会创建 ✅
CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
);

-- 但是表中的数据不会自动插入 ❌
-- 特别是 admin_model_settings 这个关键配置
INSERT INTO settings (key, value) VALUES ('admin_model_settings', '{...}');  -- 不会执行
```

**为什么不会自动创建？**

1. **设计理念：** 迁移脚本只负责表结构，不负责业务数据
2. **环境差异：** 不同环境的模型配置可能不同
3. **安全考虑：** 避免硬编码敏感配置

**影响：**
- ❌ 前端显示模型ID而非友好名称
- ❌ 4K分辨率功能不工作

#### 2. 其他应用配置

**不会自动创建的配置：**
```sql
-- settings 表中的其他配置项
newapi_base_url          -- NewAPI 服务地址
newapi_access_key        -- NewAPI 访问密钥
prompt_optimization      -- Prompt 优化配置
generation_timeout       -- 生成超时配置
... 等
```

这些配置需要通过**管理后台手动配置**或**脚本导入**。

---

## 🚀 新设备部署完整流程

### 标准部署流程（会遇到问题）

```bash
# 1. Clone 代码
git clone https://github.com/your-repo/DreamStudio.git
cd DreamStudio

# 2. 配置环境变量
cd deploy
cp .env.example .env
nano .env  # 编辑数据库连接信息

# 3. 启动服务
docker-compose up -d

# 4. 查看日志
docker-compose logs -f dreamstudio

# 应该看到：
# ✅ Database connection successful
# ✅ Database initialized successfully
# ✅ Admin user created: admin@dreamstudio.local
# ✅ Auto setup completed successfully!

# 5. 访问前端
# http://localhost:8080

# ❌ 问题出现：
# - 模型下拉框显示 ID 而非名称
# - 4K 分辨率生成 1K 图片
```

### 正确的部署流程（避免问题）✅

```bash
# 1-4 步同上...

# 5. 初始化配置数据（新增步骤）
cd /path/to/DreamStudio
./import_model_settings.sh --default

# 或者从旧环境导入
./import_model_settings.sh /path/to/model_settings.json

# 6. 重启应用（如果需要）
cd deploy
docker-compose restart dreamstudio

# 7. 验证部署
./diagnose_deployment.sh

# 应该看到：
# ✅ admin_model_settings 配置存在
# ✅ 配置的模型数量: 4

# 8. 访问前端测试
# - 模型下拉框显示友好名称 ✅
# - 4K 分辨率正常工作 ✅
```

---

## 💡 解决方案对比

### 方案1：手动配置（不推荐）

**步骤：**
1. 部署应用
2. 登录管理后台
3. 手动配置每个模型的 display_name、request_endpoint、resolutions 等
4. 保存配置

**缺点：**
- ❌ 耗时长（每个模型都要配置）
- ❌ 容易出错（配置项多）
- ❌ 不可重复（每次部署都要重新配置）

### 方案2：使用导入脚本（推荐）✅

**步骤：**
1. 部署应用
2. 运行导入脚本：`./import_model_settings.sh --default`
3. 重启应用
4. 完成

**优点：**
- ✅ 快速（1分钟内完成）
- ✅ 准确（预定义配置）
- ✅ 可重复（脚本化）

### 方案3：集成到部署流程（最佳）⭐

**创建启动脚本：**

```bash
#!/bin/bash
# deploy/start.sh

# 启动应用
docker-compose up -d

# 等待应用启动
echo "等待应用启动..."
sleep 10

# 检查是否需要初始化配置
if ! docker-compose exec -T postgres psql -U dreamstudio -d dreamstudio -c \
  "SELECT 1 FROM settings WHERE key = 'admin_model_settings';" &>/dev/null; then
    echo "首次部署，初始化配置..."
    cd ..
    ./import_model_settings.sh --default
    cd deploy
    docker-compose restart dreamstudio
fi

echo "部署完成！"
```

---

## 📋 部署检查清单

### 部署前

- [ ] 准备外部 PostgreSQL 17 数据库
- [ ] 准备外部 Redis 数据库
- [ ] 配置 `.env` 文件
- [ ] 确认数据库连接信息正确

### 部署中

- [ ] `git clone` 代码
- [ ] `docker-compose build` 构建镜像
- [ ] `docker-compose up -d` 启动服务
- [ ] 查看日志确认启动成功
- [ ] 确认数据库迁移完成

### 部署后（关键步骤）⚠️

- [ ] **运行 `./diagnose_deployment.sh` 诊断**
- [ ] **运行 `./import_model_settings.sh --default` 导入配置**
- [ ] 重启应用
- [ ] 再次运行诊断确认配置存在
- [ ] 测试前端功能
- [ ] 测试 4K 图片生成

### 验证

- [ ] 前端模型下拉框显示友好名称
- [ ] 4K 分辨率生成正确尺寸图片
- [ ] 所有模型都能正常工作
- [ ] 管理后台可以访问

---

## 🔧 自动化部署脚本

我已经为您创建了 `init_config.sh` 脚本，可以集成到部署流程中：

```bash
#!/bin/bash
# init_config.sh - 自动初始化配置

# 检查是否已配置
if docker-compose exec -T postgres psql -U dreamstudio -d dreamstudio -c \
  "SELECT 1 FROM settings WHERE key = 'admin_model_settings';" &>/dev/null; then
    echo "配置已存在，跳过初始化"
    exit 0
fi

echo "首次部署检测到，开始初始化配置..."
./import_model_settings.sh --default
```

**使用方法：**

```bash
# 部署后运行
cd /path/to/DreamStudio
./init_config.sh
```

---

## 📊 总结

### 问题根源

```
代码仓库 (GitHub)
    ├─ 代码 ✅
    ├─ 迁移脚本 ✅
    └─ 配置数据 ❌ ← 不在代码仓库中

新设备部署
    ├─ Clone 代码 ✅
    ├─ Build 镜像 ✅
    ├─ 执行迁移 ✅ → 创建表结构
    ├─ 创建管理员 ✅
    └─ 配置数据 ❌ → 需要手动导入
```

### 解决方案

| 方案 | 时间 | 难度 | 推荐度 |
|------|------|------|--------|
| 手动配置 | 30分钟 | 高 | ⭐ |
| 使用导入脚本 | 1分钟 | 低 | ⭐⭐⭐⭐⭐ |
| 集成到部署流程 | 5分钟（一次性） | 中 | ⭐⭐⭐⭐ |

### 最佳实践

1. **首次部署：** 使用 `./import_model_settings.sh --default`
2. **后续部署：** 从旧环境导出配置，导入到新环境
3. **自动化：** 将初始化脚本集成到部署流程中

---

## ✅ 快速修复命令

**如果您已经部署但遇到问题，执行以下命令快速修复：**

```bash
cd /path/to/DreamStudio

# 1. 诊断问题
./diagnose_deployment.sh

# 2. 导入默认配置
./import_model_settings.sh --default

# 3. 重启应用
cd deploy && docker-compose restart dreamstudio

# 4. 验证修复
cd .. && ./diagnose_deployment.sh
```

**预计耗时：2-3分钟**

---

## 🎯 关键要点

1. **代码仓库包含：** 代码 + 迁移脚本
2. **自动创建：** 表结构 + 管理员账号
3. **不会自动创建：** 应用配置数据（admin_model_settings）
4. **解决方案：** 部署后运行 `./import_model_settings.sh --default`
5. **预计时间：** 1-2分钟完成配置导入

**即使从GitHub clone最新代码，仍然需要手动导入配置数据！**
