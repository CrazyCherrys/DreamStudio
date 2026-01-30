#!/bin/bash
# DreamStudio 模型配置导入脚本
# 用于将 admin_model_settings 配置导入到新设备

set -e

echo "=========================================="
echo "DreamStudio 模型配置导入工具"
echo "=========================================="
echo ""

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# 数据库连接信息
DB_HOST="${DATABASE_HOST:-localhost}"
DB_PORT="${DATABASE_PORT:-5432}"
DB_USER="${DATABASE_USER:-dreamstudio}"
DB_NAME="${DATABASE_DBNAME:-dreamstudio}"
DB_PASSWORD="${DATABASE_PASSWORD}"

# 默认配置模板
DEFAULT_CONFIG='{
  "items": [
    {
      "model_id": "dall-e-3",
      "display_name": "DALL-E 3",
      "request_model_id": "dall-e-3",
      "request_endpoint": "openai",
      "model_type": "image",
      "resolutions": ["1K"],
      "aspect_ratios": ["1:1", "16:9", "9:16"],
      "durations": [],
      "rpm": 0,
      "rpm_enabled": false
    },
    {
      "model_id": "gemini-3.0-pro-image-preview",
      "display_name": "Gemini 3.0 Pro Image (4K)",
      "request_model_id": "gemini-3.0-pro-image-preview",
      "request_endpoint": "openai_mod",
      "model_type": "image",
      "resolutions": ["1K", "2K", "4K"],
      "aspect_ratios": ["1:1", "16:9", "9:16", "4:3", "3:4"],
      "durations": [],
      "rpm": 0,
      "rpm_enabled": false
    },
    {
      "model_id": "imagen-3.0-generate-001",
      "display_name": "Imagen 3.0",
      "request_model_id": "imagen-3.0-generate-001",
      "request_endpoint": "gemini",
      "model_type": "image",
      "resolutions": ["1K", "2K", "4K"],
      "aspect_ratios": ["1:1", "16:9", "9:16", "4:3", "3:4"],
      "durations": [],
      "rpm": 0,
      "rpm_enabled": false
    },
    {
      "model_id": "veo-2.0-generate-001",
      "display_name": "Veo 2.0",
      "request_model_id": "veo-2.0-generate-001",
      "request_endpoint": "gemini",
      "model_type": "video",
      "resolutions": ["1K"],
      "aspect_ratios": ["16:9", "9:16"],
      "durations": ["8s"],
      "rpm": 0,
      "rpm_enabled": false
    }
  ]
}'

# 检查参数
if [ "$1" == "--default" ]; then
    echo -e "${BLUE}使用默认配置模板${NC}"
    echo ""
    INPUT_FILE=""
    USE_DEFAULT=true
elif [ -z "$1" ]; then
    echo -e "${RED}错误: 缺少参数${NC}"
    echo ""
    echo "用法:"
    echo "  $0 <配置文件路径>    # 从文件导入"
    echo "  $0 --default         # 使用默认配置"
    echo ""
    echo "示例:"
    echo "  $0 model_settings.json"
    echo "  $0 --default"
    exit 1
else
    INPUT_FILE="$1"
    USE_DEFAULT=false

    if [ ! -f "$INPUT_FILE" ]; then
        echo -e "${RED}错误: 文件不存在: $INPUT_FILE${NC}"
        exit 1
    fi

    echo "输入文件: $INPUT_FILE"
    echo ""
fi

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

# 检查 settings 表
echo "2. 检查 settings 表..."
if $PSQL_CMD -c "SELECT 1 FROM settings LIMIT 1;" &>/dev/null; then
    echo -e "${GREEN}✓ settings 表存在${NC}"
else
    echo -e "${RED}✗ settings 表不存在${NC}"
    echo "  请先运行应用进行数据库初始化"
    exit 1
fi
echo ""

# 读取配置内容
if [ "$USE_DEFAULT" = true ]; then
    CONFIG_JSON="$DEFAULT_CONFIG"
    echo "3. 使用默认配置模板..."
else
    echo "3. 读取配置文件..."
    CONFIG_JSON=$(cat "$INPUT_FILE")
fi

# 验证 JSON 格式
if command -v jq &>/dev/null; then
    if echo "$CONFIG_JSON" | jq empty 2>/dev/null; then
        echo -e "${GREEN}✓ JSON 格式有效${NC}"

        # 显示配置信息
        MODEL_COUNT=$(echo "$CONFIG_JSON" | jq '.items | length')
        echo "  模型数量: $MODEL_COUNT"
        echo ""

        echo "  模型列表:"
        echo "$CONFIG_JSON" | jq -r '.items[] | "    - \(.model_id): \(.display_name) [\(.request_endpoint)]"'
    else
        echo -e "${RED}✗ JSON 格式无效${NC}"
        exit 1
    fi
else
    echo -e "${YELLOW}⚠ 无法验证 JSON 格式 (未安装 jq)${NC}"
fi
echo ""

# 检查是否已存在配置
echo "4. 检查现有配置..."
EXISTING=$($PSQL_CMD -t -c "SELECT COUNT(*) FROM settings WHERE key = 'admin_model_settings';" 2>/dev/null || echo "0")

if [ "$EXISTING" -gt 0 ]; then
    echo -e "${YELLOW}⚠ 配置已存在${NC}"
    echo ""
    read -p "是否覆盖现有配置? (y/N): " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "操作已取消"
        exit 0
    fi
fi
echo ""

# 转义 JSON 中的单引号
ESCAPED_JSON=$(echo "$CONFIG_JSON" | sed "s/'/''/g")

# 导入配置
echo "5. 导入配置到数据库..."
$PSQL_CMD <<EOF
INSERT INTO settings (key, value, created_at, updated_at)
VALUES ('admin_model_settings', '$ESCAPED_JSON', NOW(), NOW())
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();
EOF

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ 配置导入成功${NC}"
else
    echo -e "${RED}✗ 配置导入失败${NC}"
    exit 1
fi
echo ""

# 验证导入
echo "6. 验证导入结果..."
IMPORTED=$($PSQL_CMD -t -A -c "SELECT value FROM settings WHERE key = 'admin_model_settings';" 2>/dev/null || echo "")

if [ -n "$IMPORTED" ]; then
    echo -e "${GREEN}✓ 配置已成功写入数据库${NC}"

    if command -v jq &>/dev/null; then
        IMPORTED_COUNT=$(echo "$IMPORTED" | jq '.items | length' 2>/dev/null || echo "0")
        echo "  导入的模型数量: $IMPORTED_COUNT"
    fi
else
    echo -e "${RED}✗ 验证失败，配置未找到${NC}"
    exit 1
fi
echo ""

echo "=========================================="
echo "导入完成"
echo "=========================================="
echo ""
echo "下一步："
echo "  1. 重启应用（如果有缓存）:"
echo "     docker-compose restart backend"
echo ""
echo "  2. 清除浏览器缓存并刷新前端"
echo ""
echo "  3. 验证修复:"
echo "     - 检查模型下拉框是否显示友好名称"
echo "     - 测试 4K 图片生成功能"
echo ""
echo "  4. 运行诊断脚本确认:"
echo "     ./diagnose_deployment.sh"
