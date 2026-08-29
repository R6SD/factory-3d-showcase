import { describe, it, expect } from 'vitest';
import { clamp01, easeOutCubic, easeOutExpo, tweenValue, ringDash } from '../src/ui/fx-utils.js';

describe('clamp01', () => {
  it('夹取到 [0,1]，非法值按 0', () => {
    expect(clamp01(-0.4)).toBe(0);
    expect(clamp01(1.7)).toBe(1);
    expect(clamp01(0.5)).toBe(0.5);
    expect(clamp01(NaN)).toBe(0);
    expect(clamp01('abc')).toBe(0);
  });
});

describe('缓动函数', () => {
  it('端点为 0/1', () => {
    expect(easeOutCubic(0)).toBe(0);
    expect(easeOutCubic(1)).toBe(1);
    expect(easeOutExpo(0)).toBe(0);
    expect(easeOutExpo(1)).toBe(1);
  });
  it('缓出在中段快于线性', () => {
    expect(easeOutCubic(0.5)).toBeCloseTo(0.875, 5);
    expect(easeOutCubic(0.5)).toBeGreaterThan(0.5);
  });
});

describe('tweenValue', () => {
  it('零时刻=起点、结束=终点', () => {
    expect(tweenValue(10, 20, 0, 1000)).toBeCloseTo(10);
    expect(tweenValue(10, 20, 1000, 1000)).toBeCloseTo(20);
  });
  it('缓出中点超过线性中点', () => {
    expect(tweenValue(10, 20, 500, 1000)).toBeGreaterThan(15);
  });
  it('duration<=0 直接到目标，非法起点不产生 NaN', () => {
    expect(tweenValue(10, 20, 0, 0)).toBe(20);
    expect(tweenValue(NaN, 20, 0, 800)).toBe(20);
    expect(Number.isNaN(tweenValue(NaN, NaN, 0, 800))).toBe(false);
  });
});

describe('ringDash', () => {
  const c = 100;
  it('零/满/半的描边与比例', () => {
    expect(ringDash(0, c).dash).toBe('0.000 100.000');
    expect(ringDash(0.5, c).dash).toBe('50.000 100.000');
    expect(ringDash(1, c).filled).toBe(1);
  });
  it('越界比例自动夹取', () => {
    expect(ringDash(5, c).filled).toBe(1);
    expect(ringDash(-3, c).filled).toBe(0);
  });
});
