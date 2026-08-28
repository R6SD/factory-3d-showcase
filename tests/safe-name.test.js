import { describe, it, expect } from 'vitest';
const path = require('path');

// 与 electron/main.cjs 中一致的 safeModelName
function safeModelName(value) {
  const name = path.basename(String(value || '')).replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').trim();
  return name && name !== '.' && name !== '..' ? name : null;
}

describe('safeModelName 安全文件名', () => {
  it('正常文件名通过', () => {
    expect(safeModelName('factory.glb')).toBe('factory.glb');
    expect(safeModelName('my model.fbx')).toBe('my model.fbx');
  });

  it('去除路径，只保留文件名', () => {
    expect(safeModelName('/some/path/model.glb')).toBe('model.glb');
    expect(safeModelName('C:\\Users\\test\\model.obj')).toBe('model.obj');
  });

  it('非法字符替换为下划线', () => {
    expect(safeModelName('my<model>.glb')).toBe('my_model_.glb');
    // Windows 下 a: 被当作盘符，basename 返回 b_c_d_e.glb
    expect(safeModelName('a:b?c*d|e.glb')).toBe('b_c_d_e.glb');
    expect(safeModelName('x/y\\z.glb')).toBe('z.glb');
  });

  it('空值返回 null', () => {
    expect(safeModelName('')).toBeNull();
    expect(safeModelName(null)).toBeNull();
    expect(safeModelName(undefined)).toBeNull();
  });

  it('. 和 .. 返回 null', () => {
    expect(safeModelName('.')).toBeNull();
    expect(safeModelName('..')).toBeNull();
  });

  it('控制字符被替换', () => {
    expect(safeModelName('mod\x00el.glb')).toBe('mod_el.glb');
  });

  it('首尾空格被 trim', () => {
    expect(safeModelName('  model.glb  ')).toBe('model.glb');
  });
});
