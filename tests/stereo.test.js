import { describe, it, expect } from 'vitest';
import {
  STEREO_MODES, DUAL_EYE_MODES, clamp, normalizePointer, damp,
  parallaxEyeOffset, autoSway, StereoPipeline,
} from '../src/scene/stereo.js';

const rect = { left: 0, top: 0, width: 100, height: 100 };

describe('stereo 纯函数', () => {
  it('clamp 限定区间', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(11, 0, 10)).toBe(10);
  });

  it('normalizePointer 中心为 0，右/上为正', () => {
    expect(normalizePointer(50, 50, rect)).toEqual({ nx: 0, ny: 0 });
    expect(normalizePointer(0, 0, rect)).toEqual({ nx: -1, ny: 1 }); // 左上角：屏幕顶部对应相机上方为正
    expect(normalizePointer(100, 100, rect)).toEqual({ nx: 1, ny: -1 });
  });

  it('normalizePointer 对非法 rect 安全回落', () => {
    expect(normalizePointer(10, 10, null)).toEqual({ nx: 0, ny: 0 });
    expect(normalizePointer(10, 10, { width: 0, height: 0 })).toEqual({ nx: 0, ny: 0 });
  });

  it('damp 帧率无关：dt<=0 不动，随时间趋近目标', () => {
    expect(damp(0, 1, 6, 0)).toBe(0);
    const near = damp(0, 1, 100, 10);
    expect(near).toBeGreaterThan(0.99);
    expect(damp(0, 1, 6, 0.016)).toBeGreaterThan(0);
    expect(damp(0, 1, 6, 0.016)).toBeLessThan(1);
  });

  it('parallaxEyeOffset 乘以强度并夹断', () => {
    expect(parallaxEyeOffset(0, 0)).toEqual({ fx: 0, fy: 0 });
    expect(parallaxEyeOffset(1, -1, 0.4)).toEqual({ fx: 0.4, fy: -0.4 });
    expect(parallaxEyeOffset(1, 0, 5).fx).toBe(1); // strength 被夹到 1
  });

  it('autoSway 输出始终在幅度范围内', () => {
    expect(autoSway(0).nx).toBeCloseTo(0);
    for (let t = 0; t < 20; t += 0.7) {
      const p = autoSway(t);
      expect(Math.abs(p.nx)).toBeLessThanOrEqual(0.6 + 1e-9);
      expect(Math.abs(p.ny)).toBeLessThanOrEqual(0.36 + 1e-9);
    }
  });
});

describe('StereoPipeline', () => {
  // three 效果器构造时会调用 renderer.getSize，提供最小 stub，无需真实 WebGL
  const makeRenderer = () => ({
    renderCalls: 0,
    getSize(t) { t.width = 800; t.height = 600; return t; },
    setSize() {}, getPixelRatio() { return 1; },
    render() { this.renderCalls += 1; },
    setRenderTarget() {}, setScissorTest() {}, setScissor() {}, setViewport() {},
    setClearColor() {}, setClearAlpha() {}, clear() {},
  });

  it('模式集合完整且 off/parallax 为单目', () => {
    expect(STEREO_MODES).toEqual(['off', 'parallax', 'barrier', 'sbs', 'anaglyph']);
    const p = new StereoPipeline(makeRenderer());
    expect(p.isDualEye).toBe(false);
    p.setMode('parallax');
    expect(p.isDualEye).toBe(false);
    expect(p.effect).toBeNull();
  });

  it.each(DUAL_EYE_MODES)('%s 为双目模式并创建效果器', (mode) => {
    const p = new StereoPipeline(makeRenderer());
    p.setMode(mode);
    expect(p.isDualEye).toBe(true);
    expect(p.effect).not.toBeNull();
    p.dispose();
    expect(p.isDualEye).toBe(false);
  });

  it('非法模式回落 off', () => {
    const p = new StereoPipeline(makeRenderer());
    p.setMode('anaglyph');
    p.setMode('not-a-mode');
    expect(p.mode).toBe('off');
    expect(p.effect).toBeNull();
  });

  it('单目模式 render 走 renderer.render，renderPlain 始终单目', () => {
    const r = makeRenderer();
    const p = new StereoPipeline(r);
    p.render({}, {});
    expect(r.renderCalls).toBe(1);
    p.setMode('anaglyph');
    p.renderPlain({}, {}); // 截图路径强制单目
    expect(r.renderCalls).toBe(2);
  });

  it('setSize / setEyeSeparation 不抛错', () => {
    const p = new StereoPipeline(makeRenderer());
    expect(() => p.setSize(1024, 768)).not.toThrow();
    p.setMode('sbs');
    expect(() => { p.setSize(1024, 768); p.setEyeSeparation(0.064); }).not.toThrow();
  });
});
