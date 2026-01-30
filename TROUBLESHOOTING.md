# DreamStudio 新设备部署故障排查指南

## 问题描述

在新设备上克隆代码并重新构建后，管理员账号无法创建，无法登录系统。

---

## 快速诊断

### 方法 1: 使用诊断脚本（推荐）

```bash
cd /path/to/DreamStudio
./diagnose_new_deployment.sh
```

脚本会自动检查：
- ✅ Git 代码版本
- ✅ 迁移脚本内容
- ✅ Docker 镜像和容器状态
- ✅ 数据库连接和表结构
- ✅ 管理员账号是否存在
- ✅ 环境变量配置

### 方法 2: 手动排查

按以下步骤逐一检查：

---

## 排查步骤

### 1️⃣ 检查代码版本

```bash
cd /path/to/DreamStudio
git log --oneline -1 backend/migrations/005_schema_parity.sql
```

**预期输出**:
```
4dfe64c fix: add missing created_at column to settings table
```

**如果不是这个版本**:
```bash
git pull origin main
```

---

### 2️⃣ 检查迁移脚本内容

```bash
grep -A 6 "CREATE TABLE IF NOT EXISTS settings" backend/migrations/005_schema_parity.sql
```

**预期输出**（必须包含 `created_at` 字段）:
```sql
CREATE TABLE IF NOT EXISTS settings (
    id          BIGSERIAL PRIMARY KEY,
    key         VARCHAR(100) NOT NULL UNIQUE,
    value       TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),  ← 必须有这一行
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**如果缺少 `created_at` 字段**:
- 代码版本不对，执行 `git pull origin main`

---

### 3️⃣ 检查容器日志

```bash
docker logs dreamstudio --tail 100 | grep -i "admin\|error\|created_at"
```

**查找关键信息**:

✅ **成功标志**:
```
Admin user created: admin@dreamstudio.local
Auto setup completed successfully!
```

❌ **失败标志**:
```
column "created_at" of relation "settings" does not exist
Auto setup failed: default settings initialization failed
```

---

### 4️⃣ 检查数据库表结构

```bash
# 替换为你的数据库连接信息
docker run --rm postgres:15-alpine psql \
  "postgresql://USER:PASSWORD@HOST:PORT/dreamstudio" \
  -c "\d settings"
```

**预期输出**（必须包含 `created_at` 列）:
```
 Column     | Type                     | Nullable | Default
------------+--------------------------+----------+----------
 id         | bigint                   | not null | nextval(...)
 key        | character varying(100)   | not null |
 value      | text                     | not null |
 created_at | timestamp with time zone | not null | now()  ← 必须有
 updated_at | timestamp with time zone | not null | now()
```

**如果缺少 `created_at` 字段**:
- 数据库是旧版本，需要删除重建

---

### 5️⃣ 检查管理员账号

```bash
docker run --rm postgres:15-alpine psql \
  "postgresql://USER:PASSWORD@HOST:PORT/dreamstudio" \
  -c "SELECT email, role, status FROM users WHERE role = 'admin';"
```

**预期输出**:
```
          email          | role  | status
-------------------------+-------+--------
 admin@dreamstudio.local | admin | active
```

**如果没有输出**:
- 管理员账号未创建，检查容器日志找原因

---

### 6️⃣ 检查环境变量

```bash
docker exec dreamstudio env | grep -E "AUTO_SETUP|ADMIN_EMAIL|DATABASE"
```

**预期输出**:
```
AUTO_SETUP=true                          ← 必须是 true
ADMIN_EMAIL=admin@dreamstudio.local
ADMIN_PASSWORD=123456
DATABASE_HOST=192.168.3.14
DATABASE_PORT=33090
DATABASE_DBNAME=dreamstudio
```

**如果 `AUTO_SETUP` 不是 `true`**:
- 检查 `deploy/.env` 文件
- 检查 `docker-compose.standalone.yml` 配置

---

## 常见问题和解决方案

### 问题 1: 代码版本不对

**症状**:
- 迁移脚本缺少 `created_at` 字段
- Git log 不显示 commit 4dfe64c

**解决方案**:
```bash
cd /path/to/DreamStudio
git pull origin main
git log --oneline -1 backend/migrations/005_schema_parity.sql
# 确认显示: 4dfe64c fix: add missing created_at column to settings table
```

---

### 问题 2: Docker 使用了旧缓存

**症状**:
- 代码是最新的
- 但容器日志显示 `created_at` 错误

**解决方案**:
```bash
# 清理 Docker 缓存
docker builder prune -f

# 重新构建（不使用缓存）
cd /path/to/DreamStudio
docker build --no-cache -t dreamstudio-local:latest -f Dockerfile .
```

---

### 问题 3: 数据库是旧版本

**症状**:
- 代码是最新的
- 但数据库 `settings` 表缺少 `created_at` 字段

**解决方案 A: 删除数据库重建（推荐）**
```bash
# 1. 停止容器
cd /path/to/DreamStudio/deploy
docker-compose -f docker-compose.standalone.yml down -v

# 2. 删除数据库
docker run --rm postgres:15-alpine psql \
  "postgresql://USER:PASSWORD@HOST:PORT/postgres" \
  -c "DROP DATABASE IF EXISTS dreamstudio;"

# 3. 重新启动
docker-compose -f docker-compose.standalone.yml up -d
```

**解决方案 B: 手动添加字段（不推荐）**
```bash
docker run --rm postgres:15-alpine psql \
  "postgresql://USER:PASSWORD@HOST:PORT/dreamstudio" \
  -c "ALTER TABLE settings ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();"

# 然后重启容器
docker-compose -f docker-compose.standalone.yml restart
```

---

### 问题 4: 迁移 checksum 不匹配

**症状**:
- 数据库中已有 `005_schema_parity.sql` 记录
- 但表结构是旧的

**原因**:
- 之前应用过旧版本的迁移脚本
- 新版本的 checksum 不同，被跳过

**解决方案**:
```bash
# 删除旧的迁移记录
docker run --rm postgres:15-alpine psql \
  "postgresql://USER:PASSWORD@HOST:PORT/dreamstudio" \
  -c "DELETE FROM schema_migrations WHERE filename = '005_schema_parity.sql';"

# 删除 settings 表
docker run --rm postgres:15-alpine psql \
  "postgresql://USER:PASSWORD@HOST:PORT/dreamstudio" \
  -c "DROP TABLE IF EXISTS settings CASCADE;"

# 重启容器（会重新应用迁移）
docker-compose -f docker-compose.standalone.yml restart
```

---

### 问题 5: AUTO_SETUP 未启用

**症状**:
- 容器启动正常
- 但没有自动创建管理员账号

**解决方案**:
```bash
# 检查 deploy/.env 文件
cat deploy/.env | grep AUTO_SETUP

# 应该显示: AUTO_SETUP=true

# 如果不是，修改 .env 文件
echo "AUTO_SETUP=true" >> deploy/.env

# 重启容器
docker-compose -f docker-compose.standalone.yml restart
```

---

## 完整的重新部署流程

如果以上方法都不行，执行完整的重新部署：

```bash
# 1. 停止并删除容器
cd /path/to/DreamStudio/deploy
docker-compose -f docker-compose.standalone.yml down -v

# 2. 删除数据库
docker run --rm postgres:15-alpine psql \
  "postgresql://root:Swiss5Rebirth9suburbinapt@192.168.3.14:33090/postgres" \
  -c "DROP DATABASE IF EXISTS dreamstudio;"

# 3. 确认代码是最新的
cd /path/to/DreamStudio
git pull origin main
git log --oneline -1 backend/migrations/005_schema_parity.sql
# 必须显示: 4dfe64c

# 4. 清理 Docker 缓存
docker builder prune -f

# 5. 重新构建镜像（不使用缓存）
docker build --no-cache -t dreamstudio-local:latest -f Dockerfile .

# 6. 启动容器
cd deploy
docker-compose -f docker-compose.standalone.yml up -d

# 7. 查看日志（等待 5-10 秒）
sleep 10
docker logs dreamstudio --tail 50

# 8. 验证管理员账号
docker run --rm postgres:15-alpine psql \
  "postgresql://root:Swiss5Rebirth9suburbinapt@192.168.3.14:33090/dreamstudio" \
  -c "SELECT email, role, status FROM users WHERE role = 'admin';"
```

**预期结果**:
```
          email          | role  | status
-------------------------+-------+--------
 admin@dreamstudio.local | admin | active
```

---

## 验证部署成功

### 1. 检查容器状态
```bash
docker ps | grep dreamstudio
```
应该显示: `Up X seconds (healthy)`

### 2. 检查日志
```bash
docker logs dreamstudio --tail 20
```
应该包含:
```
Admin user created: admin@dreamstudio.local
Auto setup completed successfully!
Server started on 0.0.0.0:8080
```

### 3. 测试登录
- 访问: http://localhost:8080
- 邮箱: `admin@dreamstudio.local`
- 密码: `123456`

---

## 获取帮助

如果以上方法都无法解决问题，请提供以下信息：

1. **诊断脚本输出**:
   ```bash
   ./diagnose_new_deployment.sh > diagnosis.txt 2>&1
   ```

2. **完整容器日志**:
   ```bash
   docker logs dreamstudio > container.log 2>&1
   ```

3. **Git 版本信息**:
   ```bash
   git log --oneline -5 > git_log.txt
   ```

4. **环境信息**:
   ```bash
   docker version > env_info.txt
   docker-compose version >> env_info.txt
   uname -a >> env_info.txt
   ```

将这些文件提供给技术支持或在 GitHub 上创建 issue。

---

## 相关文件

- `diagnose_new_deployment.sh` - 自动诊断脚本
- `backend/migrations/005_schema_parity.sql` - Settings 表迁移脚本
- `backend/internal/setup/default_settings.go` - 默认设置初始化代码
- `deploy/.env` - 环境变量配置
- `deploy/docker-compose.standalone.yml` - Docker Compose 配置

---

## 修复历史

- **2026-01-30**: 修复 settings 表缺少 created_at 字段的问题 (commit 4dfe64c)
