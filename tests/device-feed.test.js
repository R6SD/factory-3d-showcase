/**
 * @vitest-environment happy-dom
 */
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  TEMP_ALARM,
  TEMP_RECOVER,
  createSimulatedFeed,
  stepDevice,
} from '../src/data/device-feed.js';
import { mergeDevicePatches, useLiveDevices } from '../src/data/useLiveDevices.js';

function device(partial) {
  return {
    id: 'eq-1',
    name: '一号机',
    status: 'normal',
    line: 'A',
    kpi: { oee: 80, throughput: 10, temp: 40 },
    alarm: null,
    ...partial,
    kpi: { oee: 80, throughput: 10, temp: 40, ...partial.kpi },
  };
}

/** 先温度、后 OEE。1 → +满幅，0 → -满幅，0.5 → 0。 */
function sequenceRng(values) {
  let index = 0;
  return () => {
    const value = values[index] ?? values[values.length - 1] ?? 0.5;
    index += 1;
    return value;
  };
}

describe('stepDevice', () => {
  it('阈值常量是 65 / 60', () => {
    expect(TEMP_ALARM).toBe(65);
    expect(TEMP_RECOVER).toBe(60);
  });

  it('normal 时温度超过 65 转 alarm', () => {
    const current = device({ kpi: { temp: 64 } });
    const patch = stepDevice(current, { rng: sequenceRng([1, 0.5]), faulted: false });
    expect(patch.status).toBe('alarm');
    expect(patch.kpi.temp).toBe(66);
    expect(patch.alarm).toEqual({ code: 'SIM-T', message: '温度超限' });
    expect(current.status).toBe('normal');
    expect(current.kpi.temp).toBe(64);
  });

  it('alarm 时温度在 60–65 之间保持 alarm（回差）', () => {
    const current = device({
      status: 'alarm',
      kpi: { temp: 62 },
      alarm: { code: 'SIM-T', message: '温度超限' },
    });
    const patch = stepDevice(current, { rng: sequenceRng([1, 0.5]), faulted: false });
    expect(patch.kpi.temp).toBe(64);
    expect(patch.status).toBe('alarm');
    expect(patch.alarm).toEqual({ code: 'SIM-T', message: '温度超限' });

    const held = stepDevice(
      device({ status: 'alarm', kpi: { temp: 65 }, alarm: { code: 'SIM-T', message: '温度超限' } }),
      { rng: sequenceRng([0.5, 0.5]), faulted: false },
    );
    expect(held.kpi.temp).toBe(65);
    expect(held.status).toBe('alarm');
  });

  it('温度低于 60 回到 normal', () => {
    const patch = stepDevice(
      device({ status: 'alarm', kpi: { temp: 61 }, alarm: { code: 'SIM-T', message: '温度超限' } }),
      { rng: sequenceRng([0, 0.5]), faulted: false },
    );
    expect(patch.kpi.temp).toBe(59);
    expect(patch.status).toBe('normal');
    expect(patch.alarm).toBeNull();
  });

  it('温度正好 60 仍保持 alarm', () => {
    const patch = stepDevice(
      device({ status: 'alarm', kpi: { temp: 62 }, alarm: { code: 'SIM-T', message: '温度超限' } }),
      { rng: sequenceRng([0, 0.5]), faulted: false },
    );
    expect(patch.kpi.temp).toBe(60);
    expect(patch.status).toBe('alarm');
  });

  it('注入故障后不管温度多少都是 alarm', () => {
    const cold = stepDevice(device({ status: 'idle', kpi: { temp: 22 } }), { rng: () => 0, faulted: true });
    expect(cold.status).toBe('alarm');
    expect(cold.kpi.temp).toBe(TEMP_ALARM + 8);
    expect(cold.kpi.oee).toBe(80);
    expect(cold.alarm).toEqual({ code: 'SIM-001', message: '模拟故障' });

    const hot = stepDevice(device({ status: 'down', kpi: { temp: 90, oee: 41 } }), { rng: () => 1, faulted: true });
    expect(hot.status).toBe('alarm');
    expect(hot.kpi.temp).toBe(73);
    expect(hot.alarm.code).toBe('SIM-001');
  });

  it('idle 和 down 不演化', () => {
    const idle = device({ status: 'idle', kpi: { temp: 80, oee: 91 } });
    const down = device({ id: 'eq-down', status: 'down', kpi: { temp: 22, oee: 41 }, alarm: { code: 'E-118', message: '主轴停机' } });
    const idleBefore = JSON.stringify(idle);
    const downBefore = JSON.stringify(down);
    expect(stepDevice(idle, { rng: () => 1, faulted: false })).toEqual({});
    expect(stepDevice(down, { rng: () => 0, faulted: false })).toEqual({});
    expect(JSON.stringify(idle)).toBe(idleBefore);
    expect(JSON.stringify(down)).toBe(downBefore);
  });
});

describe('createSimulatedFeed', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('只持有一个 interval：start 为 1，stop 为 0，运行中 setIntervalMs 仍为 1', () => {
    vi.useFakeTimers();
    const feed = createSimulatedFeed([device({})], { intervalMs: 2000, rng: () => 0.5 });
    expect(feed.isRunning()).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    feed.start();
    feed.start();
    expect(feed.isRunning()).toBe(true);
    expect(vi.getTimerCount()).toBe(1);
    feed.stop();
    expect(feed.isRunning()).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    feed.start();
    feed.setIntervalMs(1000);
    expect(vi.getTimerCount()).toBe(1);
    expect(feed.isRunning()).toBe(true);
    feed.stop();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('注入故障立即告警，clearFault 把温度拉回 45 并回到 normal', () => {
    vi.useFakeTimers();
    const ledger = device({ kpi: { temp: 22 } });
    const seen = [];
    const feed = createSimulatedFeed([ledger], { intervalMs: 2000, rng: () => 0 });
    feed.subscribe((patches) => seen.push(patches));
    feed.start();
    feed.injectFault(ledger.id);
    expect(seen.at(-1)[ledger.id].status).toBe('alarm');
    expect(seen.at(-1)[ledger.id].kpi.temp).toBe(TEMP_ALARM + 8);
    expect(seen.at(-1)[ledger.id].alarm).toEqual({ code: 'SIM-001', message: '模拟故障' });
    expect(ledger.status).toBe('normal');
    expect(ledger.kpi.temp).toBe(22);

    vi.advanceTimersByTime(2000);
    expect(seen.at(-1)[ledger.id].status).toBe('alarm');
    expect(seen.at(-1)[ledger.id].alarm.code).toBe('SIM-001');

    feed.clearFault(ledger.id);
    expect(seen.at(-1)[ledger.id].status).toBe('normal');
    expect(seen.at(-1)[ledger.id].kpi.temp).toBe(45);
    expect(seen.at(-1)[ledger.id].alarm).toBeNull();
    expect(vi.getTimerCount()).toBe(1);
    feed.stop();
  });

  it('idle 在节拍里不产生 patch', () => {
    vi.useFakeTimers();
    const idle = device({ id: 'eq-idle', status: 'idle', kpi: { temp: 36 } });
    const running = device({ id: 'eq-run', kpi: { temp: 40 } });
    let latest = null;
    const feed = createSimulatedFeed([idle, running], { intervalMs: 2000, rng: () => 0.5 });
    feed.subscribe((patches) => { latest = patches; });
    feed.start();
    vi.advanceTimersByTime(2000);
    expect(latest['eq-idle']).toBeUndefined();
    expect(latest['eq-run']).toBeTruthy();
    expect(idle.status).toBe('idle');
    feed.stop();
  });
});

describe('mergeDevicePatches', () => {
  it('没有 patch 的设备保持原引用，原数组不被修改', () => {
    const untouched = device({ id: 'eq-keep', status: 'idle' });
    const edited = device({ id: 'eq-edit' });
    const devices = [edited, untouched];
    const merged = mergeDevicePatches(devices, {
      'eq-edit': { status: 'alarm', kpi: { temp: 70 }, alarm: { code: 'SIM-T', message: '温度超限' } },
    });
    expect(merged).not.toBe(devices);
    expect(merged[1]).toBe(untouched);
    expect(merged[0]).not.toBe(edited);
    expect(merged[0].status).toBe('alarm');
    expect(merged[0].kpi.temp).toBe(70);
    expect(merged[0].kpi.oee).toBe(80);
    expect(merged[0].alarm).toEqual({ code: 'SIM-T', message: '温度超限' });
    expect(edited.status).toBe('normal');
    expect(edited.kpi.temp).toBe(40);
    expect(devices).toEqual([edited, untouched]);
    expect(mergeDevicePatches(devices, {})[0]).toBe(edited);
    expect(mergeDevicePatches(devices, { 'eq-edit': {} })[0]).toBe(edited);
  });
});

describe('useLiveDevices', () => {
  let root;
  let host;

  afterEach(() => {
    if (root) act(() => root.unmount());
    root = null;
    host?.remove();
    host = null;
    vi.useRealTimers();
  });

  function mount(props, apiRef) {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    function Probe(next) {
      const live = useLiveDevices(next.devices, { enabled: next.enabled, intervalMs: next.intervalMs });
      apiRef.current = live;
      return createElement('span', { 'data-live': '1' }, next.enabled ? 'on' : 'off');
    }
    act(() => {
      root.render(createElement(Probe, props));
    });
  }

  it('enabled 从 true 改为 false 后定时器为 0，设备回到台账值', () => {
    vi.useFakeTimers();
    const ledger = device({ kpi: { temp: 40 } });
    const devices = [ledger];
    const apiRef = { current: null };
    mount({ devices, enabled: true, intervalMs: 2000 }, apiRef);
    expect(vi.getTimerCount()).toBe(1);
    act(() => { apiRef.current.injectFault(ledger.id); });
    expect(apiRef.current.devices[0].status).toBe('alarm');
    expect(apiRef.current.devices[0].alarm.code).toBe('SIM-001');
    expect(apiRef.current.faulted.has(ledger.id)).toBe(true);
    expect(ledger.status).toBe('normal');

    function Probe(next) {
      const live = useLiveDevices(next.devices, { enabled: next.enabled, intervalMs: next.intervalMs });
      apiRef.current = live;
      return null;
    }
    act(() => {
      root.render(createElement(Probe, { devices, enabled: false, intervalMs: 2000 }));
    });
    expect(vi.getTimerCount()).toBe(0);
    expect(apiRef.current.devices[0]).toBe(ledger);
    expect(apiRef.current.devices[0].status).toBe('normal');
    expect(apiRef.current.devices[0].kpi.temp).toBe(40);
    expect(apiRef.current.devices[0].alarm).toBeNull();
    expect(apiRef.current.faulted.size).toBe(0);
  });

  it('卸载后定时器为 0', () => {
    vi.useFakeTimers();
    const apiRef = { current: null };
    mount({ devices: [device({})], enabled: true, intervalMs: 5000 }, apiRef);
    expect(vi.getTimerCount()).toBe(1);
    act(() => root.unmount());
    root = null;
    expect(vi.getTimerCount()).toBe(0);
  });
});
