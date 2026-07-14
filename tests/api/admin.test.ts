/**
 * 管理员接口测试
 * 覆盖：登录、鉴权、点位列表筛选、详情、删除
 */
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import app from '../../api/app.js';

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '123456';
let token: string;

describe('管理员登录接口', () => {
  it('正确密码返回 token', async () => {
    const res = await request(app)
      .post('/api/admin/login')
      .send({ password: ADMIN_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.token).toBeTruthy();
    expect(typeof res.body.data.token).toBe('string');
    token = res.body.data.token;
  });

  it('错误密码返回 401', async () => {
    const res = await request(app)
      .post('/api/admin/login')
      .send({ password: 'wrong-password' });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('空密码返回 400', async () => {
    const res = await request(app)
      .post('/api/admin/login')
      .send({ password: '' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('缺少 password 字段返回 400', async () => {
    const res = await request(app).post('/api/admin/login').send({});

    expect(res.status).toBe(400);
  });
});

describe('管理员鉴权 - 受保护接口', () => {
  beforeAll(async () => {
    const res = await request(app)
      .post('/api/admin/login')
      .send({ password: ADMIN_PASSWORD });
    token = res.body.data.token;
  });

  it('无 Token 访问 /admin/points 返回 403', async () => {
    const res = await request(app).get('/api/admin/points');
    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  it('错误 Token 返回 403', async () => {
    const res = await request(app)
      .get('/api/admin/points')
      .set('Authorization', 'Bearer invalid.token');

    expect(res.status).toBe(403);
  });

  it('正确 Token 可访问 /admin/points', async () => {
    const res = await request(app)
      .get('/api/admin/points')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(140);
  });

  it('Authorization 不带 Bearer 前缀返回 403', async () => {
    const res = await request(app)
      .get('/api/admin/points')
      .set('Authorization', token);

    expect(res.status).toBe(403);
  });
});

describe('管理员点位列表筛选', () => {
  beforeAll(async () => {
    const res = await request(app)
      .post('/api/admin/login')
      .send({ password: ADMIN_PASSWORD });
    token = res.body.data.token;
  });

  it('filter=all 返回全部140个点位', async () => {
    const res = await request(app)
      .get('/api/admin/points?filter=all')
      .set('Authorization', `Bearer ${token}`);

    expect(res.body.data).toHaveLength(140);
  });

  it('filter=completed 返回已完成点位', async () => {
    const res = await request(app)
      .get('/api/admin/points?filter=completed')
      .set('Authorization', `Bearer ${token}`);

    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    // 初始状态下应都未完成
    expect(res.body.data.length).toBe(0);
  });

  it('filter=img_only 返回仅有图片的点位', async () => {
    const res = await request(app)
      .get('/api/admin/points?filter=img_only')
      .set('Authorization', `Bearer ${token}`);

    expect(res.body.success).toBe(true);
    for (const p of res.body.data) {
      expect(p.has_image).toBe(true);
      expect(p.has_video).toBe(false);
    }
  });

  it('无 filter 参数默认走 all 分支', async () => {
    const res = await request(app)
      .get('/api/admin/points')
      .set('Authorization', `Bearer ${token}`);

    expect(res.body.data).toHaveLength(140);
  });
});

describe('管理员点位详情接口', () => {
  beforeAll(async () => {
    const res = await request(app)
      .post('/api/admin/login')
      .send({ password: ADMIN_PASSWORD });
    token = res.body.data.token;
  });

  it('有效 ID 返回详情', async () => {
    const res = await request(app)
      .get('/api/admin/point/1')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(1);
    expect(res.body.data).toHaveProperty('img_path');
    expect(res.body.data).toHaveProperty('video_path');
    expect(res.body.data).toHaveProperty('has_image');
    expect(res.body.data).toHaveProperty('has_video');
  });

  it('无效 ID（非数字）返回 400', async () => {
    const res = await request(app)
      .get('/api/admin/point/abc')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('不存在的 ID 返回 404', async () => {
    const res = await request(app)
      .get('/api/admin/point/99999')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
  });
});

describe('管理员删除素材接口', () => {
  beforeAll(async () => {
    const res = await request(app)
      .post('/api/admin/login')
      .send({ password: ADMIN_PASSWORD });
    token = res.body.data.token;
  });

  it('无效 type 参数返回 400', async () => {
    const res = await request(app)
      .delete('/api/admin/material/1?type=invalid')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(400);
  });

  it('缺少 type 参数返回 400', async () => {
    const res = await request(app)
      .delete('/api/admin/material/1')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(400);
  });

  it('无素材时删除返回成功', async () => {
    const res = await request(app)
      .delete('/api/admin/material/1?type=img')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('无效 ID 返回 400', async () => {
    const res = await request(app)
      .delete('/api/admin/material/abc?type=img')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(400);
  });
});

describe('管理员下载接口', () => {
  beforeAll(async () => {
    const res = await request(app)
      .post('/api/admin/login')
      .send({ password: ADMIN_PASSWORD });
    token = res.body.data.token;
  });

  it('下载未上传的素材返回 404', async () => {
    const res = await request(app)
      .get('/api/admin/download/1?type=img')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  it('无效 type 返回 400', async () => {
    const res = await request(app)
      .get('/api/admin/download/1?type=bad')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(400);
  });
});

describe('管理员批量下载接口', () => {
  beforeAll(async () => {
    const res = await request(app)
      .post('/api/admin/login')
      .send({ password: ADMIN_PASSWORD });
    token = res.body.data.token;
  });

  it('无效 type 返回 400', async () => {
    const res = await request(app)
      .get('/api/admin/batch-download?type=invalid')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toContain('type');
  });

  it('缺少 type 返回 400', async () => {
    const res = await request(app)
      .get('/api/admin/batch-download')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(400);
  });

  it('无素材时返回 404', async () => {
    const res = await request(app)
      .get('/api/admin/batch-download?type=img')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toContain('可下载');
  });

  it('无 Token 返回 403', async () => {
    const res = await request(app).get('/api/admin/batch-download?type=img');
    expect(res.status).toBe(403);
  });
});
