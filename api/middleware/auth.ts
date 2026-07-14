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
 * 鉴权中间件：校验 Authorization Header 中的 Token
 */
export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(403).json({ success: false, error: '未提供认证Token，禁止访问' });
    return;
  }

  const token = authHeader.substring(7);
  try {
    jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(403).json({ success: false, error: 'Token无效或已过期' });
  }
}
