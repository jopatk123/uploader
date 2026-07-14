/**
 * 分片上传接口（公开免鉴权）
 * 支持断点续传、分片合并、文件后缀/大小二次校验
 */
import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import fse from 'fs-extra';
import { db, STORAGE_DIR, TEMP_CHUNK_DIR } from '../db.js';

const router = Router();

// 分片大小：默认 5MB
const CHUNK_SIZE = parseInt(process.env.CHUNK_SIZE || '5', 10) * 1024 * 1024;
// 图片单文件上限：20MB
const IMAGE_MAX_SIZE = 20 * 1024 * 1024;
// 视频单文件上限：100MB
const VIDEO_MAX_SIZE = 100 * 1024 * 1024;

// 允许的文件后缀
const IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.webp'];
const VIDEO_EXTS = ['.mp4'];

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
 * 判断 type 是否为图片类
 */
function isImageType(type: string): boolean {
  return type === 'img' || type === 'img_alt';
}

/**
 * 校验 type 合法性，返回列名；非法返回 null
 */
function validateType(type: string): string | null {
  return TYPE_COLUMN[type] ?? null;
}

// multer 配置：使用内存存储，避免 destination 回调时 req.body 未解析的问题
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: CHUNK_SIZE + 1024 * 1024 }, // 留一点余量
});

/**
 * POST /api/upload/chunk
 * 上传单个分片
 * multipart: chunk(文件分片), index(分片序号), totalChunks(总分片数), fileId(文件唯一标识), pointId(点位ID), type(img|video), fileName(原始文件名)
 */
router.post('/chunk', upload.single('chunk'), (req, res) => {
  const { fileId, index, totalChunks, pointId, type, fileName } = req.body;

  if (!fileId || index === undefined || !totalChunks || !pointId || !type || !fileName) {
    res.status(400).json({ success: false, error: '缺少必要参数' });
    return;
  }

  if (!req.file) {
    res.status(400).json({ success: false, error: '未收到分片数据' });
    return;
  }

  // 手动保存分片到 temp_chunk/{fileId}/chunk-{index}
  const chunkDir = path.join(TEMP_CHUNK_DIR, fileId);
  fs.mkdirSync(chunkDir, { recursive: true });
  const chunkPath = path.join(chunkDir, `chunk-${index}`);
  fs.writeFileSync(chunkPath, req.file.buffer);

  res.json({
    success: true,
    data: { fileId, index: parseInt(index), totalChunks: parseInt(totalChunks) },
  });
});

/**
 * GET /api/upload/check?fileId=xxx
 * 断点续传校验：返回已上传的分片索引列表
 */
router.get('/check', (req, res) => {
  const { fileId } = req.query;
  if (!fileId || typeof fileId !== 'string') {
    res.status(400).json({ success: false, error: '缺少 fileId' });
    return;
  }

  const chunkDir = path.join(TEMP_CHUNK_DIR, fileId);
  const uploadedIndices: number[] = [];

  if (fs.existsSync(chunkDir)) {
    const files = fs.readdirSync(chunkDir);
    for (const f of files) {
      const match = f.match(/^chunk-(\d+)$/);
      if (match) {
        uploadedIndices.push(parseInt(match[1]));
      }
    }
  }

  res.json({ success: true, data: { fileId, uploadedIndices } });
});

/**
 * 安全删除文件，吞掉异常并打印警告
 */
function safeUnlink(p: string): void {
  if (!fs.existsSync(p)) return;
  try {
    fs.unlinkSync(p);
  } catch (err) {
    console.warn(`[upload/complete] 删除文件失败 ${p}:`, (err as Error).message);
  }
}

/**
 * POST /api/upload/complete
 * 全部分片上传完毕，合并文件
 * body: { fileId, pointId, type, fileName }
 *
 * 崩溃一致性策略（防止进程被杀导致数据库与文件系统不一致）：
 *   1. 分片合并到 .tmp 临时文件
 *   2. 大小校验通过后，原子 rename 到最终路径（同分区 rename 是原子操作）
 *   3. 在事务中查询旧路径并 UPDATE 数据库 → 指向新文件
 *   4. 提交事务后才删除旧文件（最坏情况留下孤儿文件，可被定时清理兜底）
 *   5. 最后清理分片临时目录
 *
 * 上述顺序确保任意时刻进程被杀：
 *   - 数据库始终指向「真实存在的文件」（旧文件或新文件）
 *   - 不会出现「数据库指向已删除文件」的破坏性场景
 */
router.post('/complete', async (req, res) => {
  const { fileId, pointId, type, fileName } = req.body;

  if (!fileId || !pointId || !type || !fileName) {
    res.status(400).json({ success: false, error: '缺少必要参数' });
    return;
  }

  const column = validateType(type);
  if (!column) {
    res.status(400).json({ success: false, error: '类型参数非法' });
    return;
  }

  // 后端二次校验文件后缀（图片类用图片后缀，视频类用视频后缀）
  const ext = path.extname(fileName).toLowerCase();
  const allowedExts = isImageType(type) ? IMAGE_EXTS : VIDEO_EXTS;
  if (!allowedExts.includes(ext)) {
    res.status(400).json({ success: false, error: `文件后缀不允许，仅支持 ${allowedExts.join(', ')}` });
    return;
  }

  const chunkDir = path.join(TEMP_CHUNK_DIR, fileId);
  if (!fs.existsSync(chunkDir)) {
    res.status(400).json({ success: false, error: '分片目录不存在，请重新上传' });
    return;
  }

  // 读取所有分片并按序号排序
  const chunkFiles = fs.readdirSync(chunkDir)
    .filter(f => f.match(/^chunk-\d+$/))
    .sort((a, b) => {
      const ai = parseInt(a.match(/^chunk-(\d+)$/)![1]);
      const bi = parseInt(b.match(/^chunk-(\d+)$/)![1]);
      return ai - bi;
    });

  if (chunkFiles.length === 0) {
    res.status(400).json({ success: false, error: '未找到分片文件' });
    return;
  }

  const pointStorageDir = path.join(STORAGE_DIR, `point_${pointId}`);
  await fse.ensureDir(pointStorageDir);

  const savedFileName = `${type}_${Date.now()}${ext}`;
  const savedFilePath = path.join(pointStorageDir, savedFileName);
  const tmpFilePath = `${savedFilePath}.tmp`; // 临时文件，合并成功后再 rename
  const relPath = path.join(`point_${pointId}`, savedFileName);

  let totalSize = 0;

  try {
    // ── 步骤1：合并分片到 .tmp 临时文件 ──
    const writeStream = fs.createWriteStream(tmpFilePath);
    for (const chunkFile of chunkFiles) {
      const chunkPath = path.join(chunkDir, chunkFile);
      const chunkBuf = fs.readFileSync(chunkPath);
      totalSize += chunkBuf.length;
      writeStream.write(chunkBuf);
    }
    writeStream.end();

    await new Promise<void>((resolve, reject) => {
      writeStream.on('finish', resolve);
      writeStream.on('error', reject);
    });

    // ── 步骤2：大小校验（在 rename 前，避免污染最终目录） ──
    const maxSize = isImageType(type) ? IMAGE_MAX_SIZE : VIDEO_MAX_SIZE;
    if (totalSize > maxSize) {
      safeUnlink(tmpFilePath);
      await fse.remove(chunkDir);
      res.status(400).json({
        success: false,
        error: `文件大小超过限制（${(maxSize / 1024 / 1024).toFixed(0)}MB）`,
      });
      return;
    }

    // ── 步骤3：原子 rename 临时文件到最终路径 ──
    // 同分区 rename 是原子操作，进程被杀时不会留下半截文件
    fs.renameSync(tmpFilePath, savedFilePath);

    // ── 步骤4：事务内查询旧路径并更新数据库 ──
    // better-sqlite3 同步执行 + transaction 保证查询+更新的原子性
    // 即使此处崩溃，最坏情况是新文件成孤儿，旧文件仍可访问，数据库一致性不受影响
    const { oldPath } = db.transaction(() => {
      const row = db.prepare(
        `SELECT ${column} AS old_path FROM point_material WHERE point_id = ?`
      ).get(pointId) as { old_path: string | null } | undefined;

      const old = row?.old_path ?? null;

      db.prepare(`
        UPDATE point_material
        SET ${column} = ?, upload_time = datetime('now')
        WHERE point_id = ?
      `).run(relPath, pointId);

      return { oldPath: old };
    })();

    // ── 步骤5：数据库提交后清理旧文件 ──
    // 放在事务外：即使删除失败也不影响数据库一致性，最坏留下孤儿文件
    if (oldPath) {
      const oldFullPath = path.join(STORAGE_DIR, oldPath);
      // 防御：避免误删新文件
      if (oldFullPath !== savedFilePath) {
        safeUnlink(oldFullPath);
      }
    }

    // ── 步骤6：清理分片临时目录 ──
    await fse.remove(chunkDir);

    res.json({
      success: true,
      data: { pointId: parseInt(pointId), type, path: relPath, size: totalSize },
    });
  } catch (err) {
    console.error('[upload/complete] 合并失败:', (err as Error).message);
    // 清理临时文件与最终文件（均可能因崩溃残留）
    safeUnlink(tmpFilePath);
    safeUnlink(savedFilePath);
    await fse.remove(chunkDir);
    res.status(500).json({ success: false, error: '文件合并失败' });
  }
});

export default router;
