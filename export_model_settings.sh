#!/bin/bash
# DreamStudio 模型配置导出脚本
# 用于从旧设备导出 admin_model_settings 配置

set -e

echo "=========================================="
echo "DreamStudio 模型配置导出工具"
echo "=========================================="
echo ""

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# 输出文件
OUTPUT_FILE="${1:-model_settings.json}"

# 数据库连接信息
DB_HOST="${DATABASE_HOST:-localhost}"
DB_PORT="${DATABASE_PORT:-5432}"
DB_USER="${DATABASE_USER:-dreamstudio}"
DB_NAME="${DATABASE_DBNAME:-dreamstudio}"
DB_PASSWORD="${DATABASE_PASSWORD}"

echo "输出文件: $OUTPUT_FILE"
echo ""

# 检查数据库连接方式
if [ -f "/.dockerenv" ]; then
    PSQL_CMD="psql -U $DB_USER -d $DB_NAME"
elif docker-compose ps postgres &>/dev/null; then
    PSQL_CMD="docker-compose exec -T postgres psql -U $DB_USER -d $DB_NAME"
elif docker ps | grep -q dreamstudio-postgres; then
    PSQL_CMD="docker exec -i dreamstudio-postgres psql -U $DB_USER -d $DB_NAME"
else
    PSQL_CMD="PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME"
fi

# 测试连接
echo "1. 测试数据库连接..."
if $PSQL_CMD -c "SELECT 1;" &>/dev/null; then
    echo -e "${GREEN}✓ 连接成功${NC}"
else
    echo -e "${RED}✗ 连接失败${NC}"
    exit 1
fi
echo ""

# 导出配置
echo "2. 导出 admin_model_settings 配置..."
MODEL_SETTINGS=$($PSQL_CMD -t -A -c "SELECT value FROM settings WHERE key = 'admin_model_settings';" 2>/dev/null || echo "")

if [ -z "$MODEL_SETTINGS" ]; then
    echo -e "${RED}✗ 配置不存在${NC}"
    echo ""
    echo "可能的原因："
    echo "  1. 数据库中没有配置此项"
    echo "  2. 这是一个新部署的环境"
    echo ""
    echo "建议："
    echo "  使用默认配置模板: ./import_model_settings.sh --default"
    exit 1
fi

# 保存到文件
echo "$MODEL_SETTINGS" > "$OUTPUT_FILE"

# 验证 JSON 格式
if command -v jq &>/dev/null; then
    if jq empty "$OUTPUT_FILE" 2>/dev/null; then
        echo -e "${GREEN}✓ 配置导出成功${NC}"
        echo ""

        # 显示统计信息
        MODEL_COUNT=$(jq '.items | length' "$OUTPUT_FILE")
        echo "配置统计："
        echo "  - 模型数量: $MODEL_COUNT"
        echo "  - 文件大小: $(du -h "$OUTPUT_FILE" | cut -f1)"
        echo ""

        # 显示前5个模型
        echo "模型列表（前5个）："
        jq -r '.items[0:5] | .[] | "  - \(.model_id): \(.display_name // "无名称") [\(.request_endpoint // "openai")]"' "$OUTPUT_FILE"

        if [ "$MODEL_COUNT" -gt 5 ]; then
            echo "  ... 还有 $((MODEL_COUNT - 5)) 个模型"
        fi
    else
        echo -e "${YELLOW}⚠ 配置已导出，但 JSON 格式可能有问题${NC}"
        echo "  文件: $OUTPUT_FILE"
    fi
else
    echo -e "${GREEN}✓ 配置导出成功${NC}"
    echo "  文件: $OUTPUT_FILE"
    echo "  大小: $(du -h "$OUTPUT_FILE" | cut -f1)"
    echo ""
    echo "  (安装 jq 可查看详细信息)"
fi

echo ""
echo "=========================================="
echo "导出完成"
echo "=========================================="
echo ""
echo "下一步："
echo "  1. 将文件传输到新设备:"
echo "     scp $OUTPUT_FILE new-server:/tmp/"
echo ""
echo "  2. 在新设备上导入:"
echo "     ./import_model_settings.sh /tmp/$OUTPUT_FILE"
