import { describe, it, expect } from 'vitest';
import {
  PARALLAX_EPS,
  parallaxSettled,
  shouldRenderFrame,
  shouldUpdateShadow,
} from '../src/scene/render-policy.js';

describe('parallaxSettled 视差收敛判定', () => {
  it('当前偏移等于目标偏移时视为收敛', () => {
    expect(parallaxSettled(0, 0, 0, 0)).toBe(true);
    expect(parallaxSettled(0.3, -0.2, 0.3, -0.2)).toBe(true);
  });

  it('任一轴仍在阻尼途中则未收敛', () => {
    expect(parallaxSettled(0.01, 0, 0, 0)).toBe(false);
    expect(parallaxSettled(0, 0.01, 0, 0)).toBe(false);
  });

  it('死区内视为收敛，死区外未收敛', () => {
    expect(parallaxSettled(PARALLAX_EPS / 2, 0, 0, 0)).toBe(true);
    expect(parallaxSettled(PARALLAX_EPS * 2, 0, 0, 0)).toBe(false);
  });
});

describe('shouldRenderFrame 帧渲染判定', () => {
  it('完全静态（无动画/无立体/视差关闭/无脏标记）时不渲染，回到空闲', () => {
    expect(shouldRenderFrame({
      needs: false, hasAnim: false, dualEye: false,
      parallaxEnabled: false, autoSway: false, settled: true,
    })).toBe(false);
  });

  it('显式脏标记、持续动画、双目输出都强制渲染', () => {
    const base = { hasAnim: false, dualEye: false, parallaxEnabled: false, autoSway: false, settled: true };
    expect(shouldRenderFrame({ ...base, needs: true })).toBe(true);
    expect(shouldRenderFrame({ ...base, hasAnim: true })).toBe(true);
    expect(shouldRenderFrame({ ...base, dualEye: true })).toBe(true);
  });

  it('【核心修复】视差开关开着但已收敛静止、且无其他动画时不再空渲染', () => {
    expect(shouldRenderFrame({
      needs: false, hasAnim: false, dualEye: false,
      parallaxEnabled: true, autoSway: false, settled: true,
    })).toBe(false);
  });

  it('视差阻尼未收敛时持续渲染，保证跟手', () => {
    expect(shouldRenderFrame({
      needs: false, hasAnim: false, dualEye: false,
      parallaxEnabled: true, autoSway: false, settled: false,
    })).toBe(true);
  });

  it('视差自动微摆时即便数值恰好收敛也持续渲染', () => {
    expect(shouldRenderFrame({
      needs: false, hasAnim: false, dualEye: false,
      parallaxEnabled: true, autoSway: true, settled: true,
    })).toBe(true);
  });
});

describe('shouldUpdateShadow 阴影按需重算', () => {
  it('静态查看（轨道旋转/视差）不重算阴影', () => {
    expect(shouldUpdateShadow({ hasAnim: false, shadowDirty: false })).toBe(false);
  });

  it('存在动画或阴影脏标记时重算', () => {
    expect(shouldUpdateShadow({ hasAnim: true, shadowDirty: false })).toBe(true);
    expect(shouldUpdateShadow({ hasAnim: false, shadowDirty: true })).toBe(true);
  });
});
