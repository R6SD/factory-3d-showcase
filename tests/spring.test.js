import { describe, it, expect } from 'vitest';

// 阻尼谐振子公式（与 app.jsx ModelSwitcher.setModelPress 中一致）
function dampedOscillator(from, omega = 14, zeta = 0.55) {
  const omegaD = omega * Math.sqrt(1 - zeta * zeta);
  const A = from - 1;
  const phi = Math.atan2(-zeta * omega * A, omegaD * A) || 0;
  const amp = A / Math.cos(phi);
  return (tSeconds) => {
    const env = Math.exp(-zeta * omega * tSeconds);
    return 1 + amp * env * Math.cos(omegaD * tSeconds + phi);
  };
}

describe('阻尼谐振子果冻回弹', () => {
  it('t=0 时从初始值开始', () => {
    const fn = dampedOscillator(0.9);
    expect(fn(0)).toBeCloseTo(0.9, 5);
  });

  it('t→∞ 时收敛到 1.0', () => {
    const fn = dampedOscillator(0.9);
    expect(fn(2.0)).toBeCloseTo(1.0, 3);
  });

  it('欠阻尼(ζ=0.55)应产生过冲', () => {
    const fn = dampedOscillator(0.9);
    let overshoot = false;
    for (let t = 0.05; t < 0.5; t += 0.02) {
      if (fn(t) > 1.0) { overshoot = true; break; }
    }
    expect(overshoot).toBe(true);
  });

  it('过冲幅度应随时间衰减', () => {
    const fn = dampedOscillator(0.9);
    const firstPeak = Math.abs(fn(0.15) - 1);
    const laterPeak = Math.abs(fn(0.5) - 1);
    expect(laterPeak).toBeLessThan(firstPeak);
  });

  it('临界阻尼(ζ=1)不应过冲', () => {
    const fn = dampedOscillator(0.9, 14, 1.0);
    let overshoot = false;
    for (let t = 0.01; t < 1.0; t += 0.02) {
      if (fn(t) > 1.0) { overshoot = true; break; }
    }
    expect(overshoot).toBe(false);
  });

  it('squish 横向膨胀补偿应保持体积近似守恒', () => {
    const s = 0.9;
    const stretch = 1 + (1 - s) * 0.45;
    const volume = s * stretch * stretch;
    expect(volume).toBeGreaterThan(0.95);
    expect(volume).toBeLessThan(1.05);
  });
});
