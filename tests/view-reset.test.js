import { describe, it, expect } from 'vitest';
import {
  VIEW_RESET_MS,
  isViewResetDoubleTap,
  sampleViewReset,
  shouldResetViewOnDoubleActivate,
} from '../src/scene/SceneRuntime.js';

const HOME = { position: { x: 12.4, y: 8.1, z: 13.6 }, target: { x: 0.2, y: 1.4, z: -0.3 } };
const ORBITED = { position: { x: -4, y: 2, z: 3 }, target: { x: 6, y: 0.5, z: 4 } };

describe('双击归位：相机平滑回到首次取景的位置与目标', () => {
  it('t=0 停在当前轨道位置，不改写入参', () => {
    const fromPos = { ...ORBITED.position };
    const fromTarget = { ...ORBITED.target };
    const toPos = { ...HOME.position };
    const toTarget = { ...HOME.target };
    const sample = sampleViewReset(fromPos, fromTarget, toPos, toTarget, 0);
    expect(sample.done).toBe(false);
    expect(sample.position).toEqual(ORBITED.position);
    expect(sample.target).toEqual(ORBITED.target);
    expect(fromPos).toEqual(ORBITED.position);
    expect(toPos).toEqual(HOME.position);
  });

  it('t=1 精确落到调用方传入的初始位置与目标（不另写一套取景常数）', () => {
    const sample = sampleViewReset(ORBITED.position, ORBITED.target, HOME.position, HOME.target, 1);
    expect(sample.done).toBe(true);
    expect(sample.position).toEqual(HOME.position);
    expect(sample.target).toEqual(HOME.target);
  });

  it('中途连续插值，终点侧更近，且时长为正', () => {
    const mid = sampleViewReset(ORBITED.position, ORBITED.target, HOME.position, HOME.target, 0.5);
    const startDist = Math.hypot(ORBITED.position.x - HOME.position.x, ORBITED.position.y - HOME.position.y, ORBITED.position.z - HOME.position.z);
    const midDist = Math.hypot(mid.position.x - HOME.position.x, mid.position.y - HOME.position.y, mid.position.z - HOME.position.z);
    expect(mid.done).toBe(false);
    expect(midDist).toBeGreaterThan(0);
    expect(midDist).toBeLessThan(startDist * 0.5);
    expect(VIEW_RESET_MS).toBeGreaterThan(0);
  });

  it('空白处双击/双击触屏才归位；命中模型时留给单击选中', () => {
    expect(shouldResetViewOnDoubleActivate({ hitsModel: false })).toBe(true);
    expect(shouldResetViewOnDoubleActivate({ hitsModel: true })).toBe(false);
  });

  it('触屏：两次靠近的抬起算双击，拖远或间隔过长不算', () => {
    const first = { t: 1000, x: 40, y: 50 };
    expect(isViewResetDoubleTap(first, { t: 1200, x: 48, y: 55 })).toBe(true);
    expect(isViewResetDoubleTap(first, { t: 1200, x: 160, y: 50 })).toBe(false);
    expect(isViewResetDoubleTap(first, { t: 1600, x: 42, y: 51 })).toBe(false);
    expect(isViewResetDoubleTap(null, first)).toBe(false);
  });
});
