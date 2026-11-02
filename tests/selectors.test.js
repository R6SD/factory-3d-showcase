import { describe, expect, it } from 'vitest';
import { createSeedBusiness } from '../src/data/seed.js';
import {
  STATUS_ORDER,
  countByStatus,
  filterDevices,
  listDevices,
  sortDevices,
  statusColor,
} from '../src/data/selectors.js';

const devices = [
  { id: 'n1', name: '乙', status: 'normal', kpi: { oee: 10 } },
  { id: 'a1', name: '甲', status: 'alarm', kpi: { oee: 50 } },
  { id: 'a2', name: '丙', status: 'alarm', kpi: { oee: 20 } },
  { id: 'd1', name: '丁', status: 'down', kpi: { oee: 90 } },
  { id: 'i1', name: '戊', status: 'idle', kpi: { oee: 70 } },
  { id: 'x1', name: '己', status: 'mystery', kpi: { oee: 99 } },
];

describe('设备状态选择器', () => {
  it('countByStatus 统计四态，未知状态不计', () => {
    expect(STATUS_ORDER).toEqual(['alarm', 'down', 'idle', 'normal']);
    expect(countByStatus(devices)).toEqual({ alarm: 2, down: 1, idle: 1, normal: 1 });
    expect(countByStatus([{ status: 'maintain' }, null, { status: 'idle' }])).toEqual({
      alarm: 0, down: 0, idle: 1, normal: 0,
    });
    expect(countByStatus(null)).toEqual({ alarm: 0, down: 0, idle: 0, normal: 0 });
    expect(statusColor('idle')).toMatchObject({
      label: '待机',
      labelEn: 'Idle',
      emissive: '#60a5fa',
      emissiveIntensity: 0.3,
      albedoScale: 0.8,
    });
  });

  it('sortDevices 告警在前，同状态按名称；名称和 OEE 另排，且不改原数组', () => {
    const ids = devices.map((device) => device.id);
    expect(sortDevices(devices).map((device) => device.id)).toEqual(['a2', 'a1', 'd1', 'i1', 'n1', 'x1']);
    expect(sortDevices(devices, 'name').map((device) => device.id)).toEqual(['a2', 'd1', 'x1', 'a1', 'i1', 'n1']);
    expect(sortDevices(devices, 'oee').map((device) => device.id)).toEqual(['x1', 'd1', 'i1', 'a1', 'a2', 'n1']);
    expect(devices.map((device) => device.id)).toEqual(ids);
    expect(sortDevices(null)).toEqual([]);
  });

  it('filterDevices 在 status 为 null 时返回全部，否则只留该状态', () => {
    expect(filterDevices(devices, null)).toBe(devices);
    expect(filterDevices(devices, 'alarm').map((device) => device.id)).toEqual(['a1', 'a2']);
    expect(filterDevices(devices, 'idle').map((device) => device.id)).toEqual(['i1']);
    expect(filterDevices(null, 'alarm')).toEqual([]);
    const seeded = listDevices(createSeedBusiness());
    expect(seeded.find((device) => device.id === 'eq-silo-b')?.status).toBe('idle');
    expect(countByStatus(seeded)).toEqual({ alarm: 2, down: 1, idle: 1, normal: 2 });
  });
});
