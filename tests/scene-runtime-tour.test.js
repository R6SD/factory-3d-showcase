/**
 * @vitest-environment happy-dom
 */
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { getDevice } from '../src/data/selectors.js';
import { EVENTS, dispatch, listen } from '../src/events.js';
import * as ModelLoader from '../src/scene/ModelLoader.js';
import { SceneRuntime } from '../src/scene/SceneRuntime.js';
import { DeviceDetailPanel } from '../src/ui/viewer/DeviceDetailPanel.jsx';
import { DeviceListPanel } from '../src/ui/viewer/DeviceListPanel.jsx';

const STOP = {
  id: 'eq-silo-a',
  label: '原料仓 A',
  position: { x: 3, y: 2, z: 4 },
  target: { x: 0, y: 1, z: 0 },
  equipmentId: 'eq-silo-a',
};

const NEXT_STOP = {
  id: 'next',
  label: '下一站',
  position: { x: 80, y: 10, z: -40 },
  target: { x: 0, y: 1, z: 0 },
  equipmentId: 'eq-next',
};

const TOUR_DEVICES = [
  { id: 'eq-silo-a', name: '原料仓 A', status: 'alarm', line: '原料线', kpi: { oee: 71 } },
  { id: 'eq-line-c', name: '总装线 C', status: 'down', line: '总装线 C', kpi: { oee: 41 } },
];

const LIST_COPY = {
  deviceList: '设备列表',
  allStatus: '全部',
  sortBy: '排序',
  sortStatus: '状态',
  sortName: '名称',
  sortOee: 'OEE',
  notInModel: '模型中未找到',
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

  it.each(['t', 's', 'r', 'T', 'S', 'R'])('巡检中按 %s 后巡检停止，不再飞往下一视点', (key) => {
    const rt = makeLoopRuntime();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(4, 2, 6));
    mesh.position.set(1, 1, 0);
    rt.model.add(mesh);
    rt.grid = { scale: { setScalar() {} }, position: { set() {} } };
    rt._particles = { position: { set() {} }, scale: { setScalar() {} } };
    rt._pMat = { size: 0.04 };
    rt.sun = {
      position: new THREE.Vector3(),
      target: { position: new THREE.Vector3(), updateMatrixWorld() {} },
      shadow: { camera: { near: 0.5, far: 10, updateProjectionMatrix() {} }, needsUpdate: false },
    };
    rt._captureHome = false;
    const now = vi.spyOn(performance, 'now');
    now.mockReturnValue(3_000);
    rt._lastFrameTime = 3_000;
    rt.camera.position.set(12, 8, 14);
    rt.startTour([
      STOP,
      { id: 'next', label: '下一站', position: { x: 40, y: 10, z: -20 }, target: { x: 0, y: 1, z: 0 }, equipmentId: 'eq-next' },
    ], { dwellMs: 5_000 });
    expect(rt._tour.phase).toBe('flying');

    rt._onKey({ key, target: { tagName: 'DIV' } });
    expect(rt._tour.phase).toBe('idle');
    expect(rt._viewReset).toBeNull();
    const held = rt.camera.position.clone();
    expect(held.distanceTo(new THREE.Vector3(40, 10, -20))).toBeGreaterThan(5);

    now.mockReturnValue(3_000 + 1_200);
    rt._loop();
    now.mockReturnValue(3_000 + 1_200 + 5_000);
    rt._loop();
    expect(rt._tour.phase).toBe('idle');
    expect(rt._viewReset).toBeNull();
    expect(rt.camera.position.distanceTo(held)).toBeLessThan(0.05);
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

  it('巡检中点设备列表的当前设备：巡检停止，选中保留，详情面板打开，之后不再飞走', () => {
    const rt = makeLoopRuntime();
    armEquipment(rt);
    const selected = trackSelection();
    const now = vi.spyOn(performance, 'now');
    startDwelling(rt, now);
    expect(selected.id).toBe('eq-silo-a');

    clickListRow(rt, 'eq-silo-a');
    expect(rt._tour.phase).toBe('idle');
    expect(selected.id).toBe('eq-silo-a');
    expect(rt._selectedEquipmentId).toBe('eq-silo-a');
    expectDetailOpen(selected.id, 'eq-silo-a');

    now.mockReturnValue(11_900);
    rt._loop();
    expect(rt._viewReset).toBeNull();
    const held = rt.camera.position.clone();
    now.mockReturnValue(20_000);
    rt._loop();
    now.mockReturnValue(28_000);
    rt._loop();
    expect(rt._tour.phase).toBe('idle');
    expect(rt._viewReset).toBeNull();
    expect(rt.camera.position.distanceTo(held)).toBeLessThan(0.05);
    expect(rt.camera.position.distanceTo(new THREE.Vector3(80, 10, -40))).toBeGreaterThan(20);
    expect(selected.id).toBe('eq-silo-a');
    expectDetailOpen(selected.id, 'eq-silo-a');
    selected.unlisten();
  });

  it('巡检中点 3D 设备：巡检停止，选中保留，详情面板打开，之后不再飞走', () => {
    const rt = makeLoopRuntime();
    const { canvas } = armEquipment(rt);
    const selected = trackSelection();
    const now = vi.spyOn(performance, 'now');
    startDwelling(rt, now);
    expect(selected.id).toBe('eq-silo-a');
    rt.camera.updateMatrixWorld(true);
    rt.model.updateMatrixWorld(true);

    clickEquipment(canvas);
    expect(rt._tour.phase).toBe('idle');
    expect(rt._viewReset).toBeNull();
    expect(selected.id).toBe('eq-line-c');
    expect(rt._selectedEquipmentId).toBe('eq-line-c');
    expectDetailOpen(selected.id, 'eq-line-c');

    const held = rt.camera.position.clone();
    now.mockReturnValue(20_000);
    rt._loop();
    now.mockReturnValue(28_000);
    rt._loop();
    expect(rt._tour.phase).toBe('idle');
    expect(rt._viewReset).toBeNull();
    expect(rt.camera.position.distanceTo(held)).toBeLessThan(0.05);
    expect(rt.camera.position.distanceTo(new THREE.Vector3(80, 10, -40))).toBeGreaterThan(20);
    expect(selected.id).toBe('eq-line-c');
    expectDetailOpen(selected.id, 'eq-line-c');
    selected.unlisten();
  });

  it('巡检中按 F 切换全屏并停止巡检，相机留在原地且不再飞往下一视点', () => {
    const rt = makeLoopRuntime();
    armEquipment(rt);
    const selected = trackSelection();
    const page = document.createElement('div');
    page.className = 'viewer-page';
    const requestFullscreen = vi.fn();
    page.requestFullscreen = requestFullscreen;
    document.body.append(page);
    const now = vi.spyOn(performance, 'now');
    startDwelling(rt, now);
    expect(selected.id).toBe('eq-silo-a');
    const before = rt.camera.position.clone();

    rt._onKey({ key: 'F', target: { tagName: 'DIV' } });
    expect(requestFullscreen).toHaveBeenCalledTimes(1);
    expect(rt._tour.phase).toBe('idle');
    expect(rt._viewReset).toBeNull();
    expect(selected.id).toBeNull();
    expect(rt.camera.position.distanceTo(before)).toBeLessThan(0.05);
    expect(rt.camera.position.distanceTo(new THREE.Vector3(0, 1, 8))).toBeLessThan(0.05);

    const held = rt.camera.position.clone();
    now.mockReturnValue(20_000);
    rt._loop();
    now.mockReturnValue(28_000);
    rt._loop();
    expect(rt._tour.phase).toBe('idle');
    expect(rt._viewReset).toBeNull();
    expect(rt.camera.position.distanceTo(held)).toBeLessThan(0.05);

    rt._onKey({ key: 'f', target: { tagName: 'DIV' } });
    expect(requestFullscreen).toHaveBeenCalledTimes(2);
    expect(rt._tour.phase).toBe('idle');
    page.remove();
    selected.unlisten();
  });

  it('层级聚焦和双击归位停巡检，但不清用户自己的选中', () => {
    const rt = makeLoopRuntime();
    const { silo } = armEquipment(rt);
    const selected = trackSelection();
    dispatch(EVENTS.EQUIPMENT_SELECT, { id: 'eq-line-c' });
    expect(selected.id).toBe('eq-line-c');
    const now = vi.spyOn(performance, 'now');
    now.mockReturnValue(4_000);
    rt.camera.position.set(12, 8, 14);
    rt.startTour([STOP, NEXT_STOP], { dwellMs: 5_000 });
    expect(rt._tour.phase).toBe('flying');

    rt.focusNode(silo.uuid);
    expect(rt._tour.phase).toBe('idle');
    expect(selected.id).toBe('eq-line-c');
    expect(rt._selectedEquipmentId).toBe('eq-line-c');

    now.mockReturnValue(5_000);
    rt._homePosition = new THREE.Vector3(1, 2, 3);
    rt._homeTarget = new THREE.Vector3(0, 0.5, 0);
    rt.startTour([STOP], { dwellMs: 5_000 });
    rt._beginViewReset();
    expect(rt._tour.phase).toBe('idle');
    expect(rt._viewReset.toPos).toEqual({ x: 1, y: 2, z: 3 });
    expect(rt._viewReset.toTarget).toEqual({ x: 0, y: 0.5, z: 0 });
    expect(selected.id).toBe('eq-line-c');
    expect(rt._selectedEquipmentId).toBe('eq-line-c');
    selected.unlisten();
  });

  it('停止巡检、层级聚焦和双击归位会关掉巡检自己弹出的卡片', () => {
    const rt = makeLoopRuntime();
    const { silo } = armEquipment(rt);
    const selected = trackSelection();
    const now = vi.spyOn(performance, 'now');
    startDwelling(rt, now);
    expect(selected.id).toBe('eq-silo-a');
    rt.stopTour();
    expect(rt._tour.phase).toBe('idle');
    expect(selected.id).toBeNull();
    expect(rt._selectedEquipmentId).toBeNull();

    startDwelling(rt, now);
    expect(selected.id).toBe('eq-silo-a');
    rt.focusNode(silo.uuid);
    expect(rt._tour.phase).toBe('idle');
    expect(selected.id).toBeNull();

    startDwelling(rt, now);
    rt._homePosition = new THREE.Vector3(1, 2, 3);
    rt._homeTarget = new THREE.Vector3(0, 0.5, 0);
    rt._beginViewReset();
    expect(rt._tour.phase).toBe('idle');
    expect(selected.id).toBeNull();
    expect(rt._viewReset.toPos).toEqual({ x: 1, y: 2, z: 3 });
    selected.unlisten();
  });
});

function armEquipment(rt) {
  const silo = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshStandardMaterial());
  silo.position.set(10, 0, 0);
  silo.userData.equipmentId = 'eq-silo-a';
  const line = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshStandardMaterial());
  line.position.set(0, 1, 0);
  line.userData.equipmentId = 'eq-line-c';
  rt.model.add(silo, line);
  rt.model.updateMatrixWorld(true);
  const canvas = document.createElement('canvas');
  canvas.getBoundingClientRect = () => ({
    left: 0, top: 0, width: 200, height: 200, right: 200, bottom: 200, x: 0, y: 0, toJSON() { return {}; },
  });
  rt.renderer.domElement = canvas;
  rt._equipmentPickEnabled = true;
  rt._selectedEquipmentId = null;
  rt._equipmentCatalog = null;
  rt._statusFilter = null;
  rt._tourOpenedCard = false;
  rt._selectionFromTour = false;
  rt._onEquipmentSelect = SceneRuntime.prototype._onEquipmentSelect.bind(rt);
  rt._bindEquipmentPick();
  return { canvas, silo, line };
}

function trackSelection() {
  let selectedId = null;
  const unlisten = listen(EVENTS.EQUIPMENT_SELECT, (event) => {
    selectedId = event.detail?.id || null;
  });
  return {
    get id() { return selectedId; },
    unlisten,
  };
}

function startDwelling(rt, now) {
  now.mockReturnValue(10_000);
  rt._lastFrameTime = 10_000;
  rt.camera.position.set(12, 8, 14);
  rt.startTour([
    {
      id: 'eq-silo-a',
      label: '原料仓 A',
      position: { x: 0, y: 1, z: 8 },
      target: { x: 0, y: 1, z: 0 },
      equipmentId: 'eq-silo-a',
    },
    NEXT_STOP,
  ], { dwellMs: 5_000 });
  now.mockReturnValue(11_200);
  rt._loop();
  expect(rt._tour.phase).toBe('dwelling');
}

function clickListRow(rt, id) {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  act(() => {
    root.render(createElement(DeviceListPanel, {
      devices: TOUR_DEVICES,
      selectedId: null,
      runtime: rt,
      t: LIST_COPY,
      lang: 'zh',
    }));
  });
  act(() => {
    host.querySelector('.device-list-toggle').dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  act(() => {
    host.querySelector(`[data-equipment-id="${id}"]`).dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  act(() => root.unmount());
  host.remove();
}

function clickEquipment(canvas) {
  canvas.dispatchEvent(new PointerEvent('pointerdown', {
    bubbles: true, button: 0, clientX: 100, clientY: 100, pointerType: 'mouse',
  }));
  canvas.dispatchEvent(new MouseEvent('click', {
    bubbles: true, button: 0, detail: 1, clientX: 100, clientY: 100,
  }));
}

function expectDetailOpen(selectedId, id) {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  act(() => {
    root.render(createElement(DeviceDetailPanel, {
      device: getDevice({ devices: TOUR_DEVICES }, selectedId),
      onClose() {},
    }));
  });
  expect(host.querySelector('.device-detail-panel')?.getAttribute('data-equipment-id')).toBe(id);
  act(() => root.unmount());
  host.remove();
}
