/**
 * 全景图校验工具单元测试
 */
import { describe, it, expect } from 'vitest';
import { isPanoramicRatio, PANORAMIC_RATIO, hasGpsExif } from '@/lib/imageCheck';
import {
  makeJpegWithGpsExif,
  makeJpegWithoutGpsExif,
  makeJpegWithGpsLatOnly,
  makeJpegWithGpsExifBigEndian,
  makeJpegWithoutApp1,
  makeJpegWithXmpOnly,
  makePngBuffer,
} from '../helpers';

/** 将 Buffer 转为浏览器 File 对象（Node 18+ 全局可用） */
function bufferToFile(buf: Buffer, name: string, type = 'image/jpeg'): File {
  return new File([new Uint8Array(buf)], name, { type });
}

describe('imageCheck 工具函数', () => {
  describe('isPanoramicRatio', () => {
    it('正好 2:1 通过', () => {
      expect(isPanoramicRatio(200, 100)).toBe(true);
      expect(isPanoramicRatio(8000, 4000)).toBe(true);
      expect(isPanoramicRatio(4000, 2000)).toBe(true);
    });

    it('接近 2:1（±2% 容差内）通过', () => {
      // 2.02:1 — 容差边界
      expect(isPanoramicRatio(2020, 1000)).toBe(true);
      // 1.98:1 — 容差边界
      expect(isPanoramicRatio(1980, 1000)).toBe(true);
    });

    it('16:9 不通过', () => {
      expect(isPanoramicRatio(1920, 1080)).toBe(false);
    });

    it('1:1 不通过', () => {
      expect(isPanoramicRatio(1000, 1000)).toBe(false);
    });

    it('4:3 不通过', () => {
      expect(isPanoramicRatio(1024, 768)).toBe(false);
    });

    it('3:2 不通过', () => {
      expect(isPanoramicRatio(3000, 2000)).toBe(false);
    });

    it('远超 2:1 不通过', () => {
      expect(isPanoramicRatio(10000, 1000)).toBe(false); // 10:1
    });

    it('宽或高为 0 不通过', () => {
      expect(isPanoramicRatio(0, 100)).toBe(false);
      expect(isPanoramicRatio(100, 0)).toBe(false);
      expect(isPanoramicRatio(0, 0)).toBe(false);
    });

    it('负值不通过', () => {
      expect(isPanoramicRatio(-200, 100)).toBe(false);
      expect(isPanoramicRatio(200, -100)).toBe(false);
    });
  });

  describe('PANORAMIC_RATIO 常量', () => {
    it('值为 2', () => {
      expect(PANORAMIC_RATIO).toBe(2);
    });
  });

  describe('hasGpsExif', () => {
    it('JPEG 含完整 GPS（纬度+经度）返回 true', async () => {
      const file = bufferToFile(makeJpegWithGpsExif(), 'drone.jpg');
      await expect(hasGpsExif(file)).resolves.toBe(true);
    });

    it('JPEG 含 EXIF 但无 GPS IFD 返回 false', async () => {
      const file = bufferToFile(makeJpegWithoutGpsExif(), 'no-gps.jpg');
      await expect(hasGpsExif(file)).resolves.toBe(false);
    });

    it('JPEG 含 GPS IFD 但仅有纬度（无经度）返回 false', async () => {
      const file = bufferToFile(makeJpegWithGpsLatOnly(), 'lat-only.jpg');
      await expect(hasGpsExif(file)).resolves.toBe(false);
    });

    it('大端（MM）字节序 JPEG 含完整 GPS 返回 true', async () => {
      const file = bufferToFile(makeJpegWithGpsExifBigEndian(), 'big-endian.jpg');
      await expect(hasGpsExif(file)).resolves.toBe(true);
    });

    it('JPEG 无 APP1 段返回 false', async () => {
      const file = bufferToFile(makeJpegWithoutApp1(), 'no-app1.jpg');
      await expect(hasGpsExif(file)).resolves.toBe(false);
    });

    it('JPEG APP1 为 XMP（非 EXIF）返回 false', async () => {
      const file = bufferToFile(makeJpegWithXmpOnly(), 'xmp.jpg');
      await expect(hasGpsExif(file)).resolves.toBe(false);
    });

    it('PNG 文件跳过检测，返回 false', async () => {
      const png = makePngBuffer(200, 100);
      const file = bufferToFile(png, 'pano.png', 'image/png');
      await expect(hasGpsExif(file)).resolves.toBe(false);
    });

    it('文件名非 .jpg/.jpeg 且 MIME 非 jpeg 返回 false', async () => {
      const buf = makeJpegWithGpsExif();
      const file = bufferToFile(buf, 'photo.webp', 'image/webp');
      await expect(hasGpsExif(file)).resolves.toBe(false);
    });

    it('文件名 .jpeg 后缀也可识别', async () => {
      const file = bufferToFile(makeJpegWithGpsExif(), 'photo.jpeg');
      await expect(hasGpsExif(file)).resolves.toBe(true);
    });

    it('仅凭 MIME=image/jpeg 也可识别（即使扩展名非 jpg）', async () => {
      const file = bufferToFile(makeJpegWithGpsExif(), 'photo.bin', 'image/jpeg');
      await expect(hasGpsExif(file)).resolves.toBe(true);
    });

    it('空文件返回 false', async () => {
      const file = bufferToFile(Buffer.alloc(0), 'empty.jpg');
      await expect(hasGpsExif(file)).resolves.toBe(false);
    });

    it('损坏数据（非 JPEG 头）返回 false', async () => {
      const file = bufferToFile(Buffer.alloc(64, 0xab), 'broken.jpg');
      await expect(hasGpsExif(file)).resolves.toBe(false);
    });
  });
});
