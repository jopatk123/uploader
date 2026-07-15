import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * 点位上传状态
 * - complete: 主图 + 主视频 均已上传
 * - partial:  仅上传其中之一
 * - empty:    均未上传
 */
export type PointState = 'complete' | 'partial' | 'empty';

/**
 * 依据主图 / 主视频上传情况判定点位状态
 * 仅基于 has_image 与 has_video，与备选素材无关，与全项目完成判定保持一致
 */
export function getPointState(hasImage: boolean, hasVideo: boolean): PointState {
  if (hasImage && hasVideo) return 'complete';
  if (hasImage || hasVideo) return 'partial';
  return 'empty';
}
