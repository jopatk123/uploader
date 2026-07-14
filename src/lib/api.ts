/**
 * API 客户端
 */
import type { PointStatus, PointDetail, ApiResponse } from '@/types';

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
export async function adminDeleteMaterial(id: number, type: 'img' | 'video'): Promise<void> {
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
  type: 'img' | 'video',
  ext: string,
  onProgress: (percent: number) => void
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

function getDownloadFileName(id: number, type: 'img' | 'video', ext: string): string {
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
 * 管理员批量下载（zip 打包所有点位的图片或视频）
 * 由于 zip 流式生成无 Content-Length，用 blob 方式下载后触发保存
 */
export async function adminBatchDownload(
  type: 'img' | 'video',
): Promise<{ count: number; zipName: string }> {
  const res = await fetch(`/api/admin/batch-download?type=${type}`, {
    headers: { Authorization: `Bearer ${getToken()}` },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: '批量下载失败' }));
    throw new Error(err.error || '批量下载失败');
  }

  // 从 Content-Disposition 提取文件名
  const cd = res.headers.get('Content-Disposition') || '';
  const match = cd.match(/filename="([^"]+)"/);
  const zipName = match ? match[1] : `${type}_batch.zip`;

  const blob = await res.blob();
  triggerDownload(blob, zipName);

  // 从 zip 中无法预知文件数，返回 0 表示成功
  return { count: 0, zipName };
}
