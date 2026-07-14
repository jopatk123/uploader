/**
 * 管理员接口（需 Admin Token 鉴权）
 */
import { Router } from 'express';
import path from 'path';
import fs from 'fs';
import { db, STORAGE_DIR } from '../db.js';
import { authMiddleware, generateToken, verifyPassword } from '../middleware/auth.js';

const router = Router();

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
      m.img_path, m.video_path, m.upload_time
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
    video_path: string | null;
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
    has_video: !!r.video_path,
    img_path: r.img_path,
    video_path: r.video_path,
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
      m.img_path, m.video_path, m.upload_time
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
    video_path: string | null;
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
      has_video: !!row.video_path,
    },
  });
});

/**
 * GET /api/admin/download/:id?type=img|video
 * 下载素材（流式传输）
 */
router.get('/download/:id', (req, res) => {
  const pointId = parseInt(req.params.id);
  const type = req.query.type as string;

  if (isNaN(pointId) || (type !== 'img' && type !== 'video')) {
    res.status(400).json({ success: false, error: '参数无效' });
    return;
  }

  const row = db.prepare(
    'SELECT img_path, video_path FROM point_material WHERE point_id = ?'
  ).get(pointId) as { img_path: string | null; video_path: string | null } | undefined;

  if (!row) {
    res.status(404).json({ success: false, error: '点位不存在' });
    return;
  }

  const relPath = type === 'img' ? row.img_path : row.video_path;
  if (!relPath) {
    res.status(404).json({ success: false, error: '该类型素材未上传' });
    return;
  }

  const fullPath = path.join(STORAGE_DIR, relPath);
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
 * DELETE /api/admin/material/:id?type=img|video
 * 删除素材
 */
router.delete('/material/:id', (req, res) => {
  const pointId = parseInt(req.params.id);
  const type = req.query.type as string;

  if (isNaN(pointId) || (type !== 'img' && type !== 'video')) {
    res.status(400).json({ success: false, error: '参数无效' });
    return;
  }

  const row = db.prepare(
    'SELECT img_path, video_path FROM point_material WHERE point_id = ?'
  ).get(pointId) as { img_path: string | null; video_path: string | null } | undefined;

  if (!row) {
    res.status(404).json({ success: false, error: '点位不存在' });
    return;
  }

  const relPath = type === 'img' ? row.img_path : row.video_path;
  if (!relPath) {
    res.json({ success: true, message: '无素材需删除' });
    return;
  }

  // 删除文件
  const fullPath = path.join(STORAGE_DIR, relPath);
  if (fs.existsSync(fullPath)) {
    fs.unlinkSync(fullPath);
  }

  // 更新数据库
  const column = type === 'img' ? 'img_path' : 'video_path';
  db.prepare(`
    UPDATE point_material SET ${column} = NULL WHERE point_id = ?
  `).run(pointId);

  res.json({ success: true, message: '素材已删除' });
});

export default router;
