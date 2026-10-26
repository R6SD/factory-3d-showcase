/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import * as THREE from 'three';
import { createSeedBusiness, normalizeBusiness } from '../src/data/seed.js';
import { getDevice, listDevices, statusColor } from '../src/data/selectors.js';
import { EVENTS, dispatch, listen } from '../src/events.js';
import { VIEW_RESET_DOUBLE_TAP_PX, VIEW_RESET_MS, SceneRuntime, createFactoryModel, setMeshDisplayMode } from '../src/scene/SceneRuntime.js';
import { DeviceDetailPanel } from '../src/ui/viewer/DeviceDetailPanel.jsx';
import {
  SELECTED_EMISSIVE_GAIN,
  shouldPickEquipmentClick,
  isHierarchyVisible,
  firstVisibleHit,
  bindEquipmentClickGuard,
  applyMeshStatus,
  clearMeshStatus,
  paintEquipmentStatuses,
  restoreStatusMaterials,
  matchEquipmentId,
  bindEquipmentIds,
  equipmentIdOf,
} from '../src/scene/device-status.js';

describe('设备 selectors', () => {
  it('种子覆盖 normal / alarm / down，条数在 4～6', () => {
    const devices = listDevices(createSeedBusiness());
    expect(devices.length).toBeGreaterThanOrEqual(4);
    expect(devices.length).toBeLessThanOrEqual(6);
    const statuses = new Set(devices.map((d) => d.status));
    expect(statuses.has('normal')).toBe(true);
    expect(statuses.has('alarm')).toBe(true);
    expect(statuses.has('down')).toBe(true);
    expect(getDevice(createSeedBusiness(), 'eq-conveyor')?.name).toBe('主传送带');
    expect(getDevice(createSeedBusiness(), 'missing')).toBeNull();
    expect(listDevices(null)).toEqual([]);
    expect(getDevice(null, 'eq-conveyor')).toBeNull();
  });

  it('normalizeBusiness 缺 devices 时用种子补齐', () => {
    const merged = normalizeBusiness({ capacity: { output: 1 } });
    expect(merged.devices.length).toBeGreaterThanOrEqual(4);
    expect(merged.devices.some((d) => d.status === 'down')).toBe(true);
  });
});

describe('statusColor', () => {
  it('三种状态给出中文名和几何色，未知状态返回 null', () => {
    expect(statusColor('normal')).toMatchObject({ label: '正常', emissive: '#22c55e' });
    expect(statusColor('normal').emissiveIntensity).toBeLessThan(statusColor('alarm').emissiveIntensity);
    expect(statusColor('alarm')).toMatchObject({ label: '告警', emissive: '#f59e0b' });
    expect(statusColor('down')).toMatchObject({ label: '停机', emissive: '#ef4444' });
    expect(statusColor('down').albedoScale).toBeLessThan(1);
    expect(statusColor('maintain')).toBeNull();
    expect(statusColor(undefined)).toBeNull();
  });
});

describe('拾取 click 守卫', () => {
  function fire(el, type, { detail, x = 20, y = 20 } = {}) {
    const init = {
      bubbles: true,
      cancelable: true,
      detail,
      clientX: x,
      clientY: y,
      button: 0,
      pointerId: 1,
      pointerType: 'mouse',
    };
    const event = type.startsWith('pointer') ? new PointerEvent(type, init) : new MouseEvent(type, init);
    el.dispatchEvent(event);
    return event;
  }

  function mountGuard(pick = () => 'eq-conveyor') {
    const el = document.createElement('canvas');
    const selects = [];
    const dispatched = [];
    const unlisten = listen(EVENTS.EQUIPMENT_SELECT, (event) => dispatched.push(event.detail));
    const unbind = bindEquipmentClickGuard(el, {
      pick,
      onSelect: (id) => {
        selects.push(id);
        dispatch(EVENTS.EQUIPMENT_SELECT, id ? { id } : null);
      },
    });
    return {
      el,
      selects,
      dispatched,
      close: () => {
        unbind();
        unlisten();
      },
    };
  }

  it('拖拽阈值与双击归位是同一个 30px 常数', () => {
    expect(VIEW_RESET_DOUBLE_TAP_PX).toBe(30);
    expect(shouldPickEquipmentClick({ detail: 1, distancePx: VIEW_RESET_DOUBLE_TAP_PX })).toBe(true);
    expect(shouldPickEquipmentClick({ detail: 1, distancePx: VIEW_RESET_DOUBLE_TAP_PX + 0.1 })).toBe(false);
  });

  it('鼠标双击按浏览器顺序派发：第一下 click 选中一次，第二下和 dblclick 不改选择也不派发 null', () => {
    const guard = mountGuard();
    const down = fire(guard.el, 'pointerdown', { detail: 0 });
    const up = fire(guard.el, 'pointerup', { detail: 0 });
    expect(down.detail).toBe(0);
    expect(up.detail).toBe(0);
    expect(guard.selects).toEqual([]);

    const first = fire(guard.el, 'click', { detail: 1 });
    expect(first.detail).toBe(1);
    expect(guard.selects).toEqual(['eq-conveyor']);
    expect(guard.dispatched).toEqual([{ id: 'eq-conveyor' }]);

    fire(guard.el, 'pointerdown', { detail: 0 });
    fire(guard.el, 'pointerup', { detail: 0 });
    const second = fire(guard.el, 'click', { detail: 2 });
    const dbl = fire(guard.el, 'dblclick', { detail: 2 });
    expect(second.detail).toBe(2);
    expect(dbl.detail).toBe(2);
    expect(guard.selects).toEqual(['eq-conveyor']);
    expect(guard.dispatched).toEqual([{ id: 'eq-conveyor' }]);
    expect(guard.dispatched).not.toContain(null);
    guard.close();
  });

  it('按下到 click 超过共用阈值不选中，等于阈值仍选中', () => {
    const guard = mountGuard();
    fire(guard.el, 'pointerdown', { detail: 0, x: 0, y: 0 });
    fire(guard.el, 'pointerup', { detail: 0, x: VIEW_RESET_DOUBLE_TAP_PX + 1, y: 0 });
    fire(guard.el, 'click', { detail: 1, x: VIEW_RESET_DOUBLE_TAP_PX + 1, y: 0 });
    expect(guard.selects).toEqual([]);
    expect(guard.dispatched).toEqual([]);

    fire(guard.el, 'pointerdown', { detail: 0, x: 0, y: 0 });
    fire(guard.el, 'pointerup', { detail: 0, x: VIEW_RESET_DOUBLE_TAP_PX, y: 0 });
    fire(guard.el, 'click', { detail: 1, x: VIEW_RESET_DOUBLE_TAP_PX, y: 0 });
    expect(guard.selects).toEqual(['eq-conveyor']);
    guard.close();
  });

  function mountTouchScene() {
    const el = document.createElement('canvas');
    el.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 200, right: 200, bottom: 200 });
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    camera.position.set(0, 1, 6);
    camera.lookAt(0, 1, 0);
    camera.updateMatrixWorld(true);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshBasicMaterial());
    mesh.position.set(0, 1, 0);
    mesh.userData.equipmentId = 'eq-conveyor';
    const model = new THREE.Group();
    model.add(mesh);
    model.updateMatrixWorld(true);
    const rt = Object.assign(Object.create(SceneRuntime.prototype), {
      camera,
      model,
      renderer: { domElement: el },
      control: {
        target: new THREE.Vector3(1, 1, 1),
        _sphericalDelta: { set() {} },
        _panOffset: { set() {} },
      },
      _equipmentPickEnabled: true,
      _equipmentCatalog: null,
      _selectedEquipmentId: null,
      _viewReset: null,
      _needsRender: false,
      _homePosition: new THREE.Vector3(4, 5, 6),
      _homeTarget: new THREE.Vector3(0, 1, 0),
      _lastTap: null,
      _touchClickDouble: false,
      _touchClickMoved: false,
      _touchDown: null,
      _touchIds: new Set(),
      _touchGesture: null,
      _equipRaycaster: null,
      _equipPointer: null,
    });
    rt._onEquipmentSelect = SceneRuntime.prototype._onEquipmentSelect.bind(rt);
    rt._onViewResetPointerDown = SceneRuntime.prototype._onViewResetPointerDown.bind(rt);
    rt._onViewResetPointerMove = SceneRuntime.prototype._onViewResetPointerMove.bind(rt);
    rt._onViewResetPointerUp = SceneRuntime.prototype._onViewResetPointerUp.bind(rt);
    rt._onViewResetPointerCancel = SceneRuntime.prototype._onViewResetPointerCancel.bind(rt);
    rt._bindEquipmentPick();
    el.addEventListener('pointerdown', rt._onViewResetPointerDown);
    el.addEventListener('pointermove', rt._onViewResetPointerMove);
    el.addEventListener('pointerup', rt._onViewResetPointerUp);
    el.addEventListener('pointercancel', rt._onViewResetPointerCancel);
    const picked = [];
    const unlisten = listen(EVENTS.EQUIPMENT_SELECT, (event) => picked.push(event.detail?.id ?? null));
    const state = { now: 1000 };
    const clock = vi.spyOn(performance, 'now').mockImplementation(() => state.now);
    const pointer = (type, { pointerId = 1, x = 0, y = 0 } = {}) => {
      el.dispatchEvent(new PointerEvent(type, {
        bubbles: true,
        pointerType: 'touch',
        pointerId,
        button: 0,
        clientX: x,
        clientY: y,
      }));
    };
    const tap = (x, y) => {
      pointer('pointerdown', { x, y });
      pointer('pointerup', { x, y });
      el.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1, button: 0, clientX: x, clientY: y }));
    };
    return {
      rt,
      el,
      picked,
      tap,
      pointer,
      state,
      close() {
        clock.mockRestore();
        unlisten();
        el.removeEventListener('pointerdown', rt._onViewResetPointerDown);
        el.removeEventListener('pointermove', rt._onViewResetPointerMove);
        el.removeEventListener('pointerup', rt._onViewResetPointerUp);
        el.removeEventListener('pointercancel', rt._onViewResetPointerCancel);
        rt._unbindEquipmentPick?.();
        rt._unsubEquipmentSelect?.();
      },
    };
  }

  it('触屏单击拾取；双击设备第二下不改选择，相机不归位', () => {
    const scene = mountTouchScene();
    const { rt, picked, tap, state } = scene;
    expect(rt._pointerHitsModel({ clientX: 100, clientY: 100 })).toBe(true);
    const cameraBefore = rt.camera.position.clone();

    tap(100, 100);
    expect(picked).toEqual(['eq-conveyor']);
    expect(rt._selectedEquipmentId).toBe('eq-conveyor');
    expect(rt._viewReset).toBeNull();

    state.now = 1200;
    tap(100, 100);
    expect(picked).toEqual(['eq-conveyor']);
    expect(rt._selectedEquipmentId).toBe('eq-conveyor');
    expect(rt._viewReset).toBeNull();
    rt._applyViewReset(state.now + VIEW_RESET_MS);
    expect(rt.camera.position.distanceTo(cameraBefore)).toBeLessThan(1e-6);
    expect(rt.camera.position.distanceTo(rt._homePosition)).toBeGreaterThan(1);
    scene.close();
  });

  it('触屏双击空白仍归位，第二下不重复派发', () => {
    const scene = mountTouchScene();
    const { rt, picked, tap, state } = scene;
    expect(rt._pointerHitsModel({ clientX: 8, clientY: 8 })).toBe(false);

    tap(8, 8);
    expect(picked).toEqual([null]);
    expect(rt._viewReset).toBeNull();

    state.now = 1200;
    tap(8, 8);
    expect(picked).toEqual([null]);
    expect(rt._selectedEquipmentId).toBeNull();
    expect(rt._viewReset).not.toBeNull();
    rt._applyViewReset(state.now + VIEW_RESET_MS);
    expect(rt.camera.position.distanceTo(rt._homePosition)).toBeLessThan(1e-4);
    expect(rt.control.target.distanceTo(rt._homeTarget)).toBeLessThan(1e-4);
    scene.close();
  });

  it('pointercancel 清掉第一下之后，下一次触屏点击不是双击', () => {
    const scene = mountTouchScene();
    try {
      const { rt, picked, tap, pointer, state } = scene;
      tap(8, 8);
      expect(picked).toEqual([null]);
      expect(rt._viewReset).toBeNull();

      state.now = 1200;
      pointer('pointercancel', { x: 8, y: 8 });
      tap(8, 8);
      expect(picked).toEqual([null, null]);
      expect(rt._viewReset).toBeNull();
    } finally {
      scene.close();
    }
  });

  it('两次点击之间有多指手势时，后一次不是双击', () => {
    const scene = mountTouchScene();
    try {
      const { rt, picked, tap, pointer, state } = scene;
      tap(8, 8);
      expect(picked).toEqual([null]);

      state.now = 1100;
      pointer('pointerdown', { pointerId: 1, x: 8, y: 8 });
      pointer('pointerdown', { pointerId: 2, x: 40, y: 40 });
      pointer('pointerup', { pointerId: 1, x: 8, y: 8 });
      pointer('pointerup', { pointerId: 2, x: 40, y: 40 });

      state.now = 1300;
      tap(8, 8);
      expect(picked).toEqual([null, null]);
      expect(rt._viewReset).toBeNull();
    } finally {
      scene.close();
    }
  });

  it('拖出阈值再回到起点不是点击', () => {
    const scene = mountTouchScene();
    try {
      const { rt, picked, tap, pointer, state } = scene;
      const x = 8;
      const y = 8;
      pointer('pointerdown', { x, y });
      pointer('pointermove', { x: x + VIEW_RESET_DOUBLE_TAP_PX + 1, y });
      pointer('pointermove', { x, y });
      pointer('pointerup', { x, y });
      scene.el.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1, button: 0, clientX: x, clientY: y }));
      expect(picked).toEqual([]);
      expect(rt._viewReset).toBeNull();

      state.now = 1200;
      tap(x, y);
      expect(picked).toEqual([null]);
      expect(rt._viewReset).toBeNull();
    } finally {
      scene.close();
    }
  });
});

describe('状态材质备份与恢复', () => {
  function pair() {
    const shared = new THREE.MeshStandardMaterial({ color: 0x112233, emissive: 0x000000, emissiveIntensity: 0 });
    const geo = new THREE.BoxGeometry(1, 1, 1);
    return { shared, a: new THREE.Mesh(geo, shared), b: new THREE.Mesh(geo, shared) };
  }

  it('着色前 clone，共享材质的另一网格保持原色，clear 还原同一材质引用', () => {
    const { shared, a, b } = pair();
    const before = shared.color.getHex();
    expect(applyMeshStatus(a, 'alarm')).toBe(true);
    expect(a.material).not.toBe(shared);
    expect(a.userData._statusOrig).toBe(shared);
    expect(a.material.emissive.getHexString()).toBe('f59e0b');
    expect(b.material).toBe(shared);
    expect(shared.color.getHex()).toBe(before);
    expect(shared.emissive.getHex()).toBe(0x000000);

    expect(clearMeshStatus(a)).toBe(true);
    expect(a.material).toBe(shared);
    expect(a.userData._statusOrig).toBeUndefined();
    expect(clearMeshStatus(a)).toBe(false);
  });

  it('线框/点云模式下重新着色保持显示模式，切回实体后材质正确且没有残留 clone', () => {
    const { shared, a } = pair();
    a.userData.equipmentId = 'eq-conveyor';
    const root = new THREE.Group();
    root.add(a);
    paintEquipmentStatuses(root, [{ id: 'eq-conveyor', status: 'alarm' }], null);
    const alarmClone = a.material;
    expect(alarmClone).not.toBe(shared);
    let alarmDisposed = 0;
    alarmClone.addEventListener('dispose', () => { alarmDisposed += 1; });

    setMeshDisplayMode(a, 'wireframe');
    const wire = a.material;
    expect(wire.wireframe).toBe(true);
    paintEquipmentStatuses(root, [{ id: 'eq-conveyor', status: 'down' }], 'eq-conveyor');
    expect(a.material).toBe(wire);
    expect(wire.wireframe).toBe(true);
    expect(alarmDisposed).toBe(1);
    expect(a.userData.origMat).not.toBe(alarmClone);
    expect(a.userData.origMat.emissive.getHexString()).toBe('ef4444');
    expect(a.userData._statusOrig).toBe(shared);
    expect(shared.emissive.getHex()).toBe(0x000000);

    const downClone = a.userData.origMat;
    setMeshDisplayMode(a, 'solid');
    expect(a.material).toBe(downClone);
    expect(a.material.wireframe).not.toBe(true);
    expect(a.userData.origMat).toBeUndefined();
    expect(a.userData._statusOrig).toBe(shared);
    expect(a.material.emissive.getHexString()).toBe('ef4444');

    setMeshDisplayMode(a, 'points');
    const proxy = a.userData._pointsProxy;
    expect(proxy?.isPoints).toBe(true);
    let downDisposed = 0;
    downClone.addEventListener('dispose', () => { downDisposed += 1; });
    paintEquipmentStatuses(root, [{ id: 'eq-conveyor', status: 'normal' }], null);
    expect(a.userData._pointsProxy).toBe(proxy);
    expect(a.children).toContain(proxy);
    expect(downDisposed).toBe(1);
    expect(a.material.visible).toBe(false);
    expect(a.userData.origMat).toBe(a.material);
    expect(a.material.emissive.getHexString()).toBe('22c55e');
    expect(shared.visible).toBe(true);

    const normalClone = a.material;
    setMeshDisplayMode(a, 'solid');
    expect(a.userData._pointsProxy).toBeNull();
    expect(a.userData.origMat).toBeUndefined();
    expect(a.material).toBe(normalClone);
    expect(a.material.visible).toBe(true);
    expect(a.material.isMeshStandardMaterial).toBe(true);
    expect(a.material.emissive.getHexString()).toBe('22c55e');
    expect(a.userData._statusOrig).toBe(shared);
  });

  it('停机压暗的是 clone；重复着色不叠乘；选中只抬强度，取消选中后状态色还在', () => {
    const { shared, a } = pair();
    applyMeshStatus(a, 'down', { selected: true });
    const selectedIntensity = statusColor('down').emissiveIntensity * SELECTED_EMISSIVE_GAIN;
    expect(a.material.emissiveIntensity).toBeCloseTo(selectedIntensity);
    expect(a.material.color.getHex()).not.toBe(shared.color.getHex());
    const darkened = a.material.color.getHex();

    applyMeshStatus(a, 'down', { selected: false });
    expect(a.material.emissiveIntensity).toBeCloseTo(statusColor('down').emissiveIntensity);
    expect(a.material.color.getHex()).toBe(darkened);
    expect(a.material).not.toBe(shared);
    expect(shared.color.getHex()).toBe(0x112233);

    clearMeshStatus(a);
    expect(a.material).toBe(shared);
  });

  it('未知状态不改材质', () => {
    const { shared, a } = pair();
    expect(applyMeshStatus(a, 'maintain')).toBe(false);
    expect(a.material).toBe(shared);
    expect(a.userData._statusOrig).toBeUndefined();
  });
});

describe('射线可见性', () => {
  it('自身或祖先隐藏都不可命中，拾取只取第一个可见交点', () => {
    const root = new THREE.Group();
    const hiddenParent = new THREE.Group();
    hiddenParent.visible = false;
    const hiddenChild = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    hiddenParent.add(hiddenChild);
    const visible = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    visible.visible = true;
    root.add(hiddenParent, visible);
    expect(isHierarchyVisible(hiddenChild)).toBe(false);
    expect(isHierarchyVisible(visible)).toBe(true);
    visible.visible = false;
    expect(isHierarchyVisible(visible)).toBe(false);

    const far = { object: visible, distance: 2 };
    const nearHidden = { object: hiddenChild, distance: 0.2 };
    expect(firstVisibleHit([nearHidden, far])).toBeNull();
    visible.visible = true;
    expect(firstVisibleHit([nearHidden, far])).toBe(far);
    expect(firstVisibleHit([])).toBeNull();
  });
});

describe('外载模型名称绑定与工厂打标', () => {
  it('name 含 id 或中文名时绑定，已有 equipmentId 不覆盖', () => {
    const catalog = [
      { id: 'eq-conveyor', name: '主传送带', status: 'normal' },
      { id: 'eq-silo-a', name: '原料仓 A', status: 'alarm' },
    ];
    expect(matchEquipmentId('Line_eq-conveyor_01', catalog)).toBe('eq-conveyor');
    expect(matchEquipmentId('原料仓 A 罐体', catalog)).toBe('eq-silo-a');
    expect(matchEquipmentId('围栏', catalog)).toBeNull();

    const root = new THREE.Group();
    const named = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial());
    named.name = '主传送带';
    const tagged = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial());
    tagged.name = '原料仓 A';
    tagged.userData.equipmentId = 'keep-me';
    root.add(named, tagged);
    expect(bindEquipmentIds(root, catalog)).toBe(1);
    expect(named.userData.equipmentId).toBe('eq-conveyor');
    expect(tagged.userData.equipmentId).toBe('keep-me');
    expect(equipmentIdOf(named)).toBe('eq-conveyor');
  });

  it('默认工厂打标，着色后料仓不串色，整树 clear 回到原材质', () => {
    const g = createFactoryModel();
    const ids = new Set();
    g.traverse((node) => { if (node.userData?.equipmentId) ids.add(node.userData.equipmentId); });
    for (const id of ['eq-conveyor', 'eq-silo-a', 'eq-bldg-mfg', 'eq-line-c']) {
      expect(ids.has(id)).toBe(true);
    }
    const siloMesh = [];
    g.traverse((node) => {
      if (node.isMesh && equipmentIdOf(node) === 'eq-silo-a') siloMesh.push(node);
    });
    expect(siloMesh.length).toBeGreaterThan(0);
    const original = siloMesh[0].material;
    paintEquipmentStatuses(g, [
      { id: 'eq-silo-a', status: 'alarm' },
      { id: 'eq-silo-b', status: 'normal' },
    ], 'eq-silo-a');
    expect(siloMesh[0].material).not.toBe(original);
    expect(siloMesh[0].material.emissive.getHexString()).toBe('f59e0b');
    const other = [];
    g.traverse((node) => {
      if (node.isMesh && equipmentIdOf(node) === 'eq-silo-b') other.push(node);
    });
    expect(other[0].material).not.toBe(siloMesh[0].material);
    expect(other[0].material.emissive.getHexString()).toBe('22c55e');
    expect(original.emissive.getHex()).not.toBe(0xf59e0b);

    restoreStatusMaterials(g);
    expect(siloMesh[0].material).toBe(original);
    expect(other[0].userData._statusOrig).toBeUndefined();
  });
});

describe('设备详情面板', () => {
  const conveyor = getDevice(createSeedBusiness(), 'eq-conveyor');

  it('有设备时产出侧栏元素，无设备时不渲染', () => {
    const el = DeviceDetailPanel({ device: conveyor, onClose() {} });
    expect(el.type).toBe('div');
    expect(el.props.className).toBe('device-detail-panel');
    expect(el.props['data-equipment-id']).toBe('eq-conveyor');
    expect(el.props.role).toBe('dialog');
    const html = renderToStaticMarkup(el);
    expect(html).toContain('主传送带');
    expect(html).toContain('正常');
    expect(html).toContain('86');
    expect(html).toContain('无活动告警');
    expect(DeviceDetailPanel({ device: null, onClose() {} })).toBeNull();
  });
});
