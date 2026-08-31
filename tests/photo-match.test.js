import { describe, it, expect } from 'vitest';
import { photoFileOf, HALF_SUFFIX } from '../src/data/photo-match.js';

const list = [
  { name: '赵磊.jpg' },
  { name: '赵磊-半身.png' },
  { name: 'E-1023.jpg' },
  { name: '孙丽-half.webp' },
  { name: '随便一张.jpg' },
];

describe('photoFileOf 文件名匹配', () => {
  it('按姓名匹配大头照', () => {
    expect(photoFileOf(list, { name: '赵磊' }, 'head')).toBe('赵磊.jpg');
  });

  it('按姓名匹配半身照（-半身 / -half 后缀）', () => {
    expect(photoFileOf(list, { name: '赵磊' }, 'half')).toBe('赵磊-半身.png');
    expect(photoFileOf(list, { name: '孙丽' }, 'half')).toBe('孙丽-half.webp');
  });

  it('大头照模式不会误匹配半身照，反之亦然', () => {
    expect(photoFileOf(list, { name: '赵磊-半身' }, 'head')).toBe('');
    // 赵磊只有一张半身照时，大头照应落空
    expect(photoFileOf([{ name: '钱进-half.jpg' }], { name: '钱进' }, 'head')).toBe('');
    expect(photoFileOf([{ name: '钱进.jpg' }], { name: '钱进' }, 'half')).toBe('');
  });

  it('支持按工号匹配', () => {
    expect(photoFileOf(list, { id: 'E-1023' }, 'head')).toBe('E-1023.jpg');
  });

  it('人员显式 photo / photoHalf 字段优先，且无需出现在列表', () => {
    expect(photoFileOf([], { name: '甲', photo: 'custom-a.jpg' }, 'head')).toBe('custom-a.jpg');
    expect(photoFileOf(list, { name: '赵磊', photoHalf: 'override.png' }, 'half')).toBe('override.png');
  });

  it('空输入安全', () => {
    expect(photoFileOf(null, { name: '赵磊' }, 'head')).toBe('');
    expect(photoFileOf(list, null, 'head')).toBe('');
  });

  it('HALF_SUFFIX 规则', () => {
    expect(HALF_SUFFIX.test('赵磊-半身')).toBe(true);
    expect(HALF_SUFFIX.test('E1-half')).toBe(true);
    expect(HALF_SUFFIX.test('赵磊')).toBe(false);
  });
});
