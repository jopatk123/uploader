# 无人机点位素材上传管理系统

福州沿海140个测绘点位无人机素材归集工具。

## 功能

- **作业上传页（/）**：无密码公开访问，选择点位后上传图片/视频
- **管理后台（/admin）**：密码校验进入，查看/下载/删除素材
- 图片必须为全景图（像素比 2:1），前端 + 后端双重校验；超 10MB 自动压缩并保留 EXIF
- 视频仅大小拦截（100MB），分片上传 + 断点续传
- SQLite 嵌入式数据库，Docker 一键部署

## 技术栈

| 层 | 技术 |
|----|------|
| 前端 | React 18 + Tailwind CSS 3 + Vite 6 + zustand |
| 后端 | Node.js 22 + Express 4 + better-sqlite3 |
| 数据库 | SQLite（WAL 模式） |
| 鉴权 | JWT（管理后台） |
| 文件上传 | multer（memoryStorage） + 分片 + 断点续传 |
| 部署 | Docker + docker-compose |

## 本地开发

```bash
pnpm install
pnpm dev
```

前端 http://localhost:5173/ ，后端 http://localhost:3001/

## 测试

```bash
# 运行单元 + 接口测试
pnpm test

# 带覆盖率
pnpm test:coverage

# Lint 检查
pnpm lint

# 类型检查
pnpm check

# 格式化
pnpm format
```

## Docker 部署

```bash
# 1. 修改 .env 中的管理员密码（默认 123456）
# 2. 一键启动（对外端口 15000）
docker-compose up -d --build

# 3. 访问
# 上传页面: http://服务器IP:15000/
# 管理后台: http://服务器IP:15000/admin

# 查看日志
docker logs -f drone-uploader

# 停止
docker-compose down

# 项目结束清理全部数据
docker-compose down
rm -rf data/
```

## 配置说明（.env）

| 变量 | 说明 | 默认值 |
|------|------|--------|
| PORT | 后端服务端口（容器内） | 3001 |
| DOCKER_PORT | Docker 对外端口 | 15000 |
| ADMIN_PASSWORD | 管理员密码 | 123456 |
| JWT_SECRET | JWT 密钥 | uploader-secret-key-2024 |
| CHUNK_SIZE | 分片大小（MB） | 5 |
| DATA_DIR | 数据存储目录（Docker 挂载） | /app/data |

## 数据目录

```
data/
├── db.sqlite       # SQLite 数据库
├── temp_chunk/     # 分片临时缓存（自动清理7天过期）
└── storage/        # 素材文件存储
    └── point_1/    # 按点位分目录
        ├── img_*.jpg
        └── video_*.mp4
```

## 项目结构

```
api/                  # 后端 Express 应用
├── middleware/       # 鉴权中间件
├── routes/           # API 路由（points/upload/admin）
├── app.ts            # 应用入口
├── db.ts             # SQLite 初始化
└── server.ts         # 本地开发服务器入口

src/                  # 前端 React 应用
├── components/       # 组件
├── lib/              # API 客户端、上传工具
├── pages/            # 页面（UploadPage / AdminPage）
└── types.ts          # 类型定义

tests/                # 测试用例（Vitest）
```

## CI/CD

GitHub Actions 配置在 `.github/workflows/ci.yml`，每次提交自动执行：
- 类型检查（tsc --noEmit）
- ESLint 检查
- 单元 + 接口测试
