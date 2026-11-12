import { describe, expect, it } from 'vitest';
import { createSeedBusiness } from '../src/data/seed.js';
import {
  alarmLevel,
  alarmReducer,
  diffAlarms,
  EMPTY_LOG,
  HISTORY_CAP,
} from '../src/data/alarm-log.js';

const seedDevices = createSeedBusiness().devices;

function applyAll(log, actions) {
  return actions.reduce((current, action) => alarmReducer(current, action), log);
}

function byCode(log) {
  return Object.fromEntries(log.open.map((record) => [record.code, record]));
}

describe('alarmLevel', () => {
  it('down 或 SIM-001 为 critical，SIM-T 为 warning，其它告警为 major', () => {
    expect(alarmLevel({ status: 'down', alarm: { code: 'E-118' } })).toBe('critical');
    expect(alarmLevel({ status: 'alarm', alarm: { code: 'SIM-001' } })).toBe('critical');
    expect(alarmLevel({ status: 'down', alarm: { code: 'SIM-T' } })).toBe('critical');
    expect(alarmLevel({ status: 'alarm', alarm: { code: 'SIM-T' } })).toBe('warning');
    expect(alarmLevel({ status: 'alarm', alarm: { code: 'E-201' } })).toBe('major');
    expect(alarmLevel({ status: 'alarm', alarm: { code: 'E-305' } })).toBe('major');
  });
});

describe('diffAlarms / alarmReducer', () => {
  it('seed 首次 diff 生成 E-201、E-305、E-118 三条记录，级别正确', () => {
    const actions = diffAlarms(EMPTY_LOG, seedDevices, 1_700_000_000_000);
    expect(actions.map((action) => action.type)).toEqual(['raise', 'raise', 'raise']);
    const log = applyAll(EMPTY_LOG, actions);
    expect(log.open).toHaveLength(3);
    expect(log.history).toEqual([]);
    const records = byCode(log);
    expect(records['E-201']).toMatchObject({
      deviceId: 'eq-silo-a',
      deviceName: '原料仓 A',
      level: 'major',
      code: 'E-201',
      message: '校准延迟',
      state: 'active',
      raisedAt: 1_700_000_000_000,
      ackedAt: null,
      recoveredAt: null,
      clearedAt: null,
    });
    expect(records['E-305']).toMatchObject({
      deviceId: 'eq-bldg-pack',
      deviceName: '包装车间',
      level: 'major',
      code: 'E-305',
      message: '封箱气压不足',
      state: 'active',
    });
    expect(records['E-118']).toMatchObject({
      deviceId: 'eq-line-c',
      deviceName: '总装线 C',
      level: 'critical',
      code: 'E-118',
      message: '主轴停机',
      state: 'active',
    });
  });

  it('同 key 持续告警不会重复 raise', () => {
    const log = applyAll(EMPTY_LOG, diffAlarms(EMPTY_LOG, seedDevices, 1_000));
    expect(diffAlarms(log, seedDevices, 2_000)).toEqual([]);
    const acked = alarmReducer(log, { type: 'ack', id: byCode(log)['E-201'].id, at: 1_500 });
    expect(diffAlarms(acked, seedDevices, 2_000).filter((action) => action.type === 'raise')).toEqual([]);
  });

  it('恢复只写 recoveredAt；再次告警会新 raise 一条', () => {
    const log = applyAll(EMPTY_LOG, diffAlarms(EMPTY_LOG, seedDevices, 1_000));
    const alarmId = byCode(log)['E-201'].id;
    const recoveredDevices = seedDevices.map((device) => (
      device.id === 'eq-silo-a' ? { ...device, status: 'normal', alarm: null } : device
    ));
    const recoverActions = diffAlarms(log, recoveredDevices, 3_000);
    expect(recoverActions).toEqual([{ type: 'recover', id: alarmId, at: 3_000 }]);
    const recovered = applyAll(log, recoverActions);
    const kept = recovered.open.find((record) => record.id === alarmId);
    expect(kept).toMatchObject({ state: 'active', recoveredAt: 3_000, ackedAt: null });
    expect(recovered.open).toHaveLength(3);
    expect(recovered.history).toEqual([]);

    const again = diffAlarms(recovered, seedDevices, 4_000);
    const raises = again.filter((action) => action.type === 'raise');
    expect(raises).toHaveLength(1);
    expect(raises[0].record).toMatchObject({
      deviceId: 'eq-silo-a',
      code: 'E-201',
      level: 'major',
      state: 'active',
      raisedAt: 4_000,
      recoveredAt: null,
    });
    expect(raises[0].record.id).not.toBe(alarmId);
    const next = applyAll(recovered, again);
    const fresh = next.open.filter((record) => record.deviceId === 'eq-silo-a' && record.recoveredAt == null);
    const old = next.open.filter((record) => record.id === alarmId);
    expect(fresh).toHaveLength(1);
    expect(old).toHaveLength(1);
    expect(old[0].recoveredAt).toBe(3_000);
  });

  it('active→acked→cleared，以及 active→cleared；非法迁移返回同一引用', () => {
    const log = applyAll(EMPTY_LOG, diffAlarms(EMPTY_LOG, seedDevices, 1_000));
    const critical = byCode(log)['E-118'];
    const major = byCode(log)['E-305'];

    const acked = alarmReducer(log, { type: 'ack', id: critical.id, at: 5 });
    expect(acked).not.toBe(log);
    expect(acked.open.find((record) => record.id === critical.id)).toMatchObject({
      state: 'acked',
      ackedAt: 5,
      recoveredAt: null,
    });
    expect(acked.history).toEqual([]);

    const cleared = alarmReducer(acked, { type: 'clear', id: critical.id, at: 6 });
    expect(cleared.open.find((record) => record.id === critical.id)).toBeUndefined();
    expect(cleared.history[0]).toMatchObject({
      id: critical.id,
      state: 'cleared',
      ackedAt: 5,
      clearedAt: 6,
    });

    const direct = alarmReducer(log, { type: 'clear', id: major.id, at: 9 });
    expect(direct.open.find((record) => record.id === major.id)).toBeUndefined();
    expect(direct.history[0]).toMatchObject({ id: major.id, state: 'cleared', ackedAt: null, clearedAt: 9 });

    expect(alarmReducer(cleared, { type: 'ack', id: critical.id, at: 7 })).toBe(cleared);
    expect(alarmReducer(acked, { type: 'ack', id: critical.id, at: 8 })).toBe(acked);
    expect(alarmReducer(cleared, { type: 'clear', id: critical.id, at: 10 })).toBe(cleared);
    expect(alarmReducer(log, { type: 'recover', id: 'missing', at: 11 })).toBe(log);
    expect(alarmReducer(log, { type: 'ack', id: 'missing', at: 12 })).toBe(log);
    expect(alarmReducer(log, { type: 'nope' })).toBe(log);
  });

  it('清除后进入 history 头部，超过 cap 从尾部截掉', () => {
    let log = EMPTY_LOG;
    for (let i = 0; i < HISTORY_CAP + 1; i += 1) {
      log = alarmReducer(log, {
        type: 'raise',
        record: {
          id: `id-${i}`,
          deviceId: `dev-${i}`,
          deviceName: `设备${i}`,
          level: 'major',
          code: 'X',
          message: 'm',
          raisedAt: i,
          ackedAt: null,
          recoveredAt: null,
          clearedAt: null,
          state: 'active',
        },
      });
      log = alarmReducer(log, { type: 'clear', id: `id-${i}`, at: 1_000 + i });
    }
    expect(log.open).toEqual([]);
    expect(log.history).toHaveLength(HISTORY_CAP);
    expect(log.history[0].id).toBe(`id-${HISTORY_CAP}`);
    expect(log.history[0].state).toBe('cleared');
    expect(log.history.at(-1).id).toBe('id-1');
    expect(log.history.some((record) => record.id === 'id-0')).toBe(false);
  });

  it('没有告警码、或状态不是 alarm/down 时不产生记录', () => {
    const devices = [
      { id: 'a', name: '甲', status: 'alarm', alarm: null },
      { id: 'b', name: '乙', status: 'down', alarm: {} },
      { id: 'c', name: '丙', status: 'normal', alarm: { code: 'E-1', message: '不该出现' } },
      { id: 'd', name: '丁', status: 'idle', alarm: { code: 'E-2', message: '不该出现' } },
    ];
    expect(diffAlarms(EMPTY_LOG, devices, 1)).toEqual([]);
  });
});
