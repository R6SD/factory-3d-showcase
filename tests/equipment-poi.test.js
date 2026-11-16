/**
 * @vitest-environment happy-dom
 */
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { EVENTS, listen } from '../src/events.js';
import { statusColor } from '../src/data/selectors.js';
import { EquipmentPoi } from '../src/ui/viewer/EquipmentPoi.jsx';

const devices = [
  { id: 'eq-silo-a', name: '原料仓 A', status: 'alarm' },
  { id: 'eq-silo-b', name: '原料仓 B', status: 'idle' },
  { id: 'eq-bldg-mfg', name: '制造主厂房', status: 'normal' },
  { id: 'eq-line-c', name: '总装线 C', status: 'down' },
  { id: 'eq-bldg-pack', name: '包装车间', status: 'alarm' },
  { id: 'eq-conveyor', name: '主传送带', status: 'normal' },
];

const t = { showPoi: '铭牌' };

function runtimeStub() {
  return {
    subscribeFrame: vi.fn(() => () => {}),
    equipmentAnchor: vi.fn(() => new THREE.Vector3(1, 2, 3)),
    projectToScreen: vi.fn(() => ({ x: 40, y: 80, visible: true })),
    focusEquipment: vi.fn(),
  };
}

describe('EquipmentPoi', () => {
  let root;
  let host;

  function mount(props = {}) {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement('div');
    host.className = 'viewer';
    document.body.append(host);
    root = createRoot(host);
    const runtime = props.runtime || runtimeStub();
    act(() => {
      root.render(createElement(EquipmentPoi, {
        devices,
        runtime,
        visible: true,
        selectedId: null,
        t,
        lang: 'zh',
        ...props,
        runtime,
      }));
    });
    return runtime;
  }

  afterEach(() => {
    if (root) act(() => root.unmount());
    root = null;
    host?.remove();
    host = null;
  });

  it('6 台设备渲染 6 个铭牌，visible=false 时一个都不渲染', () => {
    mount();
    expect(document.querySelectorAll('.poi')).toHaveLength(6);
    expect(document.querySelector('.poi-layer')).not.toBeNull();
    act(() => root.unmount());
    root = null;
    mount({ visible: false, runtime: runtimeStub() });
    expect(document.querySelectorAll('.poi')).toHaveLength(0);
  });

  it('点击铭牌派发 EQUIPMENT_SELECT 并调用 focusEquipment', () => {
    const seen = [];
    const unlisten = listen(EVENTS.EQUIPMENT_SELECT, (event) => seen.push(event.detail));
    const runtime = mount();
    act(() => {
      document.querySelector('[data-equipment-id="eq-silo-a"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(seen).toEqual([{ id: 'eq-silo-a' }]);
    expect(runtime.focusEquipment).toHaveBeenCalledWith('eq-silo-a');
    unlisten();
  });

  it('状态点颜色跟着设备状态变', () => {
    mount();
    const dot = () => document.querySelector('[data-equipment-id="eq-line-c"] i');
    expect(dot().style.backgroundColor).toBe(statusColor('down').emissive);
    const next = devices.map((device) => (
      device.id === 'eq-line-c' ? { ...device, status: 'normal' } : device
    ));
    act(() => {
      root.render(createElement(EquipmentPoi, {
        devices: next,
        runtime: runtimeStub(),
        visible: true,
        selectedId: 'eq-line-c',
        t,
        lang: 'zh',
      }));
    });
    expect(dot().style.backgroundColor).toBe(statusColor('normal').emissive);
    expect(document.querySelector('[data-equipment-id="eq-line-c"]').classList.contains('active')).toBe(true);
  });

  it('模型里没有这台设备时隐藏对应铭牌', () => {
    let update;
    const runtime = runtimeStub();
    runtime.subscribeFrame = vi.fn((fn) => {
      update = fn;
      return () => {};
    });
    runtime.equipmentAnchor = vi.fn((id) => (id === 'eq-silo-a' ? null : new THREE.Vector3(1, 2, 3)));
    runtime.projectToScreen = vi.fn((anchor) => {
      if (!anchor) return { x: 0, y: 0, visible: false };
      return { x: 12, y: 24, visible: true };
    });
    mount({ runtime });
    act(() => update(runtime));
    expect(document.querySelector('[data-equipment-id="eq-silo-a"]').hidden).toBe(true);
    const shown = document.querySelector('[data-equipment-id="eq-conveyor"]');
    expect(shown.hidden).toBe(false);
    expect(shown.style.transform).toContain('translate(12px, 24px)');
    expect(shown.style.transform).toContain('translate(-50%, -100%)');
  });
});
