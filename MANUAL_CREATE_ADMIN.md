# 手动创建管理员账号指南

当自动设置失败时，可以使用以下方法手动创建管理员账号。

---

## 方法 1: 使用自动化脚本（推荐）

### 使用默认账号
```bash
cd /path/to/DreamStudio
./create_admin_user.sh
```

**默认账号信息**:
- 邮箱: `admin@dreamstudio.local`
- 密码: `123456`

### 使用自定义账号
```bash
./create_admin_user.sh "your-email@example.com" "your-password"
```

**示例**:
```bash
./create_admin_user.sh "admin@company.com" "SecurePassword123"
```

---

## 方法 2: 使用 SQL 直接创建

### 步骤 1: 生成密码哈希

使用 Go 代码生成 bcrypt 哈希：

```bash
docker run --rm golang:1.25.5-alpine sh -c '
cat > /tmp/hash.go << "EOFGO"
package main
import (
    "fmt"
    "golang.org/x/crypto/bcrypt"
    "os"
)
func main() {
    password := os.Args[1]
    hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
    if err != nil {
        fmt.Fprintf(os.Stderr, "Error: %v\n", err)
        os.Exit(1)
    }
    fmt.Print(string(hash))
}
EOFGO
cd /tmp && go mod init temp > /dev/null 2>&1
go get golang.org/x/crypto/bcrypt > /dev/null 2>&1
go run hash.go "123456"
'
```

**输出示例**:
```
$2a$10$abcdefghijklmnopqrstuvwxyz1234567890ABCDEFGHIJKLMNOP
```

### 步骤 2: 插入数据库

将生成的哈希替换到下面的 SQL 中：

```bash
docker run --rm postgres:15-alpine psql \
  "postgresql://root:Swiss5Rebirth9suburbinapt@192.168.3.14:33090/dreamstudio" \
  << 'EOFSQL'
INSERT INTO users (email, password_hash, role, balance, concurrency, status, created_at, updated_at)
VALUES (
    'admin@dreamstudio.local',
    '$2a$10$YOUR_GENERATED_HASH_HERE',
    'admin',
    0,
    5,
    'active',
    NOW(),
    NOW()
);
EOFSQL
```

---

## 方法 3: 使用 Python 脚本

如果服务器上有 Python 环境：

```python
#!/usr/bin/env python3
import bcrypt
import psycopg2
from datetime import datetime

# 数据库连接信息
DB_CONFIG = {
    'host': '192.168.3.14',
    'port': 33090,
    'user': 'root',
    'password': 'Swiss5Rebirth9suburbinapt',
    'database': 'dreamstudio'
}

# 管理员账号信息
ADMIN_EMAIL = 'admin@dreamstudio.local'
ADMIN_PASSWORD = '123456'

# 生成密码哈希
password_hash = bcrypt.hashpw(ADMIN_PASSWORD.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

# 连接数据库
conn = psycopg2.connect(**DB_CONFIG)
cur = conn.cursor()

# 插入管理员账号
cur.execute("""
    INSERT INTO users (email, password_hash, role, balance, concurrency, status, created_at, updated_at)
    VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
""", (
    ADMIN_EMAIL,
    password_hash,
    'admin',
    0,
    5,
    'active',
    datetime.now(),
    datetime.now()
))

conn.commit()
cur.close()
conn.close()

print(f"✓ 管理员账号创建成功")
print(f"  邮箱: {ADMIN_EMAIL}")
print(f"  密码: {ADMIN_PASSWORD}")
```

保存为 `create_admin.py` 并运行：
```bash
pip3 install bcrypt psycopg2-binary
python3 create_admin.py
```

---

## 方法 4: 在容器内执行

如果容器正在运行，可以进入容器执行：

```bash
# 进入容器
docker exec -it dreamstudio sh

# 在容器内创建临时 Go 文件
cat > /tmp/create_admin.go << 'EOFGO'
package main

import (
    "context"
    "database/sql"
    "fmt"
    "log"
    "os"
    "time"

    _ "github.com/lib/pq"
    "golang.org/x/crypto/bcrypt"
)

func main() {
    // 从环境变量读取配置
    dsn := fmt.Sprintf(
        "host=%s port=%s user=%s password=%s dbname=%s sslmode=disable",
        os.Getenv("DATABASE_HOST"),
        os.Getenv("DATABASE_PORT"),
        os.Getenv("DATABASE_USER"),
        os.Getenv("DATABASE_PASSWORD"),
        os.Getenv("DATABASE_DBNAME"),
    )

    db, err := sql.Open("postgres", dsn)
    if err != nil {
        log.Fatal(err)
    }
    defer db.Close()

    // 管理员信息
    email := "admin@dreamstudio.local"
    password := "123456"

    // 生成密码哈希
    hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
    if err != nil {
        log.Fatal(err)
    }

    // 插入管理员账号
    ctx := context.Background()
    _, err = db.ExecContext(ctx,
        `INSERT INTO users (email, password_hash, role, balance, concurrency, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        email,
        string(hash),
        "admin",
        0,
        5,
        "active",
        time.Now(),
        time.Now(),
    )

    if err != nil {
        log.Fatal(err)
    }

    fmt.Println("✓ 管理员账号创建成功")
    fmt.Printf("  邮箱: %s\n", email)
    fmt.Printf("  密码: %s\n", password)
}
EOFGO

# 运行（需要先安装依赖，容器内可能没有）
# 这个方法不推荐，因为容器内可能缺少编译环境
```

---

## 验证账号创建

创建后验证账号是否存在：

```bash
docker run --rm postgres:15-alpine psql \
  "postgresql://root:Swiss5Rebirth9suburbinapt@192.168.3.14:33090/dreamstudio" \
  -c "SELECT id, email, role, status, created_at FROM users WHERE role = 'admin';"
```

**预期输出**:
```
 id |          email          | role  | status |          created_at
----+-------------------------+-------+--------+-------------------------------
  1 | admin@dreamstudio.local | admin | active | 2026-01-30 12:00:00.000000+00
```

---

## 测试登录

1. 访问: http://localhost:8080
2. 使用创建的账号登录
3. 如果登录成功，说明账号创建正确

---

## 常见问题

### 问题 1: 邮箱已存在

**错误信息**:
```
ERROR: duplicate key value violates unique constraint "users_email_key"
```

**解决方案**:
```bash
# 查看现有账号
docker run --rm postgres:15-alpine psql \
  "postgresql://root:Swiss5Rebirth9suburbinapt@192.168.3.14:33090/dreamstudio" \
  -c "SELECT id, email, role FROM users WHERE email = 'admin@dreamstudio.local';"

# 如果需要重置密码，使用新的哈希更新
docker run --rm postgres:15-alpine psql \
  "postgresql://root:Swiss5Rebirth9suburbinapt@192.168.3.14:33090/dreamstudio" \
  -c "UPDATE users SET password_hash = '$2a$10$NEW_HASH_HERE' WHERE email = 'admin@dreamstudio.local';"
```

### 问题 2: users 表不存在

**错误信息**:
```
ERROR: relation "users" does not exist
```

**解决方案**:
```bash
# 需要先运行数据库迁移
# 启动容器会自动运行迁移
docker-compose -f docker-compose.standalone.yml up -d

# 等待迁移完成
sleep 10

# 然后再创建管理员账号
./create_admin_user.sh
```

### 问题 3: 密码哈希生成失败

**解决方案**:

使用在线工具生成 bcrypt 哈希：
- https://bcrypt-generator.com/
- 选择 Cost: 10
- 输入密码: `123456`
- 复制生成的哈希

或使用其他语言：

**Node.js**:
```bash
npm install -g bcrypt
node -e "console.log(require('bcrypt').hashSync('123456', 10))"
```

**PHP**:
```bash
php -r "echo password_hash('123456', PASSWORD_BCRYPT);"
```

---

## 推荐方法

**最简单**: 使用 `create_admin_user.sh` 脚本

**最灵活**: 使用 SQL 直接创建（可以自定义所有字段）

**最安全**: 使用 Python 脚本（可以添加额外的验证逻辑）

---

## 相关文件

- `create_admin_user.sh` - 自动化创建脚本
- `backend/internal/setup/setup.go` - 自动设置代码参考
- `backend/internal/service/user.go` - User 模型定义

---

## 注意事项

1. **密码安全**: 生产环境请使用强密码
2. **邮箱唯一**: 每个邮箱只能创建一个账号
3. **角色权限**: `role = 'admin'` 拥有所有权限
4. **状态激活**: `status = 'active'` 才能登录
5. **余额初始**: `balance = 0` 可以后续充值
6. **并发限制**: `concurrency = 5` 可以后续调整
