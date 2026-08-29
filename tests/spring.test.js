import { describe, it, expect } from 'vitest';
import { stepPressSpring } from '../src/scene/SceneRuntime.js';

// 模拟物理时长：按指定刷新率步进 totalSeconds
function runSpring({ hz = 60, totalSeconds, targetSchedule = [] } = {}) {
  const p = { current: 0, target: 0, velocity: 0 };
  const dt = 1 / hz;
  const steps = Math.round(totalSeconds * hz);
  for (let i = 0; i < steps; i++) {
    const t = i * dt;
    for (const [at, value] of targetSchedule) {
      if (Math.abs(t - at) < dt / 2) p.target = value;
    }
    stepPressSpring(p, dt);
  }
  return p;
}

describe('stepPressSpring 按压回弹弹簧', () => {
  it('探针：target=1 后持续步进，current 必须明显上升（错误实现“不积分”会红）', () => {
    const p = { current: 0, target: 1, velocity: 0 };
    for (let i = 0; i < 12; i++) stepPressSpring(p, 1 / 60); // 200ms
    expect(p.current).toBeGreaterThan(0.5);
  });

  it('原地更新并返回同一个状态对象', () => {
    const p = { current: 0, target: 1, velocity: 0 };
    expect(stepPressSpring(p, 1 / 60)).toBe(p);
  });

  it('按下 140ms 后松开，1.5s 内收敛回 0（无残留形变）', () => {
    const p = runSpring({
      totalSeconds: 1.5,
      targetSchedule: [[0, 1], [0.14, 0]],
    });
    expect(Math.abs(p.current)).toBeLessThan(0.005);
    expect(Math.abs(p.velocity)).toBeLessThan(0.005);
  });

  it('收敛过程允许一次反向过冲（欠阻尼），但幅度被钳制在合理范围', () => {
    const p = { current: 0, target: 1, velocity: 0 };
    let min = Infinity;
    for (let i = 0; i < 90; i++) {
      const t = i / 60;
      if (t >= 0.14) p.target = 0;
      stepPressSpring(p, 1 / 60);
      min = Math.min(min, p.current);
    }
    expect(min).toBeGreaterThan(-0.15);
  });

  it('current 始终被钳制在 [-0.15, 1.15]，极端步长也不越界', () => {
    const p = { current: 0, target: 1, velocity: 50 }; // 异常大初速度
    for (let i = 0; i < 10; i++) stepPressSpring(p, 0.1);
    expect(p.current).toBeLessThanOrEqual(1.15);
    expect(p.current).toBeGreaterThanOrEqual(-0.15);
  });

  it('刷新率无关：60/144/240Hz 跑相同物理时长，终态与峰值基本一致', () => {
    const finalAt = (hz) => runSpring({ hz, totalSeconds: 1.5, targetSchedule: [[0, 1], [0.14, 0]] }).current;
    const f60 = finalAt(60);
    const f144 = finalAt(144);
    const f240 = finalAt(240);
    expect(Math.abs(f60 - f144)).toBeLessThan(0.01);
    expect(Math.abs(f60 - f240)).toBeLessThan(0.01);
  });

  it('dt=0 时状态冻结（暂停帧不产生运动）', () => {
    const p = { current: 0.4, target: 1, velocity: 2 };
    const snapshot = { ...p };
    stepPressSpring(p, 0);
    expect(p).toEqual(snapshot);
  });
});
