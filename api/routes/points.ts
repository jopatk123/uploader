/**
 * 公开点位接口（上传页免鉴权）
 */
import { Router } from 'express';
import { db } from '../db.js';
import { formatBeijingTime, beijingTimestamp } from '../utils/time.js';

const router = Router();

/**
 * CSV 表格列定义（与 admin/stats-csv 保持一致）
 */
const STATS_CSV_COLUMNS: Array<{ key: string; header: string }> = [
  { key: 'id', header: '序号' },
  { key: 'city', header: '城市' },
  { key: 'district', header: '区县' },
  { key: 'shore_type', header: '岸段类型' },
  { key: 'lon', header: '经度' },
  { key: 'lat', header: '纬度' },
  { key: 'has_image', header: '主图片' },
  { key: 'has_image_alt', header: '备选图片' },
  { key: 'has_video', header: '主视频' },
  { key: 'has_video_alt', header: '备选视频' },
  { key: 'uploaded_count', header: '已上传素材数' },
  { key: 'status', header: '完成状态' },
  { key: 'upload_time', header: '最后上传时间' },
];

function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = typeof value === 'boolean' ? (value ? '是' : '否') : String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function describePointStatus(hasImage: boolean, hasVideo: boolean): string {
  if (hasImage && hasVideo) return '已完成（主图+主视频）';
  if (hasImage || hasVideo) return '部分完成';
  return '未上传';
}

/**
 * GET /api/points/stats-csv
 * 公开导出点位统计表格（CSV 格式，免鉴权）
 * 用于上传页面的公开访问场景，与 admin/stats-csv 返回相同格式
 */
router.get('/stats-csv', (_req, res) => {
  const rows = db
    .prepare(
      `
    SELECT
      p.id, p.city, p.district, p.lon, p.lat, p.shore_type,
      m.img_path, m.img_path_alt, m.video_path, m.video_path_alt, m.upload_time
    FROM point_info p
    LEFT JOIN point_material m ON p.id = m.point_id
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

  const dataRows = rows.map((r) => {
    const hasImage = !!r.img_path;
    const hasImageAlt = !!r.img_path_alt;
    const hasVideo = !!r.video_path;
    const hasVideoAlt = !!r.video_path_alt;
    const uploadedCount = [hasImage, hasImageAlt, hasVideo, hasVideoAlt].filter(Boolean).length;
    return {
      id: r.id,
      city: r.city,
      district: r.district,
      shore_type: r.shore_type,
      lon: r.lon,
      lat: r.lat,
      has_image: hasImage,
      has_image_alt: hasImageAlt,
      has_video: hasVideo,
      has_video_alt: hasVideoAlt,
      uploaded_count: uploadedCount,
      status: describePointStatus(hasImage, hasVideo),
      upload_time: formatBeijingTime(r.upload_time),
    };
  });

  const headerLine = STATS_CSV_COLUMNS.map((c) => escapeCsvCell(c.header)).join(',');
  const bodyLines = dataRows.map((row) =>
    STATS_CSV_COLUMNS.map((col) => escapeCsvCell(row[col.key as keyof typeof row])).join(','),
  );
  const csvContent = '\uFEFF' + headerLine + '\n' + bodyLines.join('\n') + '\n';

  // 生成文件名：stats_YYYYMMDD_HHmmss.csv（北京时间）
  const ts = beijingTimestamp();
  const fileName = `stats_${ts}.csv`;

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${fileName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
  );
  res.setHeader('X-Content-Type-Options', 'nosniff');

  console.log(`[points/stats-csv] 公开导出完成: ${dataRows.length} 行`);

  res.send(csvContent);
});

/**
 * GET /api/points
 * 获取全部140个点位列表（含素材上传状态）
 */
router.get('/', (_req, res) => {
  const rows = db
    .prepare(
      `
    SELECT
      p.id, p.city, p.district, p.lon, p.lat, p.shore_type,
      m.img_path, m.img_path_alt, m.video_path, m.video_path_alt, m.upload_time
    FROM point_info p
    LEFT JOIN point_material m ON p.id = m.point_id
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
    upload_time: r.upload_time,
  }));

  res.json({ success: true, data: points });
});

export default router;
