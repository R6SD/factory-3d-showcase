/**
 * @vitest-environment happy-dom
 */
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { isDeviceAlarming } from '../src/data/alarm-log.js';
import { HISTORY_MS } from '../src/data/sim-history.js';
import { useAlarmLog } from '../src/data/useAlarmLog.js';
import { useLiveDevices } from '../src/data/useLiveDevices.js';
import { useReplay } from '../src/data/useReplay.js';

function ledger() {
  return [
    { id: 'eq-conveyor', name: '主传送带', status: 'normal', line: '总装线 A', kpi: { oee: 86, throughput: 120, temp: 42 }, alarm: null },
    { id: 'eq-silo-a', name: '原料仓 A', status: 'alarm', line: '原料线', kpi: { oee: 71, throughput: 80, temp: 68 }, alarm: { code: 'E-201', message: '校准延迟' } },
    { id: 'eq-silo-b', name: '原料仓 B', status: 'idle', line: '原料线', kpi: { oee: 91, throughput: 76, temp: 36 }, alarm: null },
    { id: 'eq-bldg-mfg', name: '制造主厂房', status: 'normal', line: '总装线 A', kpi: { oee: 88, throughput: 210, temp: 31 }, alarm: null },
    { id: 'eq-line-c', name: '总装线 C', status: 'down', line: '总装线 C', kpi: { oee: 41, throughput: 0, temp: 22 }, alarm: { code: 'E-118', message: '主轴停机' } },
    { id: 'eq-bldg-pack', name: '包装车间', status: 'alarm', line: '包装线', kpi: { oee: 64, throughput: 54, temp: 47 }, alarm: { code: 'E-305', message: '封箱气压不足' } },
  ];
}

function activeKeys(devices) {
  return devices
    .filter((device) => isDeviceAlarming(device))
    .map((device) => `${device.id}:${device.alarm.code}`)
    .sort();
}

function openKeys(log) {
  return (log?.open || [])
    .filter((record) => record.recoveredAt == null)
    .map((record) => `${record.deviceId}:${record.code}`)
    .sort();
}

describe('useReplay', () => {
  let root;
  let host;
  let clock;
  let pending;

  afterEach(() => {
    if (root) act(() => root.unmount());
    root = null;
    host?.remove();
    host = null;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function installClock() {
    clock = 0;
    pending = new Map();
    let seq = 1;
    vi.spyOn(performance, 'now').mockImplementation(() => clock);
    const request = (cb) => {
      const id = seq;
      seq += 1;
      pending.set(id, cb);
      return id;
    };
    const cancel = (id) => pending.delete(id);
    vi.stubGlobal('requestAnimationFrame', request);
    vi.stubGlobal('cancelAnimationFrame', cancel);
    window.requestAnimationFrame = request;
    window.cancelAnimationFrame = cancel;
  }

  function flush(dt) {
    clock += dt;
    const callbacks = [...pending.values()];
    pending.clear();
    act(() => {
      for (const cb of callbacks) cb(clock);
    });
  }

  function mount(apiRef, enabled = true) {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    const devices = ledger();
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    function Probe(props) {
      const replay = useReplay(props.devices, { enabled: props.enabled });
      apiRef.current = replay;
      return null;
    }
    act(() => {
      root.render(createElement(Probe, { devices, enabled }));
    });
    return devices;
  }

  it('play、pause、seek 和 1/2/4× 下 t 按倍速推进', () => {
    installClock();
    const api = { current: null };
    mount(api);
    expect(api.current.playing).toBe(false);
    expect(api.current.t).toBe(0);

    act(() => api.current.play());
    flush(1000);
    expect(api.current.playing).toBe(true);
    expect(api.current.t).toBe(1000);

    act(() => api.current.setSpeed(2));
    flush(1000);
    expect(api.current.speed).toBe(2);
    expect(api.current.t).toBe(3000);

    act(() => api.current.setSpeed(4));
    flush(1000);
    expect(api.current.t).toBe(7000);

    act(() => api.current.setSpeed(3));
    expect(api.current.speed).toBe(4);

    act(() => api.current.pause());
    expect(api.current.playing).toBe(false);
    expect(pending.size).toBe(0);
    flush(1000);
    expect(api.current.t).toBe(7000);

    act(() => api.current.seek(12_000));
    expect(api.current.t).toBe(12_000);
    act(() => api.current.seek(-50));
    expect(api.current.t).toBe(0);
  });

  it('播到末尾自动暂停，不再保留 rAF', () => {
    installClock();
    const api = { current: null };
    mount(api);
    act(() => {
      api.current.seek(HISTORY_MS - 1000);
      api.current.play();
    });
    flush(1000);
    expect(api.current.t).toBe(HISTORY_MS);
    expect(api.current.playing).toBe(false);
    expect(pending.size).toBe(0);
    flush(1000);
    expect(api.current.t).toBe(HISTORY_MS);
  });

  it('seek 之后 alarmsAt 和该帧设备状态一致，时间戳用模拟时间', () => {
    installClock();
    const api = { current: null };
    mount(api);
    expect(api.current.alarmsAt.open.map((record) => record.code).sort()).toEqual(['E-118', 'E-201', 'E-305']);
    expect(api.current.alarmsAt.open.every((record) => record.raisedAt === 0)).toBe(true);
    expect(openKeys(api.current.alarmsAt)).toEqual(activeKeys(api.current.devices));

    act(() => api.current.seek(90_000));
    const conveyor = api.current.devices.find((device) => device.id === 'eq-conveyor');
    expect(conveyor.status).toBe('alarm');
    expect(conveyor.alarm.code).toBe('SIM-001');
    const raised = api.current.alarmsAt.open.find((record) => record.deviceId === 'eq-conveyor' && record.code === 'SIM-001');
    expect(raised.raisedAt).toBe(90_000);
    expect(raised.recoveredAt).toBeNull();
    expect(openKeys(api.current.alarmsAt)).toEqual(activeKeys(api.current.devices));

    act(() => api.current.seek(180_000));
    const recovered = api.current.alarmsAt.open.find((record) => record.deviceId === 'eq-conveyor' && record.code === 'SIM-001');
    expect(recovered.recoveredAt).toBe(180_000);
    expect(openKeys(api.current.alarmsAt)).toEqual(activeKeys(api.current.devices));
    expect(api.current.alarmMarks).toContain(90_000);
  });
});

describe('回放接线', () => {
  let root;
  let host;

  afterEach(() => {
    if (root) act(() => root.unmount());
    root = null;
    host?.remove();
    host = null;
    vi.useRealTimers();
  });

  function Probe({ devices, simulate, replayOn, apiRef }) {
    const live = useLiveDevices(devices, { enabled: simulate && !replayOn, intervalMs: 2000 });
    const replay = useReplay(devices, { enabled: replayOn });
    const shown = replayOn ? replay.devices : live.devices;
    const alarms = useAlarmLog(live.devices, {
      now: () => 5_000,
      source: replayOn ? replay.alarmsAt : null,
    });
    apiRef.current = { live, replay, shown, alarms };
    return null;
  }

  function mount(props, apiRef) {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    act(() => {
      root.render(createElement(Probe, { ...props, apiRef }));
    });
  }

  it('进入回放后实时定时器为 0，回到实时后定时器恢复且设备重新来自 live', () => {
    vi.useFakeTimers();
    const devices = ledger();
    const conveyor = devices.find((device) => device.id === 'eq-conveyor');
    const apiRef = { current: null };
    mount({ devices, simulate: true, replayOn: false }, apiRef);
    expect(vi.getTimerCount()).toBe(1);
    const liveBefore = apiRef.current.alarms.log.open.map((record) => ({
      id: record.id,
      code: record.code,
      raisedAt: record.raisedAt,
      ackedAt: record.ackedAt,
    }));
    expect(liveBefore.every((record) => record.raisedAt === 5_000)).toBe(true);

    act(() => {
      root.render(createElement(Probe, { devices, simulate: true, replayOn: true, apiRef }));
    });
    expect(vi.getTimerCount()).toBe(0);
    act(() => apiRef.current.replay.seek(90_000));
    expect(apiRef.current.shown.find((device) => device.id === 'eq-conveyor').alarm.code).toBe('SIM-001');
    act(() => apiRef.current.alarms.ack(liveBefore[0].id));

    act(() => {
      root.render(createElement(Probe, { devices, simulate: true, replayOn: false, apiRef }));
    });
    expect(vi.getTimerCount()).toBe(1);
    expect(apiRef.current.shown.find((device) => device.id === 'eq-conveyor')).toBe(conveyor);
    expect(apiRef.current.live.devices.find((device) => device.id === 'eq-conveyor')).toBe(conveyor);
    expect(apiRef.current.alarms.log.open.map((record) => ({
      id: record.id,
      code: record.code,
      raisedAt: record.raisedAt,
      ackedAt: record.ackedAt,
    }))).toEqual(liveBefore);

    act(() => { vi.advanceTimersByTime(2000); });
    expect(apiRef.current.shown.find((device) => device.id === 'eq-conveyor')).not.toBe(conveyor);
    expect(vi.getTimerCount()).toBe(1);
  });
});
