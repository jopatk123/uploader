/**
 * 公开点位接口（上传页免鉴权）
 */
import { Router } from 'express';
import { db } from '../db.js';

const router = Router();

/**
 * GET /api/points
 * 获取全部140个点位列表（含素材上传状态）
 */
router.get('/', (_req, res) => {
  const rows = db.prepare(`
    SELECT
      p.id, p.city, p.district, p.lon, p.lat, p.shore_type,
      m.img_path, m.video_path, m.upload_time
    FROM point_info p
    LEFT JOIN point_material m ON p.id = m.point_id
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
    upload_time: r.upload_time,
  }));

  res.json({ success: true, data: points });
});

export default router;
