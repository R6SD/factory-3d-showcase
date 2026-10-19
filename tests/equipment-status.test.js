/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import * as THREE from 'three';
import { createSeedBusiness, normalizeBusiness } from '../src/data/seed.js';
import { getDevice, listDevices, statusColor } from '../src/data/selectors.js';
import { createFactoryModel } from '../src/scene/SceneRuntime.js';
import { DeviceDetailPanel } from '../src/ui/viewer/DeviceDetailPanel.jsx';
import {
  EQUIPMENT_PICK_DRAG_PX,
  EQUIPMENT_CLICK_SETTLE_MS,
  SELECTED_EMISSIVE_GAIN,
  isEquipmentClick,
  isHierarchyVisible,
  firstVisibleHit,
  bindEquipmentPick,
  createEquipmentPickGate,
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

describe('拾取拖拽阈值', () => {
  const down = { x: 10, y: 20, button: 0 };

  it('位移不超过阈值算点击，超过则不算', () => {
    expect(isEquipmentClick(down, { x: 10 + EQUIPMENT_PICK_DRAG_PX, y: 20, button: 0 })).toBe(true);
    expect(isEquipmentClick(down, { x: 10 + EQUIPMENT_PICK_DRAG_PX + 0.1, y: 20, button: 0 })).toBe(false);
    expect(isEquipmentClick(down, { x: 16, y: 26, button: 0 })).toBe(false);
  });

  it('非左键或缺少按下记录不算点击', () => {
    expect(isEquipmentClick({ ...down, button: 2 }, { x: 10, y: 20, button: 2 })).toBe(false);
    expect(isEquipmentClick(null, { x: 10, y: 20, button: 0 })).toBe(false);
  });

  it('detail > 1 的 pointerup 是双击的第二次，不提交拾取，也不清掉已有选择', () => {
    vi.useFakeTimers();
    try {
      const picks = [];
      const gate = createEquipmentPickGate();
      gate.pointerUp({ detail: 1 }, () => picks.push('first-click'));
      vi.advanceTimersByTime(EQUIPMENT_CLICK_SETTLE_MS - 1);
      expect(picks).toEqual([]);
      gate.pointerUp({ detail: 2 }, () => picks.push('blank-null'));
      vi.advanceTimersByTime(EQUIPMENT_CLICK_SETTLE_MS);
      expect(picks).toEqual([]);

      gate.pointerUp({ detail: 1 }, () => picks.push('click'));
      vi.advanceTimersByTime(EQUIPMENT_CLICK_SETTLE_MS);
      expect(picks).toEqual(['click']);
      gate.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it('下一击的按下取消尚未提交的单击，双击不改变选择', () => {
    vi.useFakeTimers();
    try {
      const picks = [];
      const gate = createEquipmentPickGate();
      gate.pointerUp({ detail: 1 }, () => picks.push('a'));
      gate.cancel();
      gate.pointerUp({ detail: 2 }, () => picks.push('b'));
      vi.advanceTimersByTime(EQUIPMENT_CLICK_SETTLE_MS);
      expect(picks).toEqual([]);
      gate.dispose();
    } finally {
      vi.useRealTimers();
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

  it('拾取向上走时跳过 visible === false 的节点，不用它的 equipmentId', () => {
    const root = new THREE.Group();
    root.userData.equipmentId = 'eq-root';
    const hidden = new THREE.Group();
    hidden.visible = false;
    hidden.userData.equipmentId = 'eq-hidden';
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    hidden.add(mesh);
    root.add(hidden);
    expect(equipmentIdOf(mesh)).toBe('eq-hidden');
    expect(equipmentIdOf(mesh, { skipHidden: true })).toBe('eq-root');

    const orphan = new THREE.Group();
    const hiddenOnly = new THREE.Group();
    hiddenOnly.visible = false;
    hiddenOnly.userData.equipmentId = 'eq-hidden';
    const child = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    hiddenOnly.add(child);
    orphan.add(hiddenOnly);
    expect(equipmentIdOf(child, { skipHidden: true })).toBeNull();
  });
});

describe('监听清理', () => {
  it('卸下后 pointerdown / pointerup / pointercancel 不再触发', () => {
    const el = document.createElement('div');
    let downs = 0;
    let ups = 0;
    let cancels = 0;
    const unbind = bindEquipmentPick(el, {
      onDown: () => { downs += 1; },
      onUp: () => { ups += 1; },
      onCancel: () => { cancels += 1; },
    });
    el.dispatchEvent(new Event('pointerdown'));
    el.dispatchEvent(new Event('pointerup'));
    el.dispatchEvent(new Event('pointercancel'));
    expect(downs).toBe(1);
    expect(ups).toBe(1);
    expect(cancels).toBe(1);
    unbind();
    el.dispatchEvent(new Event('pointerdown'));
    el.dispatchEvent(new Event('pointerup'));
    el.dispatchEvent(new Event('pointercancel'));
    expect(downs).toBe(1);
    expect(ups).toBe(1);
    expect(cancels).toBe(1);
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
