/**
 * 共享类型定义
 */

export interface PointInfo {
  id: number;
  city: string;
  district: string;
  lon: number;
  lat: number;
  shore_type: string;
}

export interface PointStatus extends PointInfo {
  has_image: boolean;
  has_video: boolean;
  upload_time: string | null;
}

export interface PointDetail extends PointStatus {
  img_path: string | null;
  video_path: string | null;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}
