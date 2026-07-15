/**
 * 全景图校验工具
 * 要求上传的图片像素比为 2:1（宽:高），例如 8000x4000、4000x2000
 */

/** 期望的宽高比（宽 / 高） */
export const PANORAMIC_RATIO = 2;

/** 容差：允许 ±2% 的偏差，兼容边缘像素取整 */
const RATIO_TOLERANCE = 0.02;

/**
 * 判断给定宽高是否符合全景图比例（2:1，允许 ±2% 容差）
 */
export function isPanoramicRatio(width: number, height: number): boolean {
  if (width <= 0 || height <= 0) return false;
  const ratio = width / height;
  return Math.abs(ratio - PANORAMIC_RATIO) <= RATIO_TOLERANCE * PANORAMIC_RATIO;
}

/**
 * 校验图片文件是否为全景图（2:1）
 * 通过浏览器原生 createImageBitmap 读取图片真实像素尺寸
 *
 * @returns 校验结果：ok 表示是否通过，width/height 为图片原始尺寸
 */
export async function checkPanoramic(
  file: File
): Promise<{ ok: boolean; width: number; height: number }> {
  // 优先使用 createImageBitmap（性能好，不污染 DOM）
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file);
      const { width, height } = bitmap;
      bitmap.close();
      return { ok: isPanoramicRatio(width, height), width, height };
    } catch {
      // createImageBitmap 失败（如格式不支持），回退到 Image 元素
    }
  }

  // 回退方案：通过 Image 元素 + URL.createObjectURL 读取尺寸
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const { naturalWidth, naturalHeight } = img;
      URL.revokeObjectURL(url);
      resolve({ ok: isPanoramicRatio(naturalWidth, naturalHeight), width: naturalWidth, height: naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('无法读取图片尺寸，文件可能已损坏'));
    };
    img.src = url;
  });
}
