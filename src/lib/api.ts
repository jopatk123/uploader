/**
 * API 客户端
 */
import type { PointStatus, PointDetail, ApiResponse, MaterialType } from '@/types';

const TOKEN_KEY = 'uploader_admin_token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

/**
 * 获取全部点位状态
 */
export async function fetchPoints(): Promise<PointStatus[]> {
  const res = await fetch('/api/points');
  const json: ApiResponse<PointStatus[]> = await res.json();
  if (!json.success || !json.data) throw new Error(json.error || '获取点位失败');
  return json.data;
}

/**
 * 管理员登录
 */
export async function adminLogin(password: string): Promise<string> {
  const res = await fetch('/api/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  const json: ApiResponse<{ token: string }> = await res.json();
  if (!json.success || !json.data) throw new Error(json.error || '登录失败');
  return json.data.token;
}

/**
 * 管理员获取点位列表（带筛选）
 */
export async function adminFetchPoints(filter: string): Promise<PointStatus[]> {
  const res = await fetch(`/api/admin/points?filter=${filter}`, {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  const json: ApiResponse<PointStatus[]> = await res.json();
  if (!json.success || !json.data) throw new Error(json.error || '获取点位失败');
  return json.data;
}

/**
 * 管理员获取点位详情
 */
export async function adminFetchPointDetail(id: number): Promise<PointDetail> {
  const res = await fetch(`/api/admin/point/${id}`, {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  const json: ApiResponse<PointDetail> = await res.json();
  if (!json.success || !json.data) throw new Error(json.error || '获取详情失败');
  return json.data;
}

/**
 * 管理员删除素材
 */
export async function adminDeleteMaterial(id: number, type: MaterialType): Promise<void> {
  const res = await fetch(`/api/admin/material/${id}?type=${type}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  const json: ApiResponse<unknown> = await res.json();
  if (!json.success) throw new Error(json.error || '删除失败');
}

/**
 * 管理员下载素材（带进度回调）
 */
export async function adminDownload(
  id: number,
  type: MaterialType,
  ext: string,
  onProgress: (percent: number) => void,
): Promise<void> {
  const res = await fetch(`/api/admin/download/${id}?type=${type}`, {
    headers: { Authorization: `Bearer ${getToken()}` },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: '下载失败' }));
    throw new Error(err.error || '下载失败');
  }

  const contentLength = res.headers.get('Content-Length');
  const total = contentLength ? parseInt(contentLength) : 0;

  if (!res.body || !total) {
    // 无法获取进度，直接用 blob 下载
    const blob = await res.blob();
    triggerDownload(blob, getDownloadFileName(id, type, ext));
    onProgress(100);
    return;
  }

  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      received += value.length;
      onProgress(Math.round((received / total) * 100));
    }
  }

  const blob = new Blob(chunks as BlobPart[]);
  triggerDownload(blob, getDownloadFileName(id, type, ext));
  onProgress(100);
}

function getDownloadFileName(id: number, type: MaterialType, ext: string): string {
  return `point_${id}_${type}${ext}`;
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * 管理员批量下载（zip 打包所有点位的某类型素材）
 *
 * 使用浏览器原生流式下载（不经过内存缓冲），由服务端 archiver 流式生成 zip、
 * 浏览器自动保存到磁盘。适用于大文件场景（100MB+ 到数GB）。
 */
export async function adminBatchDownload(type: MaterialType): Promise<void> {
  const token = getToken();
  if (!token) throw new Error('未登录');

  // Token 通过 query 参数传递，使浏览器可以直接发起下载请求
  const url = `/api/admin/batch-download?type=${type}&token=${encodeURIComponent(token)}`;

  // 触发浏览器原生下载 —— 浏览器会流式接收数据、直接写盘、显示原生下载进度
  const a = document.createElement('a');
  a.href = url;
  a.download = ''; // 文件名由服务端 Content-Disposition 响应头决定
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
