/**
 * 分片上传接口端到端测试
 * 覆盖：分片上传、断点续传检查、合并、后缀/大小校验
 */
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import app from '../../api/app.js';
import fs from 'fs';
import path from 'path';

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '123456';
let token: string;

// 测试用：构造一个 1KB 的 "图片" buffer（仅测试分片流程，不测真实图片压缩）
function makeFakeImageBuffer(size: number): Buffer {
  return Buffer.alloc(size, 0xff);
}

describe('上传流程 - 分片接口', () => {
  beforeAll(async () => {
    const res = await request(app)
      .post('/api/admin/login')
      .send({ password: ADMIN_PASSWORD });
    token = res.body.data.token;
  });

  it('缺少必要参数返回 400', async () => {
    const res = await request(app).post('/api/upload/chunk').field('fileId', 'fid');

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toContain('缺少');
  });

  it('未上传分片文件返回 400', async () => {
    const res = await request(app)
      .post('/api/upload/chunk')
      .field('fileId', 'fid-1')
      .field('index', '0')
      .field('totalChunks', '1')
      .field('pointId', '1')
      .field('type', 'img')
      .field('fileName', 'test.jpg');

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('未收到');
  });

  it('成功上传单个分片', async () => {
    const buf = makeFakeImageBuffer(1024);
    const res = await request(app)
      .post('/api/upload/chunk')
      .field('fileId', 'fid-success')
      .field('index', '0')
      .field('totalChunks', '1')
      .field('pointId', '1')
      .field('type', 'img')
      .field('fileName', 'test.jpg')
      .attach('chunk', buf, { filename: 'chunk-0', contentType: 'application/octet-stream' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.fileId).toBe('fid-success');
    expect(res.body.data.index).toBe(0);
  });

  it('GET /check 返回已上传分片列表', async () => {
    // 先上传2个分片
    const buf = makeFakeImageBuffer(100);
    await request(app)
      .post('/api/upload/chunk')
      .field('fileId', 'fid-check')
      .field('index', '0')
      .field('totalChunks', '3')
      .field('pointId', '2')
      .field('type', 'img')
      .field('fileName', 't.jpg')
      .attach('chunk', buf, { filename: 'c0', contentType: 'application/octet-stream' });

    await request(app)
      .post('/api/upload/chunk')
      .field('fileId', 'fid-check')
      .field('index', '2')
      .field('totalChunks', '3')
      .field('pointId', '2')
      .field('type', 'img')
      .field('fileName', 't.jpg')
      .attach('chunk', buf, { filename: 'c2', contentType: 'application/octet-stream' });

    // 查询已上传分片
    const res = await request(app).get('/api/upload/check?fileId=fid-check');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.fileId).toBe('fid-check');
    expect(res.body.data.uploadedIndices).toContain(0);
    expect(res.body.data.uploadedIndices).toContain(2);
    expect(res.body.data.uploadedIndices).not.toContain(1);
  });

  it('GET /check 缺少 fileId 返回 400', async () => {
    const res = await request(app).get('/api/upload/check');
    expect(res.status).toBe(400);
  });

  it('GET /check 不存在的 fileId 返回空列表', async () => {
    const res = await request(app).get('/api/upload/check?fileId=not-exist');
    expect(res.status).toBe(200);
    expect(res.body.data.uploadedIndices).toEqual([]);
  });
});

describe('上传流程 - 合并接口', () => {
  beforeAll(async () => {
    const res = await request(app)
      .post('/api/admin/login')
      .send({ password: ADMIN_PASSWORD });
    token = res.body.data.token;
  });

  it('上传并合并图片素材，校验数据库与文件', async () => {
    const fileId = `fid-merge-${Date.now()}`;
    const buf = makeFakeImageBuffer(2048);

    // 上传1个分片
    await request(app)
      .post('/api/upload/chunk')
      .field('fileId', fileId)
      .field('index', '0')
      .field('totalChunks', '1')
      .field('pointId', '3')
      .field('type', 'img')
      .field('fileName', 'pic.jpg')
      .attach('chunk', buf, { filename: 'c0', contentType: 'application/octet-stream' });

    // 合并
    const mergeRes = await request(app)
      .post('/api/upload/complete')
      .send({ fileId, pointId: '3', type: 'img', fileName: 'pic.jpg' });

    expect(mergeRes.status).toBe(200);
    expect(mergeRes.body.success).toBe(true);
    expect(mergeRes.body.data.pointId).toBe(3);
    expect(mergeRes.body.data.type).toBe('img');
    expect(mergeRes.body.data.path).toContain('point_3');
    expect(mergeRes.body.data.path).toMatch(/\.jpg$/);

    // 通过管理员接口校验数据
    const detailRes = await request(app)
      .get('/api/admin/point/3')
      .set('Authorization', `Bearer ${token}`);

    expect(detailRes.body.data.has_image).toBe(true);
    expect(detailRes.body.data.img_path).toContain('point_3');
    expect(detailRes.body.data.upload_time).toBeTruthy();
  });

  it('非法 type 返回 400', async () => {
    const res = await request(app)
      .post('/api/upload/complete')
      .send({ fileId: 'fid', pointId: '1', type: 'invalid', fileName: 'a.jpg' });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('类型');
  });

  it('不允许的文件后缀返回 400', async () => {
    const res = await request(app)
      .post('/api/upload/complete')
      .send({ fileId: 'fid', pointId: '1', type: 'img', fileName: 'evil.exe' });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('后缀');
  });

  it('视频类型只允许 .mp4', async () => {
    const res = await request(app)
      .post('/api/upload/complete')
      .send({ fileId: 'fid', pointId: '1', type: 'video', fileName: 'v.avi' });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('后缀');
  });

  it('分片目录不存在返回 400', async () => {
    const res = await request(app)
      .post('/api/upload/complete')
      .send({
        fileId: 'not-exist-' + Date.now(),
        pointId: '1',
        type: 'img',
        fileName: 'a.jpg',
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('分片目录');
  });

  it('缺少必要参数返回 400', async () => {
    const res = await request(app)
      .post('/api/upload/complete')
      .send({ fileId: 'fid' });

    expect(res.status).toBe(400);
  });

  it('覆盖上传时旧文件被删除', async () => {
    const pointId = '4';
    const fileId1 = `fid-overwrite-1-${Date.now()}`;
    const buf = makeFakeImageBuffer(512);

    // 第一次上传
    await request(app)
      .post('/api/upload/chunk')
      .field('fileId', fileId1)
      .field('index', '0')
      .field('totalChunks', '1')
      .field('pointId', pointId)
      .field('type', 'img')
      .field('fileName', 'a.jpg')
      .attach('chunk', buf, { filename: 'c0', contentType: 'application/octet-stream' });

    const merge1 = await request(app)
      .post('/api/upload/complete')
      .send({ fileId: fileId1, pointId, type: 'img', fileName: 'a.jpg' });
    const firstPath = merge1.body.data.path;

    // 第二次上传（覆盖）
    const fileId2 = `fid-overwrite-2-${Date.now()}`;
    await request(app)
      .post('/api/upload/chunk')
      .field('fileId', fileId2)
      .field('index', '0')
      .field('totalChunks', '1')
      .field('pointId', pointId)
      .field('type', 'img')
      .field('fileName', 'b.jpg')
      .attach('chunk', buf, { filename: 'c0', contentType: 'application/octet-stream' });

    const merge2 = await request(app)
      .post('/api/upload/complete')
      .send({ fileId: fileId2, pointId, type: 'img', fileName: 'b.jpg' });

    expect(merge2.body.success).toBe(true);
    expect(merge2.body.data.path).not.toBe(firstPath);

    // 验证旧文件已被删除
    const DATA_DIR = process.env.DATA_DIR!;
    const oldFullPath = path.join(DATA_DIR, 'storage', firstPath);
    expect(fs.existsSync(oldFullPath)).toBe(false);

    // 新文件存在
    const newFullPath = path.join(DATA_DIR, 'storage', merge2.body.data.path);
    expect(fs.existsSync(newFullPath)).toBe(true);
  });

  it('上传完成后可通过 /admin/download 下载', async () => {
    const pointId = '5';
    const fileId = `fid-download-${Date.now()}`;
    const buf = makeFakeImageBuffer(1024);

    await request(app)
      .post('/api/upload/chunk')
      .field('fileId', fileId)
      .field('index', '0')
      .field('totalChunks', '1')
      .field('pointId', pointId)
      .field('type', 'img')
      .field('fileName', 'dl.jpg')
      .attach('chunk', buf, { filename: 'c0', contentType: 'application/octet-stream' });

    await request(app)
      .post('/api/upload/complete')
      .send({ fileId, pointId, type: 'img', fileName: 'dl.jpg' });

    const dlRes = await request(app)
      .get('/api/admin/download/5?type=img')
      .set('Authorization', `Bearer ${token}`);

    expect(dlRes.status).toBe(200);
    expect(dlRes.headers['content-disposition']).toContain('attachment');
    expect(dlRes.body.length).toBeGreaterThan(0);
  });

  it('上传完成后可通过 DELETE /admin/material 删除', async () => {
    const pointId = '6';
    const fileId = `fid-delete-${Date.now()}`;
    const buf = makeFakeImageBuffer(512);

    await request(app)
      .post('/api/upload/chunk')
      .field('fileId', fileId)
      .field('index', '0')
      .field('totalChunks', '1')
      .field('pointId', pointId)
      .field('type', 'img')
      .field('fileName', 'del.jpg')
      .attach('chunk', buf, { filename: 'c0', contentType: 'application/octet-stream' });

    await request(app)
      .post('/api/upload/complete')
      .send({ fileId, pointId, type: 'img', fileName: 'del.jpg' });

    // 删除
    const delRes = await request(app)
      .delete(`/api/admin/material/${pointId}?type=img`)
      .set('Authorization', `Bearer ${token}`);

    expect(delRes.status).toBe(200);
    expect(delRes.body.success).toBe(true);

    // 验证已删除
    const detailRes = await request(app)
      .get(`/api/admin/point/${pointId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(detailRes.body.data.has_image).toBe(false);
    expect(detailRes.body.data.img_path).toBeNull();
  });
});

describe('上传流程 - 多分片视频合并', () => {
  beforeAll(async () => {
    const res = await request(app)
      .post('/api/admin/login')
      .send({ password: ADMIN_PASSWORD });
    token = res.body.data.token;
  });

  it('上传3个分片并合并成视频文件', async () => {
    const fileId = `fid-multi-${Date.now()}`;
    const pointId = '7';
    const chunkSize = 100;
    const totalSize = chunkSize * 3;

    // 上传3个分片
    for (let i = 0; i < 3; i++) {
      const buf = Buffer.alloc(chunkSize, i + 1);
      await request(app)
        .post('/api/upload/chunk')
        .field('fileId', fileId)
        .field('index', String(i))
        .field('totalChunks', '3')
        .field('pointId', pointId)
        .field('type', 'video')
        .field('fileName', 'multi.mp4')
        .attach('chunk', buf, { filename: `c${i}`, contentType: 'application/octet-stream' });
    }

    // 合并
    const mergeRes = await request(app)
      .post('/api/upload/complete')
      .send({ fileId, pointId, type: 'video', fileName: 'multi.mp4' });

    expect(mergeRes.status).toBe(200);
    expect(mergeRes.body.data.size).toBe(totalSize);

    // 校验文件内容：分片按顺序拼接
    const DATA_DIR = process.env.DATA_DIR!;
    const fullPath = path.join(DATA_DIR, 'storage', mergeRes.body.data.path);
    const fileBuf = fs.readFileSync(fullPath);
    expect(fileBuf.length).toBe(totalSize);
    for (let i = 0; i < 3; i++) {
      const slice = fileBuf.subarray(i * chunkSize, (i + 1) * chunkSize);
      const expected = Buffer.alloc(chunkSize, i + 1);
      expect(slice.equals(expected)).toBe(true);
    }
  });
});
