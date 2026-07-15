/**
 * 全景图校验工具单元测试
 */
import { describe, it, expect } from 'vitest';
import { isPanoramicRatio, PANORAMIC_RATIO } from '@/lib/imageCheck';

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
});
