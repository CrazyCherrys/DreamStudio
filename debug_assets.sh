#!/bin/bash

echo "=== 诊断 AI 绘画资产不显示问题 ==="
echo ""

# 1. 检查后端服务是否运行
echo "1. 检查后端服务状态..."
if pgrep -f "DreamStudio.*server" > /dev/null; then
    echo "✓ 后端服务正在运行"
else
    echo "✗ 后端服务未运行"
fi
echo ""

# 2. 检查健康状态
echo "2. 检查存储健康状态..."
curl -s http://localhost:8080/health | jq '.' 2>/dev/null || echo "无法连接到健康检查端点"
echo ""

# 3. 检查数据库中的 gallery 记录
echo "3. 检查数据库中的 gallery 记录..."
cd /root/WorkSpaces/DreamStudio/backend
if [ -f "data/dreamstudio.db" ]; then
    echo "最近 5 条 gallery 记录："
    sqlite3 data/dreamstudio.db "SELECT id, user_id, substr(image_url, 1, 50) as url_preview, created_at FROM gallery ORDER BY created_at DESC LIMIT 5;" 2>/dev/null || echo "无法查询数据库"
else
    echo "数据库文件不存在"
fi
echo ""

# 4. 检查存储目录
echo "4. 检查本地存储目录..."
if [ -d "data/uploads" ]; then
    echo "存储目录存在，最近的文件："
    ls -lht data/uploads/ 2>/dev/null | head -10
else
    echo "存储目录不存在"
fi
echo ""

# 5. 检查前端 API 调用
echo "5. 测试前端 API 端点..."
echo "测试 /api/v1/gallery/mine (需要认证):"
curl -s -o /dev/null -w "HTTP Status: %{http_code}\n" http://localhost:8080/api/v1/gallery/mine
echo ""

# 6. 检查代码中的关键函数
echo "6. 检查关键代码是否存在..."
grep -q "ensureGeneratedImageURLs" backend/internal/service/image_generation_service.go && echo "✓ ensureGeneratedImageURLs 函数存在" || echo "✗ ensureGeneratedImageURLs 函数缺失"
grep -q "resolveGeneratedImageURL" backend/internal/service/image_generation_service.go && echo "✓ resolveGeneratedImageURL 函数存在" || echo "✗ resolveGeneratedImageURL 函数缺失"
grep -q "persistGalleryRecords" backend/internal/service/image_generation_service.go && echo "✓ persistGalleryRecords 函数存在" || echo "✗ persistGalleryRecords 函数缺失"
echo ""

echo "=== 诊断完成 ==="
echo ""
echo "建议检查项："
echo "1. 查看后端日志中是否有 'storage:' 或 'gallery:' 相关的错误"
echo "2. 确认用户已登录且有有效的 JWT token"
echo "3. 检查浏览器控制台是否有 API 请求失败"
echo "4. 确认图片生成成功（检查 result.Images 是否有数据）"
