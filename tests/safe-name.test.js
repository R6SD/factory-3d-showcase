import { describe, it, expect } from 'vitest';
import { safeModelName } from '../electron/safe-name.cjs';

// 直接测试 electron 主进程实际使用的净化函数（不再复制实现）
describe('safeModelName', () => {
  it('普通文件名保留', () => {
    expect(safeModelName('Factory Campus A.glb')).toBe('Factory Campus A.glb');
  });

  it('剥离目录路径，只保留 basename（正斜杠/反斜杠）', () => {
    expect(safeModelName('C:/Users/me/models/a.glb')).toBe('a.glb');
    expect(safeModelName('C:\\Users\\me\\models\\a.glb')).toBe('a.glb');
    expect(safeModelName('../secret.glb')).toBe('secret.glb');
  });

  it('Windows 非法字符替换为下划线（避开单字母盘符歧义）', () => {
    expect(safeModelName('a<b>.glb')).toBe('a_b_.glb');
    expect(safeModelName('rpt:v1|x.glb')).toBe('rpt_v1_x.glb');
    expect(safeModelName('a"b|c*.glb')).toBe('a_b_c_.glb');
  });

  it('Windows 下单字母+冒号被当作驱动器相对路径剥离，结果仍不含非法字符/路径', () => {
    const out = safeModelName('a:b?.glb');
    expect(out).not.toMatch(/[<>:"/\\|?*]/);
    expect(out).not.toContain('..');
    if (process.platform === 'win32') expect(out).toBe('b_.glb'); // win32: a: 被视为盘符
  });

  it('空值、点路径返回 null', () => {
    expect(safeModelName('')).toBeNull();
    expect(safeModelName(null)).toBeNull();
    expect(safeModelName(undefined)).toBeNull();
    expect(safeModelName('.')).toBeNull();
    expect(safeModelName('..')).toBeNull();
  });

  it('trim 首尾空白', () => {
    expect(safeModelName('  a.glb ')).toBe('a.glb');
  });

  it('非字符串输入安全转换', () => {
    expect(safeModelName(123)).toBe('123');
  });
});
