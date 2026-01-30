#!/bin/bash
# DreamStudio 初始化配置脚本
# 用于新部署环境的首次配置

set -e

echo "=========================================="
echo "DreamStudio 初始化配置"
echo "=========================================="
echo ""

# 检查是否已配置
PSQL_CMD="docker-compose exec -T postgres psql -U dreamstudio -d dreamstudio"

EXISTING=$($PSQL_CMD -t -c "SELECT COUNT(*) FROM settings WHERE key = 'admin_model_settings';" 2>/dev/null || echo "0")

if [ "$EXISTING" -gt 0 ]; then
    echo "配置已存在，跳过初始化"
    exit 0
fi

echo "首次部署检测到，开始初始化配置..."
echo ""

# 导入默认配置
./import_model_settings.sh --default

echo ""
echo "=========================================="
echo "初始化完成"
echo "=========================================="
echo ""
echo "下一步："
echo "  1. 访问管理后台配置 NewAPI 设置"
echo "  2. 根据实际需求调整模型配置"
echo "  3. 创建用户账号"
