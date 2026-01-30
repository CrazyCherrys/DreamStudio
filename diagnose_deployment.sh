#!/bin/bash
# DreamStudio 部署诊断脚本
# 用于检查新部署环境的数据库状态和配置完整性

set -e

echo "=========================================="
echo "DreamStudio 部署诊断工具"
echo "=========================================="
echo ""

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 数据库连接信息（从环境变量或默认值）
DB_HOST="${DATABASE_HOST:-localhost}"
DB_PORT="${DATABASE_PORT:-5432}"
DB_USER="${DATABASE_USER:-dreamstudio}"
DB_NAME="${DATABASE_DBNAME:-dreamstudio}"
DB_PASSWORD="${DATABASE_PASSWORD}"

# 检查是否在 Docker 环境中
if [ -f "/.dockerenv" ]; then
    echo "检测到 Docker 环境"
    PSQL_CMD="psql"
else
    echo "检测到本地环境"
    # 检查是否使用 Docker Compose
    if docker-compose ps postgres &>/dev/null; then
        echo "使用 Docker Compose 连接数据库"
        PSQL_CMD="docker-compose exec -T postgres psql -U $DB_USER -d $DB_NAME"
    elif docker ps | grep -q dreamstudio-postgres; then
        echo "使用 Docker 连接数据库"
        PSQL_CMD="docker exec -i dreamstudio-postgres psql -U $DB_USER -d $DB_NAME"
    else
        echo "使用本地 psql 连接数据库"
        PSQL_CMD="PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME"
    fi
fi

echo ""
echo "数据库连接信息:"
echo "  Host: $DB_HOST"
echo "  Port: $DB_PORT"
echo "  User: $DB_USER"
echo "  Database: $DB_NAME"
echo ""

# 测试数据库连接
echo "1. 测试数据库连接..."
if $PSQL_CMD -c "SELECT 1;" &>/dev/null; then
    echo -e "${GREEN}✓ 数据库连接成功${NC}"
else
    echo -e "${RED}✗ 数据库连接失败${NC}"
    echo "请检查数据库配置和连接信息"
    exit 1
fi
echo ""

# 检查 schema_migrations 表
echo "2. 检查迁移记录表..."
if $PSQL_CMD -c "SELECT 1 FROM schema_migrations LIMIT 1;" &>/dev/null; then
    echo -e "${GREEN}✓ schema_migrations 表存在${NC}"

    # 统计已应用的迁移数量
    MIGRATION_COUNT=$($PSQL_CMD -t -c "SELECT COUNT(*) FROM schema_migrations;")
    echo "  已应用迁移数量: $MIGRATION_COUNT"

    # 显示最近5个迁移
    echo "  最近的迁移记录:"
    $PSQL_CMD -c "SELECT filename, applied_at FROM schema_migrations ORDER BY filename DESC LIMIT 5;" | sed 's/^/    /'
else
    echo -e "${RED}✗ schema_migrations 表不存在${NC}"
    echo "  数据库可能未初始化，请运行应用进行自动初始化"
fi
echo ""

# 检查 settings 表
echo "3. 检查 settings 表..."
if $PSQL_CMD -c "SELECT 1 FROM settings LIMIT 1;" &>/dev/null; then
    echo -e "${GREEN}✓ settings 表存在${NC}"

    # 统计配置项数量
    SETTINGS_COUNT=$($PSQL_CMD -t -c "SELECT COUNT(*) FROM settings;")
    echo "  配置项数量: $SETTINGS_COUNT"

    # 列出所有配置键
    echo "  现有配置键:"
    $PSQL_CMD -t -c "SELECT key FROM settings ORDER BY key;" | sed 's/^/    - /'
else
    echo -e "${RED}✗ settings 表不存在${NC}"
    echo "  数据库可能未初始化"
fi
echo ""

# 检查 admin_model_settings 配置
echo "4. 检查模型配置 (admin_model_settings)..."
MODEL_SETTINGS=$($PSQL_CMD -t -c "SELECT value FROM settings WHERE key = 'admin_model_settings';" 2>/dev/null || echo "")

if [ -n "$MODEL_SETTINGS" ]; then
    echo -e "${GREEN}✓ admin_model_settings 配置存在${NC}"

    # 尝试解析 JSON 并统计模型数量
    if command -v jq &>/dev/null; then
        MODEL_COUNT=$(echo "$MODEL_SETTINGS" | jq '.items | length' 2>/dev/null || echo "无法解析")
        echo "  配置的模型数量: $MODEL_COUNT"

        # 显示前3个模型
        echo "  模型列表（前3个）:"
        echo "$MODEL_SETTINGS" | jq -r '.items[0:3] | .[] | "    - \(.model_id) (\(.display_name // "无名称"))"' 2>/dev/null || echo "    无法解析模型列表"
    else
        echo "  配置数据长度: ${#MODEL_SETTINGS} 字符"
        echo "  (安装 jq 可查看详细信息)"
    fi
else
    echo -e "${RED}✗ admin_model_settings 配置不存在${NC}"
    echo -e "${YELLOW}  这是导致模型显示ID而非名称的原因！${NC}"
fi
echo ""

# 检查 users 表和管理员账号
echo "5. 检查管理员账号..."
if $PSQL_CMD -c "SELECT 1 FROM users LIMIT 1;" &>/dev/null; then
    echo -e "${GREEN}✓ users 表存在${NC}"

    ADMIN_COUNT=$($PSQL_CMD -t -c "SELECT COUNT(*) FROM users WHERE role = 'admin';")
    echo "  管理员账号数量: $ADMIN_COUNT"

    if [ "$ADMIN_COUNT" -gt 0 ]; then
        echo "  管理员邮箱:"
        $PSQL_CMD -t -c "SELECT email FROM users WHERE role = 'admin';" | sed 's/^/    - /'
    fi
else
    echo -e "${RED}✗ users 表不存在${NC}"
fi
echo ""

# 检查关键表是否存在
echo "6. 检查关键数据表..."
TABLES=("accounts" "api_keys" "groups" "proxies" "redeem_codes" "usage_logs" "image_generation_tasks" "video_generation_tasks")
MISSING_TABLES=()

for table in "${TABLES[@]}"; do
    if $PSQL_CMD -c "SELECT 1 FROM $table LIMIT 1;" &>/dev/null 2>&1; then
        echo -e "  ${GREEN}✓${NC} $table"
    else
        echo -e "  ${RED}✗${NC} $table"
        MISSING_TABLES+=("$table")
    fi
done
echo ""

# 生成诊断报告
echo "=========================================="
echo "诊断报告总结"
echo "=========================================="
echo ""

if [ ${#MISSING_TABLES[@]} -eq 0 ] && [ -n "$MODEL_SETTINGS" ]; then
    echo -e "${GREEN}✓ 数据库状态正常${NC}"
    echo "  所有表已创建，配置数据完整"
elif [ ${#MISSING_TABLES[@]} -eq 0 ] && [ -z "$MODEL_SETTINGS" ]; then
    echo -e "${YELLOW}⚠ 数据库表结构完整，但缺少配置数据${NC}"
    echo ""
    echo "问题："
    echo "  - admin_model_settings 配置缺失"
    echo ""
    echo "影响："
    echo "  - 前端显示模型ID而非友好名称"
    echo "  - 4K分辨率可能无法正常工作"
    echo ""
    echo "解决方案："
    echo "  1. 从旧设备导出配置: ./export_model_settings.sh"
    echo "  2. 导入到新设备: ./import_model_settings.sh model_settings.json"
    echo "  3. 或使用默认配置: ./import_model_settings.sh --default"
else
    echo -e "${RED}✗ 数据库未完全初始化${NC}"
    echo ""
    echo "缺失的表: ${MISSING_TABLES[*]}"
    echo ""
    echo "解决方案："
    echo "  1. 确保应用已启动并完成初始化"
    echo "  2. 检查应用日志: docker-compose logs backend"
    echo "  3. 手动运行迁移: docker-compose exec backend ./dreamstudio --migrate"
fi

echo ""
echo "=========================================="
echo "诊断完成"
echo "=========================================="
