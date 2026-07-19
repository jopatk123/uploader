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

// ────────────────── EXIF GPS 检测 ──────────────────
//
// 用户提示：无人机原片通常含 EXIF GPS 经纬度信息；
// 若图片经过微信/QQ 等工具发送，EXIF 通常被剥离。
// 上传成功后若无 GPS，将提示用户尽量上传无人机原片。
//
// 仅检测 JPEG（无人机原片默认 JPEG），PNG/WEBP 跳过检测不提示。

const JPEG_SOI = 0xd8; // Start of Image
const JPEG_APP1 = 0xe1; // APP1 段（EXIF / XMP）
const JPEG_SOS = 0xda; // Start of Scan（之后为压缩数据）

const EXIF_TIFF_TAG_GPS_IFD = 0x8825;
const EXIF_GPS_TAG_LATITUDE = 0x0002;
const EXIF_GPS_TAG_LONGITUDE = 0x0004;

/** 文件名/MIME 看起来像 JPEG */
function looksLikeJpeg(file: File): boolean {
  const lower = file.name.toLowerCase();
  return (
    lower.endsWith('.jpg') ||
    lower.endsWith('.jpeg') ||
    file.type === 'image/jpeg'
  );
}

/**
 * 检测 JPEG 文件是否包含 EXIF GPS 经纬度信息
 *
 * 通过解析 JPEG 的 APP1(Exif) 段，查找 GPS IFD 中是否存在
 * GPSLatitude(0x0002) 与 GPSLongitude(0x0004) 标签。
 *
 * 仅支持 JPEG。PNG/WEBP 等其他格式直接返回 false（不提示用户）。
 * 任何解析异常都视为「无 GPS」，安全降级。
 */
export async function hasGpsExif(file: File): Promise<boolean> {
  if (!looksLikeJpeg(file)) return false;

  try {
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    const view = new DataView(buffer);

    // JPEG 必须以 FF D8 开头
    if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== JPEG_SOI) return false;

    let offset = 2;
    while (offset + 4 <= bytes.length) {
      if (bytes[offset] !== 0xff) break;
      // 跳过 0xFF 填充字节
      let marker = bytes[offset + 1];
      while (marker === 0xff && offset + 2 < bytes.length) {
        offset += 1;
        marker = bytes[offset + 1];
      }

      // standalone markers（无段长度）
      if (marker >= 0xd0 && marker <= 0xd9) {
        offset += 2;
        continue;
      }

      const segLength = (bytes[offset + 2] << 8) | bytes[offset + 3];
      if (segLength < 2 || offset + 2 + segLength > bytes.length) break;

      // APP1 段：检查是否为 EXIF
      if (marker === JPEG_APP1 && segLength >= 8) {
        const exifIdOffset = offset + 4;
        if (
          bytes[exifIdOffset] === 0x45 && // E
          bytes[exifIdOffset + 1] === 0x78 && // x
          bytes[exifIdOffset + 2] === 0x69 && // i
          bytes[exifIdOffset + 3] === 0x66 && // f
          bytes[exifIdOffset + 4] === 0x00 &&
          bytes[exifIdOffset + 5] === 0x00
        ) {
          const tiffOffset = exifIdOffset + 6;
          if (checkGpsInTiff(view, tiffOffset)) return true;
        }
      }

      offset += 2 + segLength;
      if (marker === JPEG_SOS) break; // 之后为压缩数据，无 APP 段
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * 在 TIFF 数据中查找 GPS IFD，检查是否同时含经纬度标签
 */
function checkGpsInTiff(view: DataView, tiffOffset: number): boolean {
  if (tiffOffset + 8 > view.byteLength) return false;

  // 字节序：II(0x4949)=小端，MM(0x4d4d)=大端
  const byteOrder = view.getUint16(tiffOffset);
  const littleEndian = byteOrder === 0x4949;
  if (!littleEndian && byteOrder !== 0x4d4d) return false;

  const readU16 = (offset: number) => view.getUint16(offset, littleEndian);
  const readU32 = (offset: number) => view.getUint32(offset, littleEndian);

  // TIFF magic = 0x002A
  if (readU16(tiffOffset + 2) !== 0x002a) return false;

  // IFD0 偏移（相对 TIFF 起始）
  const ifd0Offset = tiffOffset + readU32(tiffOffset + 4);
  if (ifd0Offset + 2 > view.byteLength) return false;

  const ifd0Count = readU16(ifd0Offset);
  let gpsIfdPointer = 0;

  for (let i = 0; i < ifd0Count; i++) {
    const entryOffset = ifd0Offset + 2 + i * 12;
    if (entryOffset + 12 > view.byteLength) break;
    const tag = readU16(entryOffset);
    if (tag === EXIF_TIFF_TAG_GPS_IFD) {
      gpsIfdPointer = readU32(entryOffset + 8);
      break; // 找到 GPS IFD 即可
    }
  }

  if (gpsIfdPointer === 0) return false;

  const gpsIfdOffset = tiffOffset + gpsIfdPointer;
  if (gpsIfdOffset + 2 > view.byteLength) return false;

  const gpsCount = readU16(gpsIfdOffset);
  let hasLat = false;
  let hasLon = false;

  for (let i = 0; i < gpsCount; i++) {
    const entryOffset = gpsIfdOffset + 2 + i * 12;
    if (entryOffset + 12 > view.byteLength) break;
    const tag = readU16(entryOffset);
    if (tag === EXIF_GPS_TAG_LATITUDE) hasLat = true;
    else if (tag === EXIF_GPS_TAG_LONGITUDE) hasLon = true;
    if (hasLat && hasLon) return true;
  }

  return hasLat && hasLon;
}
