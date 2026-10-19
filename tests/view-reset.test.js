/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import * as ModelLoader from '../src/scene/ModelLoader.js';
import {
  VIEW_RESET_MS,
  SceneRuntime,
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

function poseOf(rt) {
  return {
    position: rt.camera.position.clone(),
    target: rt.control.target.clone(),
  };
}

function posesMatch(a, b) {
  return a.position.distanceTo(b.position) < 1e-4 && a.target.distanceTo(b.target) < 1e-4;
}

function makeViewRuntime() {
  const camera = new THREE.PerspectiveCamera(35, 1.6, 0.1, 200);
  camera.position.set(-8, 3, 6);
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2));
  mesh.position.set(0, 1, 0);
  mesh.name = 'device';
  const model = new THREE.Group();
  model.add(mesh);
  const rt = Object.create(SceneRuntime.prototype);
  Object.assign(rt, {
    camera,
    control: {
      target: new THREE.Vector3(6, 0.5, 4),
      minDistance: 0.1,
      maxDistance: 100,
      update() {},
      _sphericalDelta: { set() {} },
      _panOffset: { set() {} },
    },
    model,
    _viewReset: null,
    _needsRender: false,
    _homePosition: new THREE.Vector3(12.4, 8.1, 13.6),
    _homeTarget: new THREE.Vector3(0.2, 1.4, -0.3),
    _captureHome: false,
    _displayMode: 'solid',
    _press: { current: 0, target: 0, velocity: 0 },
    _pressActive: false,
    _importSeq: 0,
    _cb: { onLoading() {}, onNotice() {}, onModelLoaded() {} },
    scene: new THREE.Scene(),
    mixer: null,
    grid: { scale: { setScalar() {} }, position: { set() {} } },
    _particles: { position: { set() {} }, scale: { setScalar() {} } },
    _pMat: { size: 0.04 },
    sun: {
      position: new THREE.Vector3(),
      target: { position: new THREE.Vector3(), updateMatrixWorld() {} },
      shadow: {
        camera: { left: 0, right: 0, top: 0, bottom: 0, near: 0.5, far: 100, updateProjectionMatrix() {} },
        needsUpdate: false,
      },
    },
    renderer: { shadowMap: { needsUpdate: false }, domElement: { getBoundingClientRect() { return { left: 0, top: 0, width: 200, height: 200 }; } } },
    _initialFitDone: true,
  });
  rt.scene.add(model);
  return { rt, mesh };
}

function startReset(rt) {
  rt._beginViewReset();
  expect(rt._viewReset).not.toBeNull();
}

function advancePastReset(rt) {
  const start = rt._viewReset ? rt._viewReset.start : 0;
  rt._applyViewReset(start + 200);
  rt._applyViewReset(start + 500);
  rt._applyViewReset(start + VIEW_RESET_MS + 40);
}

describe('进行中的归位动画会被后续视角操作取消', () => {
  const key = (name) => ({ key: name, target: { tagName: 'DIV' } });

  it('不取消时，推进帧会把相机拉回 home', () => {
    const { rt } = makeViewRuntime();
    startReset(rt);
    const before = poseOf(rt);
    advancePastReset(rt);
    expect(posesMatch(poseOf(rt), before)).toBe(false);
    expect(rt.camera.position.distanceTo(rt._homePosition)).toBeLessThan(1e-4);
    expect(rt.control.target.distanceTo(rt._homeTarget)).toBeLessThan(1e-4);
  });

  it.each([
    ['setView(top)', (rt) => rt.setView('top')],
    ['setView(front)', (rt) => rt.setView('front')],
    ['setView(side)', (rt) => rt.setView('side')],
    ['focusNode', (rt, mesh) => rt.focusNode(mesh.uuid)],
    ['R 键', (rt) => rt._onKey(key('r'))],
    ['T 键', (rt) => rt._onKey(key('t'))],
    ['F 键', (rt) => rt._onKey(key('F'))],
    ['S 键', (rt) => rt._onKey(key('s'))],
    ['EVENTS.RESET', (rt) => rt._onReset()],
    ['切回默认模型', (rt) => rt._showDefault()],
    ['fit()', (rt) => rt.fit()],
  ])('%s 之后推进帧，新机位保持不变', (_label, act) => {
    const { rt, mesh } = makeViewRuntime();
    startReset(rt);
    act(rt, mesh);
    expect(rt._viewReset).toBeNull();
    const held = poseOf(rt);
    advancePastReset(rt);
    expect(posesMatch(poseOf(rt), held)).toBe(true);
  });

  it('T/F/S 键落到对应预设，而不是停在轨道中途', () => {
    const expectedOf = (preset) => {
      const { rt } = makeViewRuntime();
      rt.setView(preset);
      return poseOf(rt);
    };
    for (const [keyName, preset] of [['t', 'top'], ['f', 'front'], ['s', 'side']]) {
      const { rt } = makeViewRuntime();
      startReset(rt);
      rt._onKey(key(keyName));
      const want = expectedOf(preset);
      expect(rt.camera.position.distanceTo(want.position)).toBeLessThan(1e-4);
      expect(rt.control.target.distanceTo(want.target)).toBeLessThan(1e-4);
      advancePastReset(rt);
      expect(rt.camera.position.distanceTo(want.position)).toBeLessThan(1e-4);
    }
  });

  it('导入新模型会取消归位，拟合后的机位保持不变', async () => {
    const object = new THREE.Group();
    object.add(new THREE.Mesh(new THREE.BoxGeometry(4, 1, 1)));
    vi.spyOn(ModelLoader, 'loadModelFile').mockResolvedValue({ object, mixer: null });
    const { rt } = makeViewRuntime();
    startReset(rt);
    await rt._importFile({ name: 'box.glb', size: 100 }, true);
    expect(rt._viewReset).toBeNull();
    const held = poseOf(rt);
    advancePastReset(rt);
    expect(posesMatch(poseOf(rt), held)).toBe(true);
    expect(rt.model).toBe(object);
  });
});

describe('_pointerHitsModel 忽略隐藏几何', () => {
  function pickRuntime() {
    const { rt, mesh } = makeViewRuntime();
    rt.camera.position.set(0, 1, 6);
    rt.camera.lookAt(0, 1, 0);
    rt.camera.updateMatrixWorld(true);
    mesh.position.set(0, 1, 0);
    rt.model.updateMatrixWorld(true);
    const event = { clientX: 100, clientY: 100 };
    return { rt, mesh, event };
  }

  it('可见网格算命中；自身或祖先 visible=false 时不算', () => {
    const { rt, mesh, event } = pickRuntime();
    expect(rt._pointerHitsModel(event)).toBe(true);
    mesh.visible = false;
    expect(rt._pointerHitsModel(event)).toBe(false);
    mesh.visible = true;
    mesh.parent.visible = false;
    expect(rt._pointerHitsModel(event)).toBe(false);
    mesh.parent.visible = true;
    const hidden = new THREE.Group();
    hidden.visible = false;
    mesh.parent.remove(mesh);
    hidden.add(mesh);
    rt.model.add(hidden);
    rt.model.updateMatrixWorld(true);
    expect(mesh.visible).toBe(true);
    expect(rt._pointerHitsModel(event)).toBe(false);
  });

  it('隐藏的祖先组不算命中：子网格和直接父组都保持 visible', () => {
    const { rt, mesh, event } = pickRuntime();
    const inner = new THREE.Group();
    const outer = new THREE.Group();
    outer.visible = false;
    mesh.parent.remove(mesh);
    inner.add(mesh);
    outer.add(inner);
    rt.model.add(outer);
    rt.model.updateMatrixWorld(true);

    expect(mesh.visible).toBe(true);
    expect(inner.visible).toBe(true);
    expect(outer.visible).toBe(false);

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(0, 0), rt.camera);
    const raw = raycaster.intersectObject(rt.model, true);
    expect(raw.some((hit) => hit.object === mesh)).toBe(true);
    expect(rt._pointerHitsModel(event)).toBe(false);
  });
});
