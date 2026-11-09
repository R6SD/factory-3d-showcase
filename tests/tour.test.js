import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildDefaultStops, createTour, tourPause, tourResume, tourStart, tourStop, tourTick } from '../src/scene/tour.js';

const stops = [{ id: 'a', label: '甲' }, { id: 'b', label: '乙' }];

describe('巡检状态机', () => {
  it('状态按 idle → flying → dwelling → flying 推进，index 循环', () => {
    let tour = createTour(stops, { dwellMs: 5000, flyMs: 1200 });
    expect(tour.phase).toBe('idle');
    tour = tourStart(tour, 0);
    expect(tour.phase).toBe('flying');
    expect(tour.index).toBe(0);

    let step = tourTick(tour, 1199);
    expect(step.event).toBeNull();
    expect(step.tour.phase).toBe('flying');
    expect(step.tour.index).toBe(0);

    step = tourTick(step.tour, 1200);
    expect(step.event).toBe('arrive');
    expect(step.tour.phase).toBe('dwelling');
    expect(step.tour.index).toBe(0);

    step = tourTick(step.tour, 6199);
    expect(step.event).toBeNull();
    expect(step.tour.phase).toBe('dwelling');

    step = tourTick(step.tour, 6200);
    expect(step.event).toBe('leave');
    expect(step.tour.phase).toBe('flying');
    expect(step.tour.index).toBe(1);

    step = tourTick(step.tour, 7400);
    expect(step.event).toBe('arrive');
    expect(step.tour.index).toBe(1);
    step = tourTick(step.tour, 12400);
    expect(step.event).toBe('leave');
    expect(step.tour.phase).toBe('flying');
    expect(step.tour.index).toBe(0);
  });

  it('暂停时已过 700ms，恢复后剩余时间扣掉这 700ms', () => {
    let tour = tourStart(createTour(stops, { dwellMs: 5000, flyMs: 1200 }), 0);
    tour = tourPause(tour, 700);
    expect(tour.phase).toBe('paused');
    expect(tour.pausedElapsed).toBe(700);
    tour = tourResume(tour, 10_000);
    expect(tour.phase).toBe('flying');

    const early = tourTick(tour, 10_499);
    expect(early.event).toBeNull();
    expect(early.tour.phase).toBe('flying');
    const done = tourTick(tour, 10_500);
    expect(done.event).toBe('arrive');
    expect(done.tour.phase).toBe('dwelling');
  });

  it('stop 后回到 idle', () => {
    const started = tourStart(createTour(stops), 0);
    const stopped = tourStop(started);
    expect(stopped.phase).toBe('idle');
    const ticked = tourTick(stopped, 10_000);
    expect(ticked.event).toBeNull();
    expect(ticked.tour.phase).toBe('idle');
  });

  it('0 个视点时 start 不做任何事', () => {
    const tour = createTour([]);
    const next = tourStart(tour, 50);
    expect(next).toBe(tour);
    expect(next.phase).toBe('idle');
  });
});

describe('buildDefaultStops', () => {
  it('没有匹配设备时仍返回 4 个视点', () => {
    const model = new THREE.Mesh(new THREE.BoxGeometry(4, 2, 4));
    const runtime = {
      model,
      getHomeView: () => ({ position: { x: 8, y: 6, z: 8 }, target: { x: 0, y: 1, z: 0 } }),
      equipmentFrame: () => null,
    };
    const views = buildDefaultStops(runtime, [
      { id: 'missing', name: '不在模型里', status: 'alarm' },
    ]);
    expect(views).toHaveLength(4);
    expect(views[0].id).toBe('overview');
    expect(views[0].equipmentId).toBeUndefined();
    expect(views.every((stop) => stop.equipmentId == null)).toBe(true);
    const corner = views[1];
    const dx = corner.position.x - corner.target.x;
    const dz = corner.position.z - corner.target.z;
    expect(Math.abs(Math.abs(dx) - Math.abs(dz))).toBeLessThan(1e-6);
    expect(corner.position.y).toBeGreaterThan(corner.target.y);
    expect(corner.target.x).toBeCloseTo(0, 5);
    expect(corner.target.z).toBeCloseTo(0, 5);
  });

  it('告警设备排在总览后面，对不上的跳过，最多再加 5 台', () => {
    const runtime = {
      model: new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2)),
      getHomeView: () => ({ position: { x: 1, y: 1, z: 1 }, target: { x: 0, y: 0, z: 0 } }),
      equipmentFrame(id) {
        if (id === 'gone') return null;
        return {
          position: new THREE.Vector3(3, 4, 5),
          target: new THREE.Vector3(0, 1, 0),
        };
      },
    };
    const devices = [
      { id: 'n1', name: '正常', status: 'normal' },
      { id: 'a1', name: '告警乙', status: 'alarm' },
      { id: 'gone', name: '缺失', status: 'alarm' },
      { id: 'a2', name: '告警甲', status: 'alarm' },
      { id: 'd1', name: '离线', status: 'down' },
      { id: 'i1', name: '待机', status: 'idle' },
      { id: 'n2', name: '正常乙', status: 'normal' },
    ];
    const views = buildDefaultStops(runtime, devices);
    expect(views.map((stop) => stop.id)).toEqual(['overview', 'a2', 'a1', 'd1', 'i1', 'n1']);
    expect(views[1].equipmentId).toBe('a2');
    expect(views[1].label).toBe('告警甲');
    expect(views[1].position).toEqual({ x: 3, y: 4, z: 5 });
    expect(views.some((stop) => stop.id === 'gone' || stop.id === 'n2')).toBe(false);
  });
});
