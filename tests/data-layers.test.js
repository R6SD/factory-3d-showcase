import { describe, expect, it } from 'vitest';
import { createSeedBusiness, normalizeBusiness } from '../src/data/seed.js';
import { createFactoryModel } from '../src/scene/factory/index.js';
import { paintEquipmentStatuses } from '../src/scene/device-status.js';
import {
  LAYER_IDS,
  LAYERS,
  MISSING_SPEC,
  RAMP,
  layerRange,
  layerSpec,
  rampColor,
} from '../src/scene/data-layers.js';

const DEVICE_IDS = [
  'eq-conveyor',
  'eq-silo-a',
  'eq-silo-b',
  'eq-bldg-mfg',
  'eq-line-c',
  'eq-bldg-pack',
];

function collectMeshes(root) {
  const meshes = [];
  root.traverse((object) => { if (object.isMesh) meshes.push(object); });
  return meshes;
}

describe('rampColor', () => {
  it('0 和 1 落在色带两端，0.5 落在中间色', () => {
    expect(rampColor(0)).toBe(RAMP[0]);
    expect(rampColor(1)).toBe(RAMP[RAMP.length - 1]);
    expect(rampColor(0.5)).toBe(RAMP[2]);
    expect(RAMP[0]).toBe('#2b6cff');
    expect(RAMP[2]).toBe('#f5d742');
    expect(RAMP[RAMP.length - 1]).toBe('#ff3b3b');
  });
});

describe('layerSpec', () => {
  it('状态图层、告警和停机返回 null，沿用状态色', () => {
    const hot = { status: 'alarm', kpi: { temp: 80, vib: 9, power: 40 } };
    const stopped = { status: 'down', kpi: { temp: 22, vib: 0.3, power: 0.5 } };
    const running = { status: 'normal', kpi: { temp: 42, vib: 2, power: 20 } };
    expect(layerSpec(running, 'status')).toBeNull();
    expect(layerSpec(hot, 'temp')).toBeNull();
    expect(layerSpec(hot, 'vib')).toBeNull();
    expect(layerSpec(stopped, 'power')).toBeNull();
    expect(layerSpec(stopped, 'temp')).toBeNull();
  });

  it('缺值返回中性灰，正常值按固定量程上色', () => {
    expect(layerSpec({ status: 'normal', kpi: {} }, 'temp')).toEqual(MISSING_SPEC);
    expect(layerSpec({ status: 'idle', kpi: { vib: null } }, 'vib')).toEqual(MISSING_SPEC);
    expect(MISSING_SPEC.emissiveIntensity).toBeLessThan(0.2);
    const mid = layerSpec({ status: 'normal', kpi: { temp: 55 } }, 'temp');
    expect(mid).toEqual({ emissive: '#f5d742', emissiveIntensity: 0.55, albedoScale: 0.85 });
    expect(layerSpec({ status: 'idle', kpi: { power: 0 } }, 'power').emissive).toBe('#2b6cff');
    expect(layerSpec({ status: 'normal', kpi: { temp: 10 } }, 'temp').emissive).toBe('#2b6cff');
    expect(layerSpec({ status: 'normal', kpi: { temp: 100 } }, 'temp').emissive).toBe('#ff3b3b');
  });
});

describe('layerRange', () => {
  it('lo/hi 是当前数值的最小和最大，min/max 仍是图层量程', () => {
    const range = layerRange([
      { kpi: { temp: 30 } },
      { kpi: { temp: 70 } },
      { kpi: { temp: null } },
      { status: 'alarm', kpi: { temp: 88 } },
    ], 'temp');
    expect(range).toEqual({ min: 20, max: 90, lo: 30, hi: 88 });
    expect(LAYERS.temp).toMatchObject({ key: 'temp', unit: '°C', min: 20, max: 90 });
    expect(LAYERS.vib).toMatchObject({ key: 'vib', unit: 'mm/s', min: 0, max: 12 });
    expect(LAYERS.power).toMatchObject({ key: 'power', unit: 'kW', min: 0, max: 60 });
    expect(LAYER_IDS).toEqual(['status', 'temp', 'vib', 'power']);
  });
});

describe('种子设备的振动和能耗', () => {
  it('6 个默认 id 不变，停机线功率为 0.5，normalize 把非法值收成 0', () => {
    const devices = createSeedBusiness().devices;
    expect(devices.map((device) => device.id)).toEqual(DEVICE_IDS);
    expect(devices.find((device) => device.id === 'eq-line-c').kpi.power).toBe(0.5);
    for (const device of devices) {
      expect(typeof device.kpi.vib).toBe('number');
      expect(typeof device.kpi.power).toBe('number');
    }
    const normalized = normalizeBusiness({
      devices: [{ id: 'eq-x', status: 'normal', kpi: { vib: '3.5', power: 'nope', temp: 10 } }],
    });
    expect(normalized.devices[0].kpi.vib).toBe(3.5);
    expect(normalized.devices[0].kpi.power).toBe(0);
    expect(normalized.devices[0].kpi.temp).toBe(10);
  });
});

describe('温度图层不增加绘制调用', () => {
  it('切到 temp 前后网格数相同，且仍在 ≤120 预算内', () => {
    const model = createFactoryModel();
    const devices = createSeedBusiness().devices;
    const catalog = devices.map((device) => ({ id: device.id, status: device.status, name: device.name }));
    const budgetOf = () => {
      const meshes = collectMeshes(model);
      const casting = meshes.filter((mesh) => mesh.castShadow).length;
      return { meshes: meshes.length, budget: meshes.length + casting + 3 };
    };
    paintEquipmentStatuses(model, catalog, null);
    const before = budgetOf();
    paintEquipmentStatuses(
      model,
      catalog,
      null,
      null,
      (id) => layerSpec(devices.find((device) => device.id === id), 'temp'),
    );
    const after = budgetOf();
    expect(after.meshes).toBe(before.meshes);
    expect(after.budget).toBe(before.budget);
    expect(after.budget).toBeLessThanOrEqual(120);
    expect(after.meshes).toBeGreaterThan(0);
  });
});
