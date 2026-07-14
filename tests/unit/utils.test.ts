/**
 * 前端工具函数单元测试
 */
import { describe, it, expect } from 'vitest';
import { cn } from '@/lib/utils';

describe('cn 工具函数', () => {
  it('合并多个 className', () => {
    expect(cn('foo', 'bar')).toBe('foo bar');
  });

  it('过滤 falsy 值', () => {
    expect(cn('foo', false, null, undefined, 'bar')).toBe('foo bar');
  });

  it('Tailwind 冲突类名去重（后者覆盖前者）', () => {
    expect(cn('px-2 py-1', 'px-4')).toBe('py-1 px-4');
  });

  it('对象形式条件类名', () => {
    expect(cn('base', { active: true, hidden: false })).toBe('base active');
  });

  it('空入参返回空字符串', () => {
    expect(cn()).toBe('');
  });
});
