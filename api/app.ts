/**
 * Express 应用入口
 */
import express, {
  type Request,
  type Response,
  type NextFunction,
} from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import fse from 'fs-extra';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import cron from 'node-cron';
import { initDatabase, TEMP_CHUNK_DIR, STORAGE_DIR } from './db.js';
import pointsRoutes from './routes/points.js';
import uploadRoutes from './routes/upload.js';
import adminRoutes from './routes/admin.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 初始化数据库
initDatabase();

const app: express.Application = express();

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

/**
 * API 路由
 */
app.use('/api/points', pointsRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/admin', adminRoutes);

/**
 * 健康检查
 */
app.get('/api/health', (_req: Request, res: Response) => {
  res.status(200).json({ success: true, message: 'ok' });
});

/**
 * 静态文件服务：图片缩略图预览（管理员可访问，不消耗带宽则不公开视频）
 * /storage/point_xx/img_xxx.jpg
 */
app.use('/storage', express.static(STORAGE_DIR));

/**
 * 前端静态文件服务（生产环境，Vite build 后的 dist 目录）
 */
const clientDistPath = path.join(__dirname, '..', 'dist');
if (fs.existsSync(clientDistPath)) {
  app.use(express.static(clientDistPath));

  // SPA 回退：所有非 /api、非 /storage 的请求返回 index.html
  app.get('*', (req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith('/api/') || req.path.startsWith('/storage/')) {
      next();
      return;
    }
    res.sendFile(path.join(clientDistPath, 'index.html'));
  });
}

/**
 * 定时清理7天前未合并的过期分片（每天凌晨3点执行）
 */
cron.schedule('0 3 * * *', async () => {
  try {
    if (!fs.existsSync(TEMP_CHUNK_DIR)) return;
    const dirs = fs.readdirSync(TEMP_CHUNK_DIR);
    const now = Date.now();
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

    for (const dir of dirs) {
      const dirPath = path.join(TEMP_CHUNK_DIR, dir);
      const stat = fs.statSync(dirPath);
      if (now - stat.mtimeMs > sevenDaysMs) {
        await fse.remove(dirPath);
        console.log(`[cron] 清理过期分片目录: ${dir}`);
      }
    }
  } catch (err) {
    console.error('[cron] 清理分片失败:', err);
  }
});

/**
 * 错误处理中间件
 */
app.use((error: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[error]', error.message);
  res.status(500).json({ success: false, error: '服务器内部错误' });
});

/**
 * 404
 */
app.use((_req: Request, res: Response) => {
  res.status(404).json({ success: false, error: '接口不存在' });
});

export default app;
