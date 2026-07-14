/**
 * 管理员接口（需 Admin Token 鉴权）
 */
import { Router } from 'express';
import path from 'path';
import fs from 'fs';
import archiver from 'archiver';
import { db, STORAGE_DIR } from '../db.js';
import { authMiddleware, ticketMiddleware, generateToken, verifyPassword, generateDownloadTicket } from '../middleware/auth.js';

const router = Router();

/**
 * 素材类型 → 数据库列名 映射
 * img / img_alt / video / video_alt
 */
const TYPE_COLUMN: Record<string, string> = {
  img: 'img_path',
  img_alt: 'img_path_alt',
  video: 'video_path',
  video_alt: 'video_path_alt',
};

/**
 * 校验 type 合法性，返回列名；非法返回 null
 */
function validateType(type: string): string | null {
  return TYPE_COLUMN[type] ?? null;
}

/**
 * POST /api/admin/login
 * 密码校验，返回 Token
 */
router.post('/login', (req, res) => {
  const { password } = req.body;
  if (!password) {
    res.status(400).json({ success: false, error: '请输入密码' });
    return;
  }

  if (!verifyPassword(password)) {
    res.status(401).json({ success: false, error: '密码错误' });
    return;
  }

  const token = generateToken();
  res.json({ success: true, data: { token } });
});

/**
 * GET /api/admin/batch-download?type=img|img_alt|video|video_alt&ticket=xxx
 * 批量下载所有点位的某类型素材（zip 流式打包）
 * 文件名规则：point_{id}_{city}_{district}_{type}.{ext}
 *
 * 鉴权方式：一次性下载票据（60秒有效，仅可用一次）
 * 票据通过 POST /api/admin/download-ticket（需 JWT 鉴权）获取
 *
 * 容错策略：
 *   - 磁盘上不存在的文件自动跳过，记录警告
 *   - 单个文件添加失败不影响其他文件
 *   - 客户端断开自动中止打包，释放资源
 *   - 全部文件不存在时返回 404
 */
router.get('/batch-download', ticketMiddleware, (req, res) => {
  const type = req.query.type as string;
  const column = validateType(type);
  if (!column) {
    res
      .status(400)
      .json({ success: false, error: 'type 参数无效，仅支持 img / img_alt / video / video_alt' });
    return;
  }

  // 查询所有已上传该类型素材的点位
  const rows = db
    .prepare(
      `
    SELECT p.id, p.city, p.district, m.${column} AS rel_path
    FROM point_info p
    INNER JOIN point_material m ON p.id = m.point_id
    WHERE m.${column} IS NOT NULL
    ORDER BY p.id
  `,
    )
    .all() as Array<{ id: number; city: string; district: string; rel_path: string }>;

  if (rows.length === 0) {
    res.status(404).json({ success: false, error: '没有可下载的素材' });
    return;
  }

  // 生成 zip 文件名
  const now = new Date();
  const ts = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
  const typeLabelMap: Record<string, string> = {
    img: 'images',
    img_alt: 'images_alt',
    video: 'videos',
    video_alt: 'videos_alt',
  };
  const zipName = `${typeLabelMap[type]}_${ts}.zip`;

  // 设置响应头
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${zipName}"`);
  // 告知浏览器保持连接，支持大文件长时间传输
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // 所有素材已是压缩格式（JPEG/PNG/WebP/MP4），统一用 store 模式避免重复压缩
  const archive = archiver('zip', { store: true });

  // ── 背压控制：客户端断开时中止打包 ──
  let clientDisconnected = false;
  const onClientClose = () => {
    if (!res.writableEnded) {
      clientDisconnected = true;
      archive.abort();
      console.log(`[batch-download] 客户端断开，已终止 ${type} 打包`);
    }
  };
  req.on('close', onClientClose);

  // ── 超时控制：30 分钟无响应则终止（防止僵尸连接） ──
  req.setTimeout(30 * 60 * 1000, () => {
    console.warn(`[batch-download] ${type} 打包超时，强制终止`);
    if (!res.writableEnded) {
      clientDisconnected = true;
      archive.abort();
      res.end();
    }
  });

  // ── archiver 错误处理 ──
  archive.on('error', (err: Error) => {
    if (clientDisconnected) return;
    console.error('[batch-download] archiver 致命错误:', err.message);
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: '打包失败' });
    }
  });

  // ── 完成日志 ──
  archive.on('finish', () => {
    console.log(`[batch-download] ${type} 打包完成`);
  });

  // 流式 pipe 到响应
  archive.pipe(res);

  // ── 逐个添加文件，逐文件容错 ──
  let addedCount = 0;
  let skippedCount = 0;

  for (const row of rows) {
    if (clientDisconnected) break;

    const fullPath = path.join(STORAGE_DIR, row.rel_path);

    // 磁盘文件不存在 → 跳过并记录警告
    if (!fs.existsSync(fullPath)) {
      console.warn(`[batch-download] 跳过缺失文件: ${row.rel_path}`);
      skippedCount++;
      continue;
    }

    // 安全文件名
    const ext = path.extname(row.rel_path);
    const safeCity = row.city.replace(/[/\\:*?"<>|]/g, '_');
    const safeDistrict = row.district.replace(/[/\\:*?"<>|]/g, '_');
    const entryName = `point_${row.id}_${safeCity}_${safeDistrict}_${type}${ext}`;

    try {
      archive.file(fullPath, { name: entryName });
      addedCount++;
    } catch (err) {
      // 单文件添加失败不影响整体
      console.error(`[batch-download] 添加失败 ${entryName}:`, (err as Error).message);
      skippedCount++;
    }
  }

  // 打印统计摘要
  console.log(
    `[batch-download] ${type} 统计: 成功 ${addedCount} 个, 跳过 ${skippedCount} 个 (共 ${rows.length} 条记录)`,
  );

  // ── 如果所有文件都无效 ──
  if (addedCount === 0) {
    // 清理监听器
    req.off('close', onClientClose);
    archive.abort();
    if (!res.headersSent) {
      // 清除之前设置的 zip 相关响应头，避免浏览器尝试下载 JSON
      res.removeHeader('Content-Type');
      res.removeHeader('Content-Disposition');
      res.removeHeader('X-Content-Type-Options');
      res.status(404).json({ success: false, error: '文件均不存在，无法下载' });
    }
    return;
  }

  // ── 完成打包，开始传输 ──
  archive.finalize();
});

// 以下接口均需鉴权
router.use(authMiddleware);

/**
 * POST /api/admin/download-ticket
 * 获取一次性下载票据（60秒有效，仅可用一次）
 * 用于浏览器原生下载场景，替代 URL 中直接传递 JWT token
 */
router.post('/download-ticket', (_req, res) => {
  const ticket = generateDownloadTicket();
  res.json({ success: true, data: { ticket } });
});

/**
 * GET /api/admin/points
 * 点位总览（含素材状态、上传时间），支持按状态筛选
 * query: filter=all|img_only|video_only|completed
 */
router.get('/points', (req, res) => {
  const filter = (req.query.filter as string) || 'all';

  let whereClause = '';
  if (filter === 'img_only') {
    whereClause = 'WHERE m.img_path IS NOT NULL AND m.video_path IS NULL';
  } else if (filter === 'video_only') {
    whereClause = 'WHERE m.img_path IS NULL AND m.video_path IS NOT NULL';
  } else if (filter === 'completed') {
    whereClause = 'WHERE m.img_path IS NOT NULL AND m.video_path IS NOT NULL';
  }

  const rows = db
    .prepare(
      `
    SELECT
      p.id, p.city, p.district, p.lon, p.lat, p.shore_type,
      m.img_path, m.img_path_alt, m.video_path, m.video_path_alt, m.upload_time
    FROM point_info p
    LEFT JOIN point_material m ON p.id = m.point_id
    ${whereClause}
    ORDER BY p.id
  `,
    )
    .all() as Array<{
    id: number;
    city: string;
    district: string;
    lon: number;
    lat: number;
    shore_type: string;
    img_path: string | null;
    img_path_alt: string | null;
    video_path: string | null;
    video_path_alt: string | null;
    upload_time: string | null;
  }>;

  const points = rows.map((r) => ({
    id: r.id,
    city: r.city,
    district: r.district,
    lon: r.lon,
    lat: r.lat,
    shore_type: r.shore_type,
    has_image: !!r.img_path,
    has_image_alt: !!r.img_path_alt,
    has_video: !!r.video_path,
    has_video_alt: !!r.video_path_alt,
    img_path: r.img_path,
    img_path_alt: r.img_path_alt,
    video_path: r.video_path,
    video_path_alt: r.video_path_alt,
    upload_time: r.upload_time,
  }));

  res.json({ success: true, data: points });
});

/**
 * GET /api/admin/point/:id
 * 点位详情
 */
router.get('/point/:id', (req, res) => {
  const pointId = parseInt(req.params.id);
  if (isNaN(pointId)) {
    res.status(400).json({ success: false, error: '点位ID无效' });
    return;
  }

  const row = db
    .prepare(
      `
    SELECT
      p.id, p.city, p.district, p.lon, p.lat, p.shore_type,
      m.img_path, m.img_path_alt, m.video_path, m.video_path_alt, m.upload_time
    FROM point_info p
    LEFT JOIN point_material m ON p.id = m.point_id
    WHERE p.id = ?
  `,
    )
    .get(pointId) as
    | {
        id: number;
        city: string;
        district: string;
        lon: number;
        lat: number;
        shore_type: string;
        img_path: string | null;
        img_path_alt: string | null;
        video_path: string | null;
        video_path_alt: string | null;
        upload_time: string | null;
      }
    | undefined;

  if (!row) {
    res.status(404).json({ success: false, error: '点位不存在' });
    return;
  }

  res.json({
    success: true,
    data: {
      ...row,
      has_image: !!row.img_path,
      has_image_alt: !!row.img_path_alt,
      has_video: !!row.video_path,
      has_video_alt: !!row.video_path_alt,
    },
  });
});

/**
 * GET /api/admin/download/:id?type=img|img_alt|video|video_alt
 * 下载素材（流式传输）
 */
router.get('/download/:id', (req, res) => {
  const pointId = parseInt(req.params.id);
  const type = req.query.type as string;
  const column = validateType(type);

  if (isNaN(pointId) || !column) {
    res.status(400).json({ success: false, error: '参数无效' });
    return;
  }

  const row = db
    .prepare(`SELECT ${column} AS rel_path FROM point_material WHERE point_id = ?`)
    .get(pointId) as { rel_path: string | null } | undefined;

  if (!row) {
    res.status(404).json({ success: false, error: '点位不存在' });
    return;
  }

  if (!row.rel_path) {
    res.status(404).json({ success: false, error: '该类型素材未上传' });
    return;
  }

  const fullPath = path.join(STORAGE_DIR, row.rel_path);
  if (!fs.existsSync(fullPath)) {
    res.status(404).json({ success: false, error: '文件不存在' });
    return;
  }

  const fileName = path.basename(fullPath);
  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  res.setHeader('Content-Length', fs.statSync(fullPath).size);

  const stream = fs.createReadStream(fullPath);
  stream.on('error', () => {
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: '文件读取失败' });
    }
  });
  // 客户端断开时销毁 stream，避免资源泄漏
  res.on('close', () => {
    stream.destroy();
  });
  stream.pipe(res);
});

/**
 * DELETE /api/admin/material/:id?type=img|img_alt|video|video_alt
 * 删除素材
 */
router.delete('/material/:id', (req, res) => {
  const pointId = parseInt(req.params.id);
  const type = req.query.type as string;
  const column = validateType(type);

  if (isNaN(pointId) || !column) {
    res.status(400).json({ success: false, error: '参数无效' });
    return;
  }

  const row = db
    .prepare(`SELECT ${column} AS rel_path FROM point_material WHERE point_id = ?`)
    .get(pointId) as { rel_path: string | null } | undefined;

  if (!row) {
    res.status(404).json({ success: false, error: '点位不存在' });
    return;
  }

  if (!row.rel_path) {
    res.json({ success: true, message: '无素材需删除' });
    return;
  }

  const fullPath = path.join(STORAGE_DIR, row.rel_path);

  // 先更新数据库（与 /complete 策略一致：先DB后文件，最坏留孤儿文件而非DB指向已删文件）
  // 若该素材是该点位最后一个，同步清空 upload_time
  db.transaction(() => {
    db.prepare(`UPDATE point_material SET ${column} = NULL WHERE point_id = ?`).run(pointId);

    // 检查是否所有素材都已清空
    const remaining = db
      .prepare(
        `SELECT img_path, img_path_alt, video_path, video_path_alt FROM point_material WHERE point_id = ?`,
      )
      .get(pointId) as { img_path: string | null; img_path_alt: string | null; video_path: string | null; video_path_alt: string | null } | undefined;

    if (remaining && !remaining.img_path && !remaining.img_path_alt && !remaining.video_path && !remaining.video_path_alt) {
      db.prepare(`UPDATE point_material SET upload_time = NULL WHERE point_id = ?`).run(pointId);
    }
  })();

  // DB 提交后删除文件（失败则留孤儿文件，由定时清理兜底）
  if (fs.existsSync(fullPath)) {
    try {
      fs.unlinkSync(fullPath);
    } catch (err) {
      console.warn(`[admin/material] 删除文件失败 ${fullPath}:`, (err as Error).message);
    }
  }

  res.json({ success: true, message: '素材已删除' });
});

export default router;
