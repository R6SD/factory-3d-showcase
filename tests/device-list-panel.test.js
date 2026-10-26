/**
 * @vitest-environment happy-dom
 */
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EVENTS, listen } from '../src/events.js';
import { DeviceListPanel } from '../src/ui/viewer/DeviceListPanel.jsx';

const t = {
  deviceList: '设备列表',
  allStatus: '全部',
  sortBy: '排序',
  sortStatus: '状态',
  sortName: '名称',
  sortOee: 'OEE',
  notInModel: '模型中未找到',
};

const devices = [
  { id: 'eq-silo-a', name: '原料仓 A', status: 'alarm', line: '原料线', kpi: { oee: 71 } },
  { id: 'eq-line-c', name: '总装线 C', status: 'down', line: '总装线 C', kpi: { oee: 41 } },
  { id: 'eq-conveyor', name: '主传送带', status: 'normal', line: '总装线 A', kpi: { oee: 86 } },
];

describe('DeviceListPanel', () => {
  let root;
  let host;

  function mount(props = {}) {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    const runtime = props.runtime || {
      focusEquipment: vi.fn(() => true),
      setStatusFilter: vi.fn(),
    };
    act(() => {
      root.render(createElement(DeviceListPanel, {
        devices,
        selectedId: null,
        runtime,
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

  it('点行派发 select 并调用 focus；模型里没有时显示提示', () => {
    const seen = [];
    const unlisten = listen(EVENTS.EQUIPMENT_SELECT, (event) => seen.push(event.detail));
    const runtime = mount();
    act(() => {
      document.querySelector('.device-list-toggle').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    const clickRow = () => {
      document.querySelector('[data-equipment-id="eq-silo-a"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    };
    act(() => clickRow());
    expect(seen).toEqual([{ id: 'eq-silo-a' }]);
    expect(runtime.focusEquipment).toHaveBeenCalledWith('eq-silo-a');
    expect(document.body.textContent).not.toContain(t.notInModel);

    runtime.focusEquipment.mockReturnValue(false);
    act(() => clickRow());
    expect(document.body.textContent).toContain(t.notInModel);
    unlisten();
  });

  it('点统计按钮两次，setStatusFilter 依次收到 alarm 和 null', () => {
    const runtime = mount();
    const alarm = () => document.querySelector('.device-status-pill[data-status="alarm"]');
    expect(alarm().getAttribute('aria-pressed')).toBe('false');
    expect(alarm().textContent).toContain('1');
    act(() => {
      alarm().dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(alarm().getAttribute('aria-pressed')).toBe('true');
    act(() => {
      alarm().dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(runtime.setStatusFilter.mock.calls).toEqual([['alarm'], [null]]);
  });

  it('卸载时调用 setStatusFilter(null)', () => {
    const runtime = mount();
    act(() => root.unmount());
    root = null;
    expect(runtime.setStatusFilter).toHaveBeenCalledWith(null);
  });
});
