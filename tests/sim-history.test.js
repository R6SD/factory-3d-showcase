import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { mergeDevicePatches } from '../src/data/useLiveDevices.js';
import {
  HISTORY_MS,
  STEP_MS,
  frameAt,
  simulateHistory,
} from '../src/data/sim-history.js';

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

function at(devices, history, ms, id) {
  return mergeDevicePatches(devices, frameAt(history, ms)).find((device) => device.id === id);
}

describe('simulateHistory', () => {
  it('同一个 seed 跑两次，结果逐帧相同，一共 300 帧', () => {
    const devices = ledger();
    const first = simulateHistory(devices, { seed: 42 });
    const second = simulateHistory(devices, { seed: 42 });
    expect(first.stepMs).toBe(STEP_MS);
    expect(first.frames).toHaveLength(HISTORY_MS / STEP_MS);
    expect(first.frames).toHaveLength(300);
    expect(second).toEqual(first);
    expect(devices.find((device) => device.id === 'eq-conveyor').kpi.temp).toBe(42);
  });

  it('90s 注入后传送带告警，180s 恢复到注入前的快照', () => {
    const devices = ledger();
    const scripted = simulateHistory(devices, { seed: 42 });
    const plain = simulateHistory(devices, { seed: 42, script: [] });
    const injected = at(devices, scripted, 90_000, 'eq-conveyor');
    expect(injected.status).toBe('alarm');
    expect(injected.alarm).toEqual({ code: 'SIM-001', message: '模拟故障' });
    expect(frameAt(scripted, 90_000)).toBe(scripted.frames[45]);

    const snapshot = at(devices, plain, 90_000, 'eq-conveyor');
    const restored = at(devices, scripted, 180_000, 'eq-conveyor');
    expect(restored.status).toBe(snapshot.status);
    expect(restored.kpi).toEqual(snapshot.kpi);
    expect(restored.alarm).toEqual(snapshot.alarm);
    expect(restored.alarm?.code).not.toBe('SIM-001');

    const held = at(devices, scripted, 100_000, 'eq-conveyor');
    expect(held.status).toBe('alarm');
    expect(held.alarm.code).toBe('SIM-001');
  });

  it('原料仓 B 在脚本时刻注入并恢复到台账', () => {
    const devices = ledger();
    const history = simulateHistory(devices, { seed: 7 });
    const silo = devices.find((device) => device.id === 'eq-silo-b');
    const injected = at(devices, history, 300_000, 'eq-silo-b');
    expect(injected.status).toBe('alarm');
    expect(injected.alarm.code).toBe('SIM-001');
    expect(silo.status).toBe('idle');
    const restored = at(devices, history, 420_000, 'eq-silo-b');
    expect(restored).toBe(silo);
    expect(restored.status).toBe('idle');
    expect(restored.alarm).toBeNull();
  });

  it('frameAt 对越界时间做夹取', () => {
    const history = simulateHistory(ledger(), { seed: 42 });
    expect(frameAt(history, -1)).toEqual(history.frames[0]);
    expect(frameAt(history, 0)).toEqual(history.frames[0]);
    expect(frameAt(history, HISTORY_MS)).toEqual(history.frames[299]);
    expect(frameAt(history, HISTORY_MS + 10_000)).toEqual(history.frames.at(-1));
    expect(frameAt({ frames: [], stepMs: STEP_MS }, 0)).toEqual({});
  });
});

describe('回放接线', () => {
  it('Scene 使用回放设备，窄屏把倍速和时间放到第二行', () => {
    const root = new URL('../', import.meta.url);
    const src = readFileSync(new URL('src/app.jsx', root), 'utf8');
    const css = readFileSync(new URL('src/overrides.css', root), 'utf8');
    expect(src).toContain('useReplay(baseDevices,{enabled:replayOn})');
    expect(src).toContain('enabled:config.scene.simulate===true&&!replayOn');
    expect(src).toContain('const devices=replayOn?replay.devices:live.devices');
    expect(src).toContain('source:replayOn?replay.alarmsAt:null');
    expect(src).toContain('readOnly={replayOn}');
    expect(src).toContain("replayOn?' is-replay':''");
    expect(src).toContain('<DeviceListPanel devices={devices}');
    expect(src).toContain('getDevice({devices},selectedId)');
    expect(src).toContain('buildDefaultStops(runtime,devices)');
    expect(src).toContain('<DataLayerSwitch devices={devices}');
    expect(src).not.toContain('<DataLayerSwitch devices={live.devices}');
    expect(src).toContain('rt.current?.setDataLayer(layerId,specs)');
    expect(src).toContain('},[devices,config.scene.dataLayer]');
    const block = css.slice(css.indexOf('/* #71'));
    expect(block).toContain('.viewer.is-replay .layer-legend{bottom:192px}');
    expect(block).toContain('.viewer.is-replay .layer-legend{bottom:388px}');
    expect(block).toContain('@media (max-width:640px)');
    expect(block).toContain('grid-template-areas:"play track live" "speed time time"');
    expect(block).toContain('.replay-speed{grid-area:speed');
    expect(block).toContain('.replay-time{grid-area:time');
    expect(block).toContain('.viewer.is-replay');
  });
});
