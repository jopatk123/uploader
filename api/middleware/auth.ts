/**
 * 管理员 Token 鉴权中间件
 */
import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';

const JWT_SECRET = process.env.JWT_SECRET || 'uploader-secret-key-2024';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '123456';

/**
 * 生成管理员 Token
 */
export function generateToken(): string {
  return jwt.sign({ role: 'admin' }, JWT_SECRET, { expiresIn: '24h' });
}

/**
 * 校验密码
 */
export function verifyPassword(password: string): boolean {
  return password === ADMIN_PASSWORD;
}

/**
 * 从请求中提取 Token（支持 Header 与 Query 两种方式）
 * Query 方式用于批量下载等需要浏览器原生流式下载的场景
 */
function extractToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  const queryToken = req.query?.token;
  if (typeof queryToken === 'string' && queryToken.length > 0) {
    return queryToken;
  }
  return null;
}

/**
 * 鉴权中间件：校验 Authorization Header 或 Query 参数中的 Token
 */
export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const token = extractToken(req);
  if (!token) {
    res.status(403).json({ success: false, error: '未提供认证Token，禁止访问' });
    return;
  }

  try {
    jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(403).json({ success: false, error: 'Token无效或已过期' });
  }
}
