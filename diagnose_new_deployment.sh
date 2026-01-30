#!/bin/bash

# =============================================================================
# DreamStudio 新设备部署诊断脚本
# =============================================================================
# 用途：诊断在新设备上克隆代码后无法创建管理员账号的问题
# 使用：./diagnose_new_deployment.sh
# =============================================================================

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 数据库连接信息（从 .env 读取）
DB_HOST="${DATABASE_HOST:-192.168.3.14}"
DB_PORT="${DATABASE_PORT:-33090}"
DB_USER="${DATABASE_USER:-root}"
DB_PASSWORD="${DATABASE_PASSWORD:-Swiss5Rebirth9suburbinapt}"
DB_NAME="${DATABASE_DBNAME:-dreamstudio}"

echo -e "${BLUE}=== DreamStudio 新设备部署诊断 ===${NC}"
echo ""

# =============================================================================
# 1. 检查 Git 代码版本
# =============================================================================
echo -e "${YELLOW}[1/10] 检查 Git 代码版本${NC}"
if [ -f "backend/migrations/005_schema_parity.sql" ]; then
    COMMIT=$(git log --oneline -1 backend/migrations/005_schema_parity.sql 2>/dev/null || echo "无法获取")
    echo "最新提交: $COMMIT"

    if echo "$COMMIT" | grep -q "4dfe64c"; then
        echo -e "${GREEN}✓ 代码版本正确（包含修复）${NC}"
    else
        echo -e "${RED}✗ 代码版本可能不是最新的${NC}"
        echo "  预期包含: 4dfe64c fix: add missing created_at column to settings table"
    fi
else
    echo -e "${RED}✗ 找不到迁移脚本文件${NC}"
fi
echo ""

# =============================================================================
# 2. 检查迁移脚本内容
# =============================================================================
echo -e "${YELLOW}[2/10] 检查迁移脚本内容${NC}"
if [ -f "backend/migrations/005_schema_parity.sql" ]; then
    if grep -q "created_at.*TIMESTAMPTZ.*NOT NULL.*DEFAULT NOW()" backend/migrations/005_schema_parity.sql; then
        echo -e "${GREEN}✓ 迁移脚本包含 created_at 字段${NC}"
        echo "Settings 表定义:"
        grep -A 6 "CREATE TABLE IF NOT EXISTS settings" backend/migrations/005_schema_parity.sql | sed 's/^/  /'
    else
        echo -e "${RED}✗ 迁移脚本缺少 created_at 字段${NC}"
        echo "当前 Settings 表定义:"
        grep -A 6 "CREATE TABLE IF NOT EXISTS settings" backend/migrations/005_schema_parity.sql | sed 's/^/  /'
    fi
else
    echo -e "${RED}✗ 找不到迁移脚本${NC}"
fi
echo ""

# =============================================================================
# 3. 检查 Docker 镜像
# =============================================================================
echo -e "${YELLOW}[3/10] 检查 Docker 镜像${NC}"
if docker images | grep -q "dreamstudio-local"; then
    IMAGE_INFO=$(docker images dreamstudio-local:latest --format "{{.ID}} {{.CreatedAt}}")
    echo "镜像信息: $IMAGE_INFO"
    echo -e "${GREEN}✓ 镜像存在${NC}"
else
    echo -e "${RED}✗ 未找到 dreamstudio-local:latest 镜像${NC}"
fi
echo ""

# =============================================================================
# 4. 检查容器状态
# =============================================================================
echo -e "${YELLOW}[4/10] 检查容器状态${NC}"
if docker ps -a | grep -q "dreamstudio"; then
    CONTAINER_STATUS=$(docker ps -a --filter "name=dreamstudio" --format "{{.Status}}")
    echo "容器状态: $CONTAINER_STATUS"

    if docker ps | grep -q "dreamstudio"; then
        echo -e "${GREEN}✓ 容器正在运行${NC}"
    else
        echo -e "${RED}✗ 容器未运行${NC}"
    fi
else
    echo -e "${YELLOW}! 容器不存在（可能尚未部署）${NC}"
fi
echo ""

# =============================================================================
# 5. 检查容器日志
# =============================================================================
echo -e "${YELLOW}[5/10] 检查容器日志（关键信息）${NC}"
if docker ps -a | grep -q "dreamstudio"; then
    echo "自动设置日志:"
    docker logs dreamstudio 2>&1 | grep -E "Auto setup|admin|Admin user created|created_at|error|Error|ERROR|failed" | tail -20 | sed 's/^/  /'

    if docker logs dreamstudio 2>&1 | grep -q "Admin user created"; then
        echo -e "${GREEN}✓ 管理员账号创建成功${NC}"
    elif docker logs dreamstudio 2>&1 | grep -q "created_at.*does not exist"; then
        echo -e "${RED}✗ 发现 created_at 字段缺失错误${NC}"
    else
        echo -e "${YELLOW}! 未找到明确的成功或失败信息${NC}"
    fi
else
    echo -e "${YELLOW}! 容器不存在，跳过日志检查${NC}"
fi
echo ""

# =============================================================================
# 6. 检查环境变量
# =============================================================================
echo -e "${YELLOW}[6/10] 检查环境变量${NC}"
if docker ps | grep -q "dreamstudio"; then
    AUTO_SETUP=$(docker exec dreamstudio env | grep "AUTO_SETUP" || echo "AUTO_SETUP=未设置")
    ADMIN_EMAIL=$(docker exec dreamstudio env | grep "ADMIN_EMAIL" || echo "ADMIN_EMAIL=未设置")
    ADMIN_PASSWORD=$(docker exec dreamstudio env | grep "ADMIN_PASSWORD" || echo "ADMIN_PASSWORD=未设置")

    echo "$AUTO_SETUP"
    echo "$ADMIN_EMAIL"
    echo "ADMIN_PASSWORD=***（已隐藏）"

    if echo "$AUTO_SETUP" | grep -q "true"; then
        echo -e "${GREEN}✓ AUTO_SETUP 已启用${NC}"
    else
        echo -e "${RED}✗ AUTO_SETUP 未启用${NC}"
    fi
else
    echo -e "${YELLOW}! 容器未运行，无法检查环境变量${NC}"
fi
echo ""

# =============================================================================
# 7. 检查数据库连接
# =============================================================================
echo -e "${YELLOW}[7/10] 检查数据库连接${NC}"
if docker run --rm postgres:15-alpine psql "postgresql://$DB_USER:$DB_PASSWORD@$DB_HOST:$DB_PORT/postgres" -c "SELECT 1" > /dev/null 2>&1; then
    echo -e "${GREEN}✓ 数据库连接成功${NC}"

    # 检查数据库是否存在
    DB_EXISTS=$(docker run --rm postgres:15-alpine psql "postgresql://$DB_USER:$DB_PASSWORD@$DB_HOST:$DB_PORT/postgres" -t -c "SELECT EXISTS(SELECT 1 FROM pg_database WHERE datname = '$DB_NAME');" 2>/dev/null | tr -d ' ')

    if [ "$DB_EXISTS" = "t" ]; then
        echo -e "${GREEN}✓ 数据库 '$DB_NAME' 存在${NC}"
    else
        echo -e "${YELLOW}! 数据库 '$DB_NAME' 不存在（首次部署正常）${NC}"
    fi
else
    echo -e "${RED}✗ 数据库连接失败${NC}"
    echo "  连接信息: $DB_HOST:$DB_PORT"
fi
echo ""

# =============================================================================
# 8. 检查数据库表结构
# =============================================================================
echo -e "${YELLOW}[8/10] 检查数据库 settings 表结构${NC}"
if docker run --rm postgres:15-alpine psql "postgresql://$DB_USER:$DB_PASSWORD@$DB_HOST:$DB_PORT/$DB_NAME" -c "\d settings" > /dev/null 2>&1; then
    echo "Settings 表结构:"
    docker run --rm postgres:15-alpine psql "postgresql://$DB_USER:$DB_PASSWORD@$DB_HOST:$DB_PORT/$DB_NAME" -c "\d settings" 2>/dev/null | sed 's/^/  /'

    if docker run --rm postgres:15-alpine psql "postgresql://$DB_USER:$DB_PASSWORD@$DB_HOST:$DB_PORT/$DB_NAME" -c "\d settings" 2>/dev/null | grep -q "created_at"; then
        echo -e "${GREEN}✓ settings 表包含 created_at 字段${NC}"
    else
        echo -e "${RED}✗ settings 表缺少 created_at 字段${NC}"
    fi
else
    echo -e "${YELLOW}! settings 表不存在（首次部署正常）${NC}"
fi
echo ""

# =============================================================================
# 9. 检查管理员账号
# =============================================================================
echo -e "${YELLOW}[9/10] 检查管理员账号${NC}"
if docker run --rm postgres:15-alpine psql "postgresql://$DB_USER:$DB_PASSWORD@$DB_HOST:$DB_PORT/$DB_NAME" -c "SELECT 1 FROM users LIMIT 1" > /dev/null 2>&1; then
    ADMIN_COUNT=$(docker run --rm postgres:15-alpine psql "postgresql://$DB_USER:$DB_PASSWORD@$DB_HOST:$DB_PORT/$DB_NAME" -t -c "SELECT COUNT(*) FROM users WHERE role = 'admin';" 2>/dev/null | tr -d ' ')

    if [ "$ADMIN_COUNT" -gt 0 ]; then
        echo -e "${GREEN}✓ 找到 $ADMIN_COUNT 个管理员账号${NC}"
        echo "管理员信息:"
        docker run --rm postgres:15-alpine psql "postgresql://$DB_USER:$DB_PASSWORD@$DB_HOST:$DB_PORT/$DB_NAME" -c "SELECT email, role, status, created_at FROM users WHERE role = 'admin';" 2>/dev/null | sed 's/^/  /'
    else
        echo -e "${RED}✗ 未找到管理员账号${NC}"
    fi
else
    echo -e "${YELLOW}! users 表不存在（首次部署正常）${NC}"
fi
echo ""

# =============================================================================
# 10. 检查迁移记录
# =============================================================================
echo -e "${YELLOW}[10/10] 检查迁移记录${NC}"
if docker run --rm postgres:15-alpine psql "postgresql://$DB_USER:$DB_PASSWORD@$DB_HOST:$DB_PORT/$DB_NAME" -c "SELECT 1 FROM schema_migrations LIMIT 1" > /dev/null 2>&1; then
    MIGRATION_COUNT=$(docker run --rm postgres:15-alpine psql "postgresql://$DB_USER:$DB_PASSWORD@$DB_HOST:$DB_PORT/$DB_NAME" -t -c "SELECT COUNT(*) FROM schema_migrations;" 2>/dev/null | tr -d ' ')
    echo "已应用迁移数量: $MIGRATION_COUNT"

    echo "005 迁移记录:"
    docker run --rm postgres:15-alpine psql "postgresql://$DB_USER:$DB_PASSWORD@$DB_HOST:$DB_PORT/$DB_NAME" -c "SELECT filename, LEFT(checksum, 16) as checksum_prefix, applied_at FROM schema_migrations WHERE filename LIKE '%005%';" 2>/dev/null | sed 's/^/  /'

    if docker run --rm postgres:15-alpine psql "postgresql://$DB_USER:$DB_PASSWORD@$DB_HOST:$DB_PORT/$DB_NAME" -t -c "SELECT COUNT(*) FROM schema_migrations WHERE filename = '005_schema_parity.sql';" 2>/dev/null | grep -q "1"; then
        echo -e "${GREEN}✓ 005 迁移已应用${NC}"
    else
        echo -e "${YELLOW}! 005 迁移未应用${NC}"
    fi
else
    echo -e "${YELLOW}! schema_migrations 表不存在（首次部署正常）${NC}"
fi
echo ""

# =============================================================================
# 诊断总结
# =============================================================================
echo -e "${BLUE}=== 诊断总结 ===${NC}"
echo ""

# 判断问题类型
ISSUE_FOUND=false

# 检查代码版本
if [ -f "backend/migrations/005_schema_parity.sql" ]; then
    if ! grep -q "created_at.*TIMESTAMPTZ.*NOT NULL.*DEFAULT NOW()" backend/migrations/005_schema_parity.sql; then
        echo -e "${RED}问题 1: 迁移脚本缺少 created_at 字段${NC}"
        echo "  解决方案: git pull 获取最新代码（commit 4dfe64c）"
        ISSUE_FOUND=true
    fi
fi

# 检查数据库表结构
if docker run --rm postgres:15-alpine psql "postgresql://$DB_USER:$DB_PASSWORD@$DB_HOST:$DB_PORT/$DB_NAME" -c "\d settings" > /dev/null 2>&1; then
    if ! docker run --rm postgres:15-alpine psql "postgresql://$DB_USER:$DB_PASSWORD@$DB_HOST:$DB_PORT/$DB_NAME" -c "\d settings" 2>/dev/null | grep -q "created_at"; then
        echo -e "${RED}问题 2: 数据库 settings 表缺少 created_at 字段${NC}"
        echo "  解决方案: 删除数据库重新部署，或手动添加字段"
        ISSUE_FOUND=true
    fi
fi

# 检查管理员账号
if docker run --rm postgres:15-alpine psql "postgresql://$DB_USER:$DB_PASSWORD@$DB_HOST:$DB_PORT/$DB_NAME" -c "SELECT 1 FROM users LIMIT 1" > /dev/null 2>&1; then
    ADMIN_COUNT=$(docker run --rm postgres:15-alpine psql "postgresql://$DB_USER:$DB_PASSWORD@$DB_HOST:$DB_PORT/$DB_NAME" -t -c "SELECT COUNT(*) FROM users WHERE role = 'admin';" 2>/dev/null | tr -d ' ')
    if [ "$ADMIN_COUNT" -eq 0 ]; then
        echo -e "${RED}问题 3: 管理员账号未创建${NC}"
        echo "  可能原因: AUTO_SETUP 未启用或初始化失败"
        ISSUE_FOUND=true
    fi
fi

if [ "$ISSUE_FOUND" = false ]; then
    echo -e "${GREEN}✓ 未发现明显问题${NC}"
    echo ""
    echo "如果仍然无法登录，请检查:"
    echo "  1. 密码是否正确（默认: 123456）"
    echo "  2. 邮箱是否正确（默认: admin@dreamstudio.local）"
    echo "  3. 查看完整容器日志: docker logs dreamstudio"
fi

echo ""
echo -e "${BLUE}=== 诊断完成 ===${NC}"
