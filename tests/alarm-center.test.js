/**
 * @vitest-environment happy-dom
 */
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSeedBusiness } from '../src/data/seed.js';
import { useAlarmLog } from '../src/data/useAlarmLog.js';
import { EVENTS, listen } from '../src/events.js';
import { AlarmCenter } from '../src/ui/viewer/AlarmCenter.jsx';
import { viewerCopy } from '../src/ui/viewer-strings.js';

const t = viewerCopy.zh;

const log = {
  open: [
    {
      id: 'a-critical',
      deviceId: 'eq-line-c',
      deviceName: '总装线 C',
      level: 'critical',
      code: 'E-118',
      message: '主轴停机',
      raisedAt: 3_000,
      ackedAt: null,
      recoveredAt: null,
      clearedAt: null,
      state: 'active',
    },
    {
      id: 'a-major',
      deviceId: 'eq-silo-a',
      deviceName: '原料仓 A',
      level: 'major',
      code: 'E-201',
      message: '校准延迟',
      raisedAt: 2_000,
      ackedAt: null,
      recoveredAt: null,
      clearedAt: null,
      state: 'active',
    },
    {
      id: 'a-warning',
      deviceId: 'eq-silo-b',
      deviceName: '原料仓 B',
      level: 'warning',
      code: 'SIM-T',
      message: '温度超限',
      raisedAt: 1_000,
      ackedAt: null,
      recoveredAt: 1_500,
      clearedAt: null,
      state: 'active',
    },
  ],
  history: [],
};

describe('AlarmCenter', () => {
  let root;
  let host;

  function mount(props = {}) {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    const runtime = props.runtime || {
      focusEquipment: vi.fn(() => true),
      pulseEquipment: vi.fn(),
    };
    act(() => {
      root.render(createElement(AlarmCenter, {
        log,
        onAck: vi.fn(),
        onClear: vi.fn(),
        runtime,
        t,
        lang: 'zh',
        ...props,
        runtime,
      }));
    });
    return runtime;
  }

  function openPanel() {
    act(() => {
      document.querySelector('.alarm-strip').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
  }

  afterEach(() => {
    if (root) act(() => root.unmount());
    root = null;
    host?.remove();
    host = null;
  });

  it('按级别筛选', () => {
    mount();
    openPanel();
    expect(document.querySelectorAll('.alarm-row')).toHaveLength(3);
    act(() => {
      document.querySelector('.alarm-filter[data-level="critical"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    const rows = [...document.querySelectorAll('.alarm-row')];
    expect(rows).toHaveLength(1);
    expect(rows[0].getAttribute('data-level')).toBe('critical');
    expect(rows[0].textContent).toContain('总装线 C');
    expect(rows[0].textContent).toContain(t.alarmCritical);

    act(() => {
      document.querySelector('.alarm-filter[data-level="warning"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    const both = [...document.querySelectorAll('.alarm-row')].map((row) => row.getAttribute('data-level'));
    expect(both.sort()).toEqual(['critical', 'warning']);
    expect(document.body.textContent).toContain(t.alarmRecovered);

    act(() => {
      document.querySelector('.alarm-filter[data-level="all"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(document.querySelectorAll('.alarm-row')).toHaveLength(3);
  });

  it('点击行派发 EQUIPMENT_SELECT，并调用 focusEquipment 和 pulseEquipment', () => {
    const seen = [];
    const unlisten = listen(EVENTS.EQUIPMENT_SELECT, (event) => seen.push(event.detail));
    const order = [];
    const runtime = mount({
      runtime: {
        focusEquipment: vi.fn((id) => {
          order.push(['focus', id]);
          return true;
        }),
        pulseEquipment: vi.fn((id) => {
          order.push(['pulse', id]);
        }),
      },
    });
    openPanel();
    act(() => {
      document.querySelector('[data-alarm-id="a-major"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(seen).toEqual([{ id: 'eq-silo-a' }]);
    expect(runtime.focusEquipment).toHaveBeenCalledWith('eq-silo-a');
    expect(runtime.pulseEquipment).toHaveBeenCalledWith('eq-silo-a');
    expect(order.map((entry) => entry[0])).toEqual(['focus', 'pulse']);
    expect(document.body.textContent).not.toContain(t.notInModel);

    runtime.focusEquipment.mockReturnValue(false);
    act(() => {
      document.querySelector('[data-alarm-id="a-major"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(document.body.textContent).toContain(t.notInModel);
    unlisten();
  });

  it('点确认不触发行点击', () => {
    const seen = [];
    const unlisten = listen(EVENTS.EQUIPMENT_SELECT, (event) => seen.push(event.detail));
    const onAck = vi.fn();
    const runtime = mount({ onAck });
    openPanel();
    act(() => {
      document.querySelector('[data-alarm-id="a-major"] .alarm-ack').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onAck).toHaveBeenCalledWith('a-major');
    expect(onAck).toHaveBeenCalledTimes(1);
    expect(runtime.focusEquipment).not.toHaveBeenCalled();
    expect(runtime.pulseEquipment).not.toHaveBeenCalled();
    expect(seen).toEqual([]);
    unlisten();
  });

  it('readOnly 时不渲染确认和清除', () => {
    mount({ readOnly: true });
    openPanel();
    expect(document.querySelector('.alarm-ack')).toBeNull();
    expect(document.querySelector('.alarm-clear')).toBeNull();
    expect(document.querySelectorAll('.alarm-row')).toHaveLength(3);
  });
});

describe('useAlarmLog', () => {
  let root;
  let host;

  afterEach(() => {
    if (root) act(() => root.unmount());
    root = null;
    host?.remove();
    host = null;
  });

  it('不开模拟时 seed 里已在告警的设备会生成记录', () => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    const devices = createSeedBusiness().devices;
    function Probe() {
      const alarms = useAlarmLog(devices, { now: () => 1_000 });
      const text = alarms.log.open.map((record) => `${record.code}:${record.level}`).join(',');
      return createElement('output', null, text);
    }
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    act(() => {
      root.render(createElement(Probe));
    });
    const text = host.textContent;
    expect(text).toContain('E-201:major');
    expect(text).toContain('E-305:major');
    expect(text).toContain('E-118:critical');
    expect(text.split(',').filter(Boolean)).toHaveLength(3);
  });
});
