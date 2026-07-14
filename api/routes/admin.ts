/**
 * 管理员接口（需 Admin Token 鉴权）
 */
import { Router } from 'express';
import path from 'path';
import fs from 'fs';
import archiver from 'archiver';
import { db, STORAGE_DIR } from '../db.js';
import { authMiddleware, generateToken, verifyPassword } from '../middleware/auth.js';

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

// 以下接口均需鉴权
router.use(authMiddleware);

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

  const rows = db.prepare(`
    SELECT
      p.id, p.city, p.district, p.lon, p.lat, p.shore_type,
      m.img_path, m.img_path_alt, m.video_path, m.video_path_alt, m.upload_time
    FROM point_info p
    LEFT JOIN point_material m ON p.id = m.point_id
    ${whereClause}
    ORDER BY p.id
  `).all() as Array<{
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

  const points = rows.map(r => ({
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

  const row = db.prepare(`
    SELECT
      p.id, p.city, p.district, p.lon, p.lat, p.shore_type,
      m.img_path, m.img_path_alt, m.video_path, m.video_path_alt, m.upload_time
    FROM point_info p
    LEFT JOIN point_material m ON p.id = m.point_id
    WHERE p.id = ?
  `).get(pointId) as {
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
  } | undefined;

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

  const row = db.prepare(
    `SELECT ${column} AS rel_path FROM point_material WHERE point_id = ?`
  ).get(pointId) as { rel_path: string | null } | undefined;

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

  const row = db.prepare(
    `SELECT ${column} AS rel_path FROM point_material WHERE point_id = ?`
  ).get(pointId) as { rel_path: string | null } | undefined;

  if (!row) {
    res.status(404).json({ success: false, error: '点位不存在' });
    return;
  }

  if (!row.rel_path) {
    res.json({ success: true, message: '无素材需删除' });
    return;
  }

  // 删除文件
  const fullPath = path.join(STORAGE_DIR, row.rel_path);
  if (fs.existsSync(fullPath)) {
    fs.unlinkSync(fullPath);
  }

  // 更新数据库
  db.prepare(`
    UPDATE point_material SET ${column} = NULL WHERE point_id = ?
  `).run(pointId);

  res.json({ success: true, message: '素材已删除' });
});

/**
 * GET /api/admin/batch-download?type=img|img_alt|video|video_alt
 * 批量下载所有点位的某类型素材（zip 流式打包）
 * 文件名规则：point_{id}_{city}_{district}_{type}.{ext}
 */
router.get('/batch-download', (req, res) => {
  const type = req.query.type as string;
  const column = validateType(type);
  if (!column) {
    res.status(400).json({ success: false, error: 'type 参数无效，仅支持 img / img_alt / video / video_alt' });
    return;
  }

  // 查询所有已上传该类型素材的点位
  const rows = db.prepare(`
    SELECT p.id, p.city, p.district, m.${column} AS rel_path
    FROM point_info p
    INNER JOIN point_material m ON p.id = m.point_id
    WHERE m.${column} IS NOT NULL
    ORDER BY p.id
  `).all() as Array<{ id: number; city: string; district: string; rel_path: string }>;

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
  const isVideo = type === 'video' || type === 'video_alt';

  // 设置响应头
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${zipName}"`);

  // 创建 archiver 实例（zip 格式，存储模式不压缩视频/已压缩图片）
  const archive = archiver('zip', {
    store: isVideo, // 视频已是压缩格式，仅存储不重复压缩
  });

  // 错误处理
  archive.on('error', (err: Error) => {
    console.error('[batch-download] archiver error:', err.message);
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: '打包失败' });
    } else {
      res.end();
    }
  });

  // 流式 pipe 到响应
  archive.pipe(res);

  // 逐个添加文件，跳过磁盘上不存在的
  let addedCount = 0;
  let skippedCount = 0;
  for (const row of rows) {
    const fullPath = path.join(STORAGE_DIR, row.rel_path);
    if (!fs.existsSync(fullPath)) {
      skippedCount++;
      continue;
    }
    // 文件名：point_{id}_{city}_{district}_{type}.{ext}
    const ext = path.extname(row.rel_path);
    const safeCity = row.city.replace(/[/\\:*?"<>|]/g, '_');
    const safeDistrict = row.district.replace(/[/\\:*?"<>|]/g, '_');
    const entryName = `point_${row.id}_${safeCity}_${safeDistrict}_${type}${ext}`;
    archive.file(fullPath, { name: entryName });
    addedCount++;
  }

  console.log(`[batch-download] ${type}打包: ${addedCount} 个文件, 跳过 ${skippedCount} 个缺失文件`);

  if (addedCount === 0) {
    // 所有文件都不存在，中断流
    archive.abort();
    if (!res.headersSent) {
      res.status(404).json({ success: false, error: '文件均不存在，无法下载' });
    }
    return;
  }

  // 完成打包
  archive.finalize();
});

export default router;
