/**
 * @vitest-environment happy-dom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { EVENTS, listen } from '../src/events.js';
import * as ModelLoader from '../src/scene/ModelLoader.js';
import { SceneRuntime } from '../src/scene/SceneRuntime.js';

const STOP = {
  id: 'eq-silo-a',
  label: '原料仓 A',
  position: { x: 3, y: 2, z: 4 },
  target: { x: 0, y: 1, z: 0 },
  equipmentId: 'eq-silo-a',
};

function makeLoopRuntime() {
  const rt = Object.create(SceneRuntime.prototype);
  rt.model = new THREE.Group();
  rt._sceneConfig = { display: 'static', sunAzimuth: 45, sunElevation: 60 };
  rt._lastFrameTime = 0;
  rt.mixer = null;
  rt.control = {
    target: new THREE.Vector3(0, 1, 0),
    autoRotate: true,
    update() {},
    _sphericalDelta: { set() {} },
    _panOffset: { set() {} },
  };
  rt._viewReset = null;
  rt.entranceStart = 0;
  rt.exitingModel = null;
  rt._press = { current: 0, target: 0, velocity: 0 };
  rt._pressActive = false;
  rt._baseCameraZoom = 1;
  rt._baseModelScale = new THREE.Vector3(1, 1, 1);
  rt.camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
  rt.camera.position.set(12, 8, 14);
  rt.sun = { position: { set() {} } };
  rt._pCount = 0;
  rt._pGeo = { attributes: { position: { array: new Float32Array(0), needsUpdate: false } } };
  rt._pSpeed = new Float32Array(0);
  rt._frameCount = 0;
  rt._lastFpsTime = 0;
  rt._currentFps = 0;
  rt._parallax = { enabled: false, targetX: 0, targetY: 0, curX: 0, curY: 0, strength: 0, auto: false };
  rt._renderedFrames = 0;
  rt._skippedFrames = 0;
  rt._needsRender = false;
  rt.stereo = null;
  rt.renderer = {
    shadowMap: {},
    render() {},
    info: { render: { calls: 0, triangles: 0 } },
  };
  rt._scheduleFrame = () => {};
  rt._tour = null;
  rt._tourSaved = null;
  rt._cb = {};
  rt._importSeq = 0;
  rt._homePosition = rt.camera.position.clone();
  rt._homeTarget = rt.control.target.clone();
  window.__carouselConfig = { enabled: false };
  return rt;
}

afterEach(() => {
  vi.restoreAllMocks();
  window.__carouselConfig = { enabled: false };
  delete window._carouselTs;
});

describe('SceneRuntime 巡检', () => {
  it('startTour 后 autoRotate 为 false，stopTour 后还原，相机缓动目标等于巡检前机位', () => {
    const rt = makeLoopRuntime();
    rt.startTour([STOP], { dwellMs: 5000 });
    expect(rt.control.autoRotate).toBe(false);
    const saved = {
      pos: { ...rt._tourSaved.pos },
      target: { ...rt._tourSaved.target },
    };
    expect(saved.pos).toEqual({ x: 12, y: 8, z: 14 });
    rt.stopTour();
    expect(rt.control.autoRotate).toBe(true);
    expect(rt._tour.phase).toBe('idle');
    expect(rt._viewReset.toPos).toEqual(saved.pos);
    expect(rt._viewReset.toTarget).toEqual(saved.target);
  });

  it('拖动或缩放开始后 phase 变成 paused，缓动取消', () => {
    const rt = makeLoopRuntime();
    rt.startTour([STOP], { dwellMs: 5000 });
    expect(rt._tour.phase).toBe('flying');
    expect(rt._viewReset).not.toBeNull();
    rt._onControlStart();
    expect(rt._tour.phase).toBe('paused');
    expect(rt._viewReset).toBeNull();
  });

  it('到达带 equipmentId 的视点时派发 select', () => {
    const rt = makeLoopRuntime();
    const seen = [];
    const unlisten = listen(EVENTS.EQUIPMENT_SELECT, (event) => seen.push(event.detail));
    const now = vi.spyOn(performance, 'now');
    now.mockReturnValue(5_000);
    rt._lastFrameTime = 5_000;
    rt.startTour([STOP], { dwellMs: 5_000 });
    expect(seen).toEqual([]);
    now.mockReturnValue(6_200);
    rt._loop();
    unlisten();
    expect(seen).toEqual([{ id: 'eq-silo-a' }]);
    expect(rt._tour.phase).toBe('dwelling');
  });

  it('换模型时会调用 stopTour', async () => {
    vi.spyOn(ModelLoader, 'loadModelFile').mockRejectedValue(new Error('bad glb'));
    const rt = makeLoopRuntime();
    rt._cb = { onLoading() {}, onNotice() {} };
    const spy = vi.spyOn(rt, 'stopTour');
    await rt._importFile({ name: 'box.glb', size: 20 }, true);
    expect(spy).toHaveBeenCalled();
  });

  it('巡检飞行会出帧，静态停留不再为巡检单独出帧', () => {
    const rt = makeLoopRuntime();
    const now = vi.spyOn(performance, 'now');
    now.mockReturnValue(5_000);
    rt._lastFrameTime = 5_000;
    rt.startTour([{ id: 'overview', label: '总览', position: { x: 1, y: 2, z: 3 }, target: { x: 0, y: 0, z: 0 } }], { dwellMs: 5_000 });
    now.mockReturnValue(5_200);
    rt._loop();
    expect(rt._renderedFrames).toBe(1);
    now.mockReturnValue(6_200);
    rt._loop();
    const atDwell = rt._renderedFrames;
    expect(rt._tour.phase).toBe('dwelling');
    now.mockReturnValue(6_300);
    rt._loop();
    expect(rt._renderedFrames).toBe(atDwell);
    expect(rt._skippedFrames).toBeGreaterThan(0);
  });

  it('巡检进行时轮播不计时，退出后不会立刻切模型', () => {
    const rt = makeLoopRuntime();
    const seen = [];
    const unlisten = listen(EVENTS.ACTIVE_MODEL_CHANGE, (event) => seen.push(event.detail));
    window.__carouselConfig = { enabled: true, interval: 8, modelNames: ['a.glb', 'b.glb'] };
    localStorage.setItem('factory-active-model', 'a.glb');
    window._carouselTs = Date.now() - 20_000;
    rt._tour = {
      phase: 'flying',
      index: 0,
      stops: [STOP],
      dwellMs: 50_000,
      flyMs: 50_000,
      phaseStart: performance.now(),
      pausedPhase: null,
      pausedElapsed: 0,
    };
    rt._loop();
    unlisten();
    expect(seen).toEqual([]);
    expect(Date.now() - window._carouselTs).toBeLessThan(1_000);
  });

  it('切回默认模型会停巡检，之后不再飞向旧视点', () => {
    const rt = makeLoopRuntime();
    const phases = [];
    rt._cb = { onLoading() {}, onTourChange(phase) { phases.push(phase); } };
    rt._importSeq = 0;
    rt._displayMode = 'solid';
    rt._factory = () => new THREE.Group();
    rt.scene = new THREE.Scene();
    rt.scene.add(rt.model);
    rt._dropEquipmentSelection = () => {};
    rt._applyDeviceStatuses = () => {};
    rt._resetPress = () => {};
    rt._fit = () => { rt._cancelViewReset(); };
    const oldStop = {
      id: 'old-stop',
      label: '旧视点',
      position: { x: 30, y: 20, z: 40 },
      target: { x: 0, y: 1, z: 0 },
      equipmentId: 'eq-old',
    };
    const now = vi.spyOn(performance, 'now');
    now.mockReturnValue(1_000);
    rt._lastFrameTime = 1_000;
    rt.camera.position.set(12, 8, 14);
    rt.startTour([oldStop], { dwellMs: 5_000 });
    expect(rt._tour.phase).toBe('flying');
    expect(rt._viewReset.toPos).toEqual(oldStop.position);

    rt._showDefault();
    expect(rt._tour.phase).toBe('idle');
    expect(phases.at(-1)).toBe('idle');
    expect(rt._viewReset).toBeNull();
    const held = rt.camera.position.clone();

    now.mockReturnValue(1_000 + 1_200);
    rt._loop();
    now.mockReturnValue(1_000 + 1_200 + 5_000);
    rt._loop();
    expect(rt._tour.phase).toBe('idle');
    expect(rt._viewReset).toBeNull();
    expect(rt.camera.position.distanceTo(held)).toBeLessThan(0.05);
    expect(rt.camera.position.distanceTo(new THREE.Vector3(30, 20, 40))).toBeGreaterThan(5);
  });

  it('工具栏重置视角和预设视角会停掉巡检，镜头不被下一段巡检拉走', () => {
    const rt = makeLoopRuntime();
    rt._fit = () => { rt._cancelViewReset(); };
    const now = vi.spyOn(performance, 'now');
    now.mockReturnValue(2_000);
    rt.startTour([STOP], { dwellMs: 5_000 });
    rt._onReset();
    expect(rt._tour.phase).toBe('idle');
    expect(rt._viewReset).toBeNull();

    rt.startTour([STOP], { dwellMs: 5_000 });
    rt.setView('top');
    expect(rt._tour.phase).toBe('idle');
    const held = rt.camera.position.clone();
    now.mockReturnValue(2_000 + 1_200 + 5_000);
    rt._loop();
    expect(rt._tour.phase).toBe('idle');
    expect(rt._viewReset).toBeNull();
    expect(rt.camera.position.distanceTo(held)).toBeLessThan(0.05);
  });

  it('双击归位停掉巡检，缓动终点是 home', () => {
    const rt = makeLoopRuntime();
    rt.camera.position.set(9, 9, 9);
    rt.control.target.set(4, 4, 4);
    rt._homePosition = new THREE.Vector3(1, 2, 3);
    rt._homeTarget = new THREE.Vector3(0, 0.5, 0);
    rt.startTour([STOP], { dwellMs: 5000 });
    rt._beginViewReset();
    expect(rt._tour.phase).toBe('idle');
    expect(rt.control.autoRotate).toBe(true);
    expect(rt._viewReset.toPos).toEqual({ x: 1, y: 2, z: 3 });
    expect(rt._viewReset.toTarget).toEqual({ x: 0, y: 0.5, z: 0 });
  });
});
