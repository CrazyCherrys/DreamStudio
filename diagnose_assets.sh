#!/bin/bash

echo "=== AI 绘画资产不显示问题诊断 ==="
echo ""

# 检查代码是否正确部署
echo "1. 检查关键代码是否存在..."
cd /root/WorkSpaces/DreamStudio
grep -q "ensureGeneratedImageURLs" backend/internal/service/image_generation_service.go && echo "✓ ensureGeneratedImageURLs 函数存在" || echo "✗ ensureGeneratedImageURLs 函数缺失"
grep -q "resolveGeneratedImageURL" backend/internal/service/image_generation_service.go && echo "✓ resolveGeneratedImageURL 函数存在" || echo "✗ resolveGeneratedImageURL 函数缺失"
grep -q "persistGalleryRecords" backend/internal/service/image_generation_service.go && echo "✓ persistGalleryRecords 调用存在" || echo "✗ persistGalleryRecords 调用缺失"
echo ""

# 检查后端是否需要重新编译
echo "2. 检查后端服务状态..."
if pgrep -f "dreamstudio.*server\|server.*dreamstudio" > /dev/null; then
    echo "⚠️  后端服务正在运行"
    echo "   需要重启后端服务以应用代码更改"
else
    echo "✗ 后端服务未运行"
    echo "   需要启动后端服务"
fi
echo ""

# 检查数据库
echo "3. 检查数据库..."
if [ -f "backend/data/dreamstudio.db" ]; then
    echo "✓ 数据库文件存在"
    echo "   最近 5 条 gallery 记录："
    sqlite3 backend/data/dreamstudio.db "SELECT id, user_id, substr(image_url, 1, 60) as url_preview, datetime(created_at, 'unixepoch') as created FROM gallery ORDER BY created_at DESC LIMIT 5;" 2>/dev/null || echo "   无法查询数据库"
elif [ -f "data/dreamstudio.db" ]; then
    echo "✓ 数据库文件存在 (在 data/ 目录)"
    echo "   最近 5 条 gallery 记录："
    sqlite3 data/dreamstudio.db "SELECT id, user_id, substr(image_url, 1, 60) as url_preview, datetime(created_at, 'unixepoch') as created FROM gallery ORDER BY created_at DESC LIMIT 5;" 2>/dev/null || echo "   无法查询数据库"
else
    echo "✗ 数据库文件不存在"
fi
echo ""

# 检查存储目录
echo "4. 检查本地存储目录..."
for dir in "backend/data/uploads" "data/uploads"; do
    if [ -d "$dir" ]; then
        echo "✓ 存储目录存在: $dir"
        file_count=$(find "$dir" -type f 2>/dev/null | wc -l)
        echo "   文件数量: $file_count"
        if [ $file_count -gt 0 ]; then
            echo "   最近的文件:"
            ls -lht "$dir" 2>/dev/null | head -5
        fi
        break
    fi
done
echo ""

# 检查前端代码
echo "5. 检查前端代码..."
grep -q "Promise.allSettled" frontend/src/views/AssetsView.vue && echo "✓ 前端使用 Promise.allSettled" || echo "✗ 前端未使用 Promise.allSettled"
grep -q "imagesLoadFailed" frontend/src/i18n/locales/zh.ts && echo "✓ 国际化文本已添加" || echo "✗ 国际化文本缺失"
echo ""

echo "=== 诊断结果 ==="
echo ""
echo "📋 下一步操作："
echo ""
echo "1. 重新编译并启动后端服务："
echo "   cd backend"
echo "   go build -o server cmd/server/main.go"
echo "   ./server"
echo ""
echo "2. 或使用 Docker 重启："
echo "   docker-compose down"
echo "   docker-compose up -d --build"
echo ""
echo "3. 测试图片生成："
echo "   - 访问 AI 绘画页面"
echo "   - 生成一张图片"
echo "   - 检查浏览器控制台是否有错误"
echo "   - 访问资产页面查看是否显示"
echo ""
echo "4. 查看实时日志："
echo "   tail -f backend/logs/*.log"
echo "   或"
echo "   docker-compose logs -f backend"
