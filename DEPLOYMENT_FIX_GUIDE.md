# DreamStudio 部署修复指南

## 📋 问题诊断

您的新部署环境遇到两个问题：
1. **模型显示ID而非名称** - 因为缺少 `admin_model_settings` 配置
2. **4K分辨率变1K** - 因为模型配置不完整

## ✅ 自动化修复工具

我已为您创建了三个便捷脚本：

### 1. 诊断脚本 - `diagnose_deployment.sh`

**功能：** 全面检查数据库状态和配置完整性

**使用方法：**
```bash
./diagnose_deployment.sh
```

**检查项目：**
- ✅ 数据库连接
- ✅ 迁移记录表 (schema_migrations)
- ✅ 配置表 (settings)
- ✅ 模型配置 (admin_model_settings)
- ✅ 管理员账号
- ✅ 关键数据表

### 2. 导出脚本 - `export_model_settings.sh`

**功能：** 从旧设备导出模型配置

**使用方法：**
```bash
# 在旧设备上运行
./export_model_settings.sh [输出文件名]

# 示例
./export_model_settings.sh model_settings.json
```

**输出：** 包含所有模型配置的 JSON 文件

### 3. 导入脚本 - `import_model_settings.sh`

**功能：** 将模型配置导入到新设备

**使用方法：**

**方式A：从文件导入（推荐）**
```bash
# 1. 从旧设备传输文件
scp old-server:/path/to/model_settings.json /tmp/

# 2. 导入配置
./import_model_settings.sh /tmp/model_settings.json
```

**方式B：使用默认配置**
```bash
# 如果无法访问旧设备，使用默认配置
./import_model_settings.sh --default
```

**默认配置包含：**
- DALL-E 3 (OpenAI)
- Gemini 3.0 Pro Image (支持4K)
- Imagen 3.0 (Gemini)
- Veo 2.0 (视频生成)

---

## 🚀 完整修复流程

### 步骤1：诊断当前状态

```bash
cd /root/WorkSpaces/DreamStudio
./diagnose_deployment.sh
```

**预期输出：**
- ✅ 数据库连接成功
- ✅ 所有表已创建
- ❌ admin_model_settings 配置缺失

### 步骤2：选择修复方案

#### 方案A：从旧设备导入（推荐）

**在旧设备上：**
```bash
cd /path/to/DreamStudio
./export_model_settings.sh model_settings.json

# 查看导出的配置
cat model_settings.json | jq '.items[] | {model_id, display_name}'
```

**传输到新设备：**
```bash
scp model_settings.json new-server:/tmp/
```

**在新设备上：**
```bash
cd /root/WorkSpaces/DreamStudio
./import_model_settings.sh /tmp/model_settings.json
```

#### 方案B：使用默认配置

```bash
cd /root/WorkSpaces/DreamStudio
./import_model_settings.sh --default
```

### 步骤3：重启应用

```bash
# 如果使用 Docker Compose
cd deploy
docker-compose restart backend

# 或者重启整个服务
docker-compose restart
```

### 步骤4：验证修复

```bash
# 1. 再次运行诊断
./diagnose_deployment.sh

# 2. 检查前端
# - 打开浏览器，清除缓存 (Ctrl+Shift+R)
# - 访问 AI 绘画页面
# - 检查模型下拉框是否显示友好名称

# 3. 测试 4K 生成
# - 选择 "Gemini 3.0 Pro Image (4K)" 模型
# - 选择分辨率: 4K
# - 选择宽高比: 16:9
# - 生成图片
# - 检查生成的图片分辨率是否为 4096x2304
```

---

## 📊 故障排查

### 问题1：脚本无法连接数据库

**症状：**
```
✗ 数据库连接失败
```

**解决方案：**

1. **检查数据库是否运行：**
   ```bash
   docker-compose ps postgres
   # 或
   docker ps | grep postgres
   ```

2. **检查环境变量：**
   ```bash
   cat deploy/.env | grep DATABASE
   ```

3. **手动测试连接：**
   ```bash
   docker exec -i dreamstudio-postgres psql -U dreamstudio -d dreamstudio -c "SELECT 1;"
   ```

### 问题2：导入后仍显示模型ID

**可能原因：**
1. 浏览器缓存未清除
2. 后端缓存未刷新
3. 配置格式错误

**解决方案：**

1. **清除浏览器缓存：**
   - Chrome/Edge: Ctrl+Shift+Delete
   - Firefox: Ctrl+Shift+Delete
   - 或使用无痕模式测试

2. **重启后端服务：**
   ```bash
   docker-compose restart backend
   ```

3. **检查配置格式：**
   ```bash
   docker exec -i dreamstudio-postgres psql -U dreamstudio -d dreamstudio -c \
     "SELECT value FROM settings WHERE key = 'admin_model_settings';" | jq .
   ```

### 问题3：4K仍然生成1K

**可能原因：**
1. 模型ID不匹配
2. request_endpoint 配置错误
3. 上游服务不支持4K

**解决方案：**

1. **检查模型配置：**
   ```bash
   docker exec -i dreamstudio-postgres psql -U dreamstudio -d dreamstudio -c \
     "SELECT value FROM settings WHERE key = 'admin_model_settings';" | \
     jq '.items[] | select(.model_id == "gemini-3.0-pro-image-preview")'
   ```

   **确认以下字段：**
   - `model_id`: `"gemini-3.0-pro-image-preview"`
   - `request_model_id`: `"gemini-3.0-pro-image-preview"`
   - `request_endpoint`: `"openai_mod"`
   - `resolutions`: 包含 `"4K"`

2. **检查后端日志：**
   ```bash
   docker-compose logs -f backend | grep -i "image"
   ```

3. **验证上游API：**
   - 确认 NewAPI 配置正确
   - 确认上游服务支持该模型的4K分辨率

---

## 🔧 手动修复（高级）

如果自动化脚本无法使用，可以手动执行：

### 手动导出配置

```bash
# 在旧设备上
docker exec -i dreamstudio-postgres psql -U dreamstudio -d dreamstudio -t -A -c \
  "SELECT value FROM settings WHERE key = 'admin_model_settings';" > model_settings.json
```

### 手动导入配置

```bash
# 在新设备上
CONFIG=$(cat model_settings.json)
docker exec -i dreamstudio-postgres psql -U dreamstudio -d dreamstudio <<EOF
INSERT INTO settings (key, value, created_at, updated_at)
VALUES ('admin_model_settings', '$CONFIG', NOW(), NOW())
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();
EOF
```

### 手动验证

```bash
docker exec -i dreamstudio-postgres psql -U dreamstudio -d dreamstudio -c \
  "SELECT key, length(value) as size FROM settings WHERE key = 'admin_model_settings';"
```

---

## 📝 默认配置说明

如果使用 `--default` 选项，将导入以下配置：

```json
{
  "items": [
    {
      "model_id": "dall-e-3",
      "display_name": "DALL-E 3",
      "request_endpoint": "openai",
      "resolutions": ["1K"],
      "aspect_ratios": ["1:1", "16:9", "9:16"]
    },
    {
      "model_id": "gemini-3.0-pro-image-preview",
      "display_name": "Gemini 3.0 Pro Image (4K)",
      "request_endpoint": "openai_mod",
      "resolutions": ["1K", "2K", "4K"],
      "aspect_ratios": ["1:1", "16:9", "9:16", "4:3", "3:4"]
    },
    {
      "model_id": "imagen-3.0-generate-001",
      "display_name": "Imagen 3.0",
      "request_endpoint": "gemini",
      "resolutions": ["1K", "2K", "4K"],
      "aspect_ratios": ["1:1", "16:9", "9:16", "4:3", "3:4"]
    },
    {
      "model_id": "veo-2.0-generate-001",
      "display_name": "Veo 2.0",
      "request_endpoint": "gemini",
      "model_type": "video",
      "durations": ["8s"]
    }
  ]
}
```

**注意：** 默认配置可能与您的实际环境不完全匹配，建议根据实际情况调整。

---

## ✅ 验证清单

修复完成后，请确认以下项目：

- [ ] 诊断脚本显示 "✓ admin_model_settings 配置存在"
- [ ] 前端模型下拉框显示友好名称（如 "Gemini 3.0 Pro Image (4K)"）
- [ ] 选择4K分辨率后，生成的图片分辨率正确（如 4096x2304）
- [ ] 所有模型都能正常生成图片
- [ ] 浏览器控制台无错误信息

---

## 📞 需要帮助？

如果遇到问题，请提供以下信息：

1. **诊断脚本输出：**
   ```bash
   ./diagnose_deployment.sh > diagnosis.log 2>&1
   ```

2. **后端日志：**
   ```bash
   docker-compose logs backend --tail=100 > backend.log
   ```

3. **数据库状态：**
   ```bash
   docker exec -i dreamstudio-postgres psql -U dreamstudio -d dreamstudio -c "\dt" > tables.log
   ```

---

## 🎯 总结

**核心问题：** 新部署环境缺少应用配置数据（`admin_model_settings`）

**解决方案：**
1. 使用 `diagnose_deployment.sh` 诊断问题
2. 使用 `export_model_settings.sh` 从旧设备导出配置
3. 使用 `import_model_settings.sh` 导入到新设备
4. 重启应用并验证修复

**关键点：**
- ✅ 数据库表会自动创建（通过迁移脚本）
- ❌ 应用配置数据不会自动创建（需要手动导入）
- ✅ 使用提供的脚本可以快速修复问题
