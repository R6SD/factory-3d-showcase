/**
 * 告警记录。由设备快照的前后差异生成，纯函数，只留在内存里。
 * 不写 localStorage，也不接真实告警源。
 */

/** @typedef {'critical'|'major'|'warning'} AlarmLevel */
/**
 * @typedef {{
 *   id: string,
 *   deviceId: string,
 *   deviceName: string,
 *   level: AlarmLevel,
 *   code: string,
 *   message: string,
 *   raisedAt: number,
 *   ackedAt: number|null,
 *   recoveredAt: number|null,
 *   clearedAt: number|null,
 *   state: 'active'|'acked'|'cleared',
 * }} AlarmRecord
 */
/** @typedef {{ open: AlarmRecord[], history: AlarmRecord[] }} AlarmLog */
/** @typedef {{ type: 'raise', record: AlarmRecord }|{ type: 'recover', id: string, at: number }|{ type: 'ack', id: string, at: number }|{ type: 'clear', id: string, at: number }|{ type: 'reset' }} AlarmAction */

export const HISTORY_CAP = 200;

export const EMPTY_LOG = Object.freeze({
  open: Object.freeze([]),
  history: Object.freeze([]),
});

function alarmCode(device) {
  const alarm = device?.alarm;
  if (!alarm || typeof alarm !== 'object') return '';
  const code = alarm.code;
  if (typeof code === 'string') return code;
  if (code == null) return '';
  return String(code);
}

/** status 为 alarm 或 down，且 alarm.code 非空，才算一条告警。 */
export function isDeviceAlarming(device) {
  const status = device?.status;
  if (status !== 'alarm' && status !== 'down') return false;
  return alarmCode(device) !== '';
}

function alarmKey(deviceId, code) {
  return `${deviceId}:${code}`;
}

/**
 * status==='down' 或 code==='SIM-001' 为 critical；
 * code==='SIM-T' 为 warning；其它告警为 major。
 * down 优先于 SIM-T。
 */
export function alarmLevel(device) {
  const code = alarmCode(device);
  if (device?.status === 'down' || code === 'SIM-001') return 'critical';
  if (code === 'SIM-T') return 'warning';
  return 'major';
}

function recordId(log, deviceId, code, at, pending) {
  const base = `${deviceId}:${code}:${at}`;
  const taken = (id) => pending.has(id)
    || log.open.some((record) => record.id === id)
    || log.history.some((record) => record.id === id);
  if (!taken(base)) return base;
  let n = 2;
  while (taken(`${base}#${n}`)) n += 1;
  return `${base}#${n}`;
}

/**
 * 对比当前 log 和设备快照，返回 raise / recover 动作。不修改 log。
 * raise：告警中，且 open 里没有同 key、recoveredAt == null 的记录。
 * recover：open 里尚未恢复的记录，设备已不在同 key 告警中。
 * @returns {AlarmAction[]}
 */
export function diffAlarms(log, devices, now) {
  const open = Array.isArray(log?.open) ? log.open : [];
  const history = Array.isArray(log?.history) ? log.history : [];
  const source = { open, history };
  const list = Array.isArray(devices) ? devices : [];
  const at = typeof now === 'number' ? now : Date.now();
  const active = new Set();
  for (const device of list) {
    if (!device || device.id == null || device.id === '') continue;
    if (!isDeviceAlarming(device)) continue;
    active.add(alarmKey(device.id, alarmCode(device)));
  }

  /** @type {AlarmAction[]} */
  const actions = [];
  const pending = new Set();
  for (const device of list) {
    if (!device || device.id == null || device.id === '') continue;
    if (!isDeviceAlarming(device)) continue;
    const code = alarmCode(device);
    const key = alarmKey(device.id, code);
    const stillOpen = open.some((record) => alarmKey(record.deviceId, record.code) === key && record.recoveredAt == null);
    if (stillOpen) continue;
    const id = recordId(source, device.id, code, at, pending);
    pending.add(id);
    const message = device.alarm && typeof device.alarm.message === 'string' ? device.alarm.message : '';
    actions.push({
      type: 'raise',
      record: {
        id,
        deviceId: device.id,
        deviceName: device.name || device.id,
        level: alarmLevel(device),
        code,
        message,
        raisedAt: at,
        ackedAt: null,
        recoveredAt: null,
        clearedAt: null,
        state: 'active',
      },
    });
  }

  for (const record of open) {
    if (record.recoveredAt != null) continue;
    if (active.has(alarmKey(record.deviceId, record.code))) continue;
    actions.push({ type: 'recover', id: record.id, at });
  }
  return actions;
}

function findOpen(log, id) {
  const index = log.open.findIndex((record) => record.id === id);
  return { index, record: index < 0 ? null : log.open[index] };
}

/**
 * raise / recover / ack / clear / reset。
 * 非法迁移（例如 ack 一条已清除的记录）返回同一个 log 引用。
 * @param {AlarmLog} log
 * @param {AlarmAction} action
 * @returns {AlarmLog}
 */
export function alarmReducer(log, action) {
  if (!log || !action || typeof action !== 'object') return log;
  switch (action.type) {
    case 'raise': {
      const record = action.record;
      if (!record || record.id == null || record.id === '') return log;
      if (log.open.some((item) => item.id === record.id) || log.history.some((item) => item.id === record.id)) return log;
      const key = alarmKey(record.deviceId, record.code);
      if (log.open.some((item) => alarmKey(item.deviceId, item.code) === key && item.recoveredAt == null)) return log;
      return { open: [record, ...log.open], history: log.history };
    }
    case 'recover': {
      const { index, record } = findOpen(log, action.id);
      if (!record || record.recoveredAt != null) return log;
      const open = log.open.slice();
      open[index] = { ...record, recoveredAt: action.at };
      return { open, history: log.history };
    }
    case 'ack': {
      const { index, record } = findOpen(log, action.id);
      if (!record || record.state !== 'active') return log;
      const open = log.open.slice();
      open[index] = { ...record, state: 'acked', ackedAt: action.at };
      return { open, history: log.history };
    }
    case 'clear': {
      const { record } = findOpen(log, action.id);
      if (!record || (record.state !== 'active' && record.state !== 'acked')) return log;
      const cleared = { ...record, state: 'cleared', clearedAt: action.at };
      return {
        open: log.open.filter((item) => item.id !== record.id),
        history: [cleared, ...log.history].slice(0, HISTORY_CAP),
      };
    }
    case 'reset':
      if (log.open.length === 0 && log.history.length === 0) return log;
      return EMPTY_LOG;
    default:
      return log;
  }
}
