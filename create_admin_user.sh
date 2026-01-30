#!/bin/bash

# =============================================================================
# DreamStudio 手动创建管理员账号脚本
# =============================================================================
# 用途：在自动设置失败时手动创建管理员账号
# 使用：./create_admin_user.sh [email] [password]
# =============================================================================

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 数据库连接信息（从 .env 读取或使用默认值）
DB_HOST="${DATABASE_HOST:-192.168.3.14}"
DB_PORT="${DATABASE_PORT:-33090}"
DB_USER="${DATABASE_USER:-root}"
DB_PASSWORD="${DATABASE_PASSWORD:-Swiss5Rebirth9suburbinapt}"
DB_NAME="${DATABASE_DBNAME:-dreamstudio}"

# 管理员账号信息
ADMIN_EMAIL="${1:-admin@dreamstudio.local}"
ADMIN_PASSWORD="${2:-123456}"

echo -e "${BLUE}=== DreamStudio 手动创建管理员账号 ===${NC}"
echo ""

# =============================================================================
# 1. 检查数据库连接
# =============================================================================
echo -e "${YELLOW}[1/5] 检查数据库连接${NC}"
if docker run --rm postgres:15-alpine psql "postgresql://$DB_USER:$DB_PASSWORD@$DB_HOST:$DB_PORT/$DB_NAME" -c "SELECT 1" > /dev/null 2>&1; then
    echo -e "${GREEN}✓ 数据库连接成功${NC}"
else
    echo -e "${RED}✗ 数据库连接失败${NC}"
    echo "  连接信息: $DB_HOST:$DB_PORT/$DB_NAME"
    echo "  用户: $DB_USER"
    exit 1
fi
echo ""

# =============================================================================
# 2. 检查 users 表是否存在
# =============================================================================
echo -e "${YELLOW}[2/5] 检查 users 表${NC}"
if docker run --rm postgres:15-alpine psql "postgresql://$DB_USER:$DB_PASSWORD@$DB_HOST:$DB_PORT/$DB_NAME" -c "SELECT 1 FROM users LIMIT 1" > /dev/null 2>&1; then
    echo -e "${GREEN}✓ users 表存在${NC}"
else
    echo -e "${RED}✗ users 表不存在${NC}"
    echo "  请先运行数据库迁移（启动容器会自动运行）"
    exit 1
fi
echo ""

# =============================================================================
# 3. 检查管理员账号是否已存在
# =============================================================================
echo -e "${YELLOW}[3/5] 检查现有管理员账号${NC}"
EXISTING_ADMIN=$(docker run --rm postgres:15-alpine psql "postgresql://$DB_USER:$DB_PASSWORD@$DB_HOST:$DB_PORT/$DB_NAME" -t -c "SELECT COUNT(*) FROM users WHERE role = 'admin';" 2>/dev/null | tr -d ' ')

if [ "$EXISTING_ADMIN" -gt 0 ]; then
    echo -e "${YELLOW}! 已存在 $EXISTING_ADMIN 个管理员账号${NC}"
    echo "  现有管理员:"
    docker run --rm postgres:15-alpine psql "postgresql://$DB_USER:$DB_PASSWORD@$DB_HOST:$DB_PORT/$DB_NAME" -c "SELECT id, email, status, created_at FROM users WHERE role = 'admin';" 2>/dev/null | sed 's/^/  /'

    echo ""
    read -p "是否继续创建新的管理员账号？[y/N] " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "操作已取消"
        exit 0
    fi
else
    echo -e "${GREEN}✓ 无现有管理员账号${NC}"
fi
echo ""

# =============================================================================
# 4. 生成密码哈希
# =============================================================================
echo -e "${YELLOW}[4/5] 生成密码哈希${NC}"
echo "  管理员邮箱: $ADMIN_EMAIL"
echo "  密码: $ADMIN_PASSWORD"

# 使用 Docker 容器运行 Go 代码生成 bcrypt 哈希
PASSWORD_HASH=$(docker run --rm golang:1.25.5-alpine sh -c "
cat > /tmp/hash.go << 'EOFGO'
package main
import (
    \"fmt\"
    \"golang.org/x/crypto/bcrypt\"
    \"os\"
)
func main() {
    password := os.Args[1]
    hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
    if err != nil {
        fmt.Fprintf(os.Stderr, \"Error: %v\n\", err)
        os.Exit(1)
    }
    fmt.Print(string(hash))
}
EOFGO
cd /tmp && go mod init temp > /dev/null 2>&1
go get golang.org/x/crypto/bcrypt > /dev/null 2>&1
go run hash.go '$ADMIN_PASSWORD'
")

if [ -z "$PASSWORD_HASH" ]; then
    echo -e "${RED}✗ 密码哈希生成失败${NC}"
    exit 1
fi

echo -e "${GREEN}✓ 密码哈希生成成功${NC}"
echo "  哈希长度: ${#PASSWORD_HASH} 字符"
echo ""

# =============================================================================
# 5. 创建管理员账号
# =============================================================================
echo -e "${YELLOW}[5/5] 创建管理员账号${NC}"

# 执行 SQL 插入
docker run --rm postgres:15-alpine psql "postgresql://$DB_USER:$DB_PASSWORD@$DB_HOST:$DB_PORT/$DB_NAME" << EOFSQL
INSERT INTO users (email, password_hash, role, balance, concurrency, status, created_at, updated_at)
VALUES (
    '$ADMIN_EMAIL',
    '$PASSWORD_HASH',
    'admin',
    0,
    5,
    'active',
    NOW(),
    NOW()
);
EOFSQL

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ 管理员账号创建成功${NC}"
    echo ""

    # 显示创建的账号信息
    echo -e "${BLUE}=== 账号信息 ===${NC}"
    docker run --rm postgres:15-alpine psql "postgresql://$DB_USER:$DB_PASSWORD@$DB_HOST:$DB_PORT/$DB_NAME" -c "SELECT id, email, role, status, created_at FROM users WHERE email = '$ADMIN_EMAIL';" 2>/dev/null

    echo ""
    echo -e "${GREEN}✓ 完成！现在可以使用以下信息登录：${NC}"
    echo "  邮箱: $ADMIN_EMAIL"
    echo "  密码: $ADMIN_PASSWORD"
    echo "  访问: http://localhost:8080"
else
    echo -e "${RED}✗ 管理员账号创建失败${NC}"
    echo "  可能原因："
    echo "  1. 邮箱已存在"
    echo "  2. 数据库权限不足"
    echo "  3. 表结构不匹配"
    exit 1
fi
