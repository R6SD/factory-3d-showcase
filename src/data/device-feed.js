/**
 * 设备实时数据源。
 * 本模块只定义 DeviceFeed 和本地模拟器。MQTT / WebSocket 以后另写一个同接口实现。
 * 模拟值由调用方放在内存覆盖层里，这里不写 repository，也不碰 localStorage。
 */

/** @typedef {'normal'|'idle'|'down'|'alarm'} DeviceStatus */
/** @typedef {{ oee?: number, throughput?: number, temp?: number }} DeviceKpi */
/** @typedef {{ code: string, message: string }|null} DeviceAlarm */
/** @typedef {{ status?: DeviceStatus, kpi?: DeviceKpi, alarm?: DeviceAlarm }} DevicePatch */
/**
 * @typedef {{
 *   start(): void,
 *   stop(): void,
 *   isRunning(): boolean,
 *   setIntervalMs(ms: number): void,
 *   subscribe(fn: (patches: Record<string, DevicePatch>) => void): () => void,
 *   injectFault(id: string): void,
 *   clearFault(id: string): void,
 * }} DeviceFeed
 */

export const TEMP_ALARM = 65;
export const TEMP_RECOVER = 60;
const TEMP_MIN = 20;
const TEMP_MAX = 90;
const OEE_MIN = 30;
const OEE_MAX = 99;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function round1(value) {
  return Math.round(value * 10) / 10;
}

/** rng 为 0 时取负满幅，1 时取正满幅，0.5 时不动。 */
function walk(value, span, sample, min, max) {
  const delta = (sample * 2 - 1) * span;
  return round1(clamp(value + delta, min, max));
}

/**
 * 纯函数。只演化 normal / alarm。idle、down 在未注入故障时返回空 patch。
 * 温度游走 ±2，夹在 [20, 90]；OEE 游走 ±1.5，夹在 [30, 99]。
 * 超过 TEMP_ALARM 转 alarm；低于 TEMP_RECOVER 才回到 normal。中间带保持原状态。
 * @returns {DevicePatch}
 */
export function stepDevice(device, { rng = Math.random, faulted = false } = {}) {
  const kpi = device?.kpi || {};
  if (faulted) {
    return {
      status: 'alarm',
      kpi: { oee: kpi.oee, throughput: kpi.throughput, temp: TEMP_ALARM + 8 },
      alarm: { code: 'SIM-001', message: '模拟故障' },
    };
  }
  if (device?.status !== 'normal' && device?.status !== 'alarm') return {};

  const sample = typeof rng === 'function' ? rng : Math.random;
  const temp = walk(Number(kpi.temp) || 0, 2, sample(), TEMP_MIN, TEMP_MAX);
  const oee = walk(Number(kpi.oee) || 0, 1.5, sample(), OEE_MIN, OEE_MAX);
  let status = device.status;
  let alarm = device.alarm ?? null;
  if (temp > TEMP_ALARM) {
    status = 'alarm';
    alarm = { code: 'SIM-T', message: '温度超限' };
  } else if (temp < TEMP_RECOVER) {
    status = 'normal';
    alarm = null;
  } else if (status !== 'alarm') {
    status = 'normal';
    alarm = null;
  }
  return {
    status,
    kpi: { oee, throughput: kpi.throughput, temp },
    alarm,
  };
}

function applyPatch(device, patches) {
  const patch = device?.id != null ? patches[device.id] : undefined;
  if (!patch || typeof patch !== 'object' || Object.keys(patch).length === 0) return device;
  return {
    ...device,
    ...(Object.prototype.hasOwnProperty.call(patch, 'status') ? { status: patch.status } : null),
    ...(patch.kpi ? { kpi: { ...device.kpi, ...patch.kpi } } : null),
    ...(Object.prototype.hasOwnProperty.call(patch, 'alarm') ? { alarm: patch.alarm } : null),
  };
}

/**
 * 本地模拟器。整个实例只保留一个 setInterval 句柄。
 * @param {Array<{id: string}>} devices
 * @returns {DeviceFeed}
 */
export function createSimulatedFeed(devices, { intervalMs = 2000, rng = Math.random } = {}) {
  const catalog = Array.isArray(devices) ? devices : [];
  let ms = intervalMs;
  /** @type {ReturnType<typeof setInterval>|null} */
  let timer = null;
  /** @type {Record<string, DevicePatch>} */
  let patches = {};
  const faulted = new Set();
  /** 注入前的覆盖层。null 表示当时还没有 patch，恢复时去掉覆盖、回到台账。 */
  const prior = new Map();
  const listeners = new Set();

  function clonePatch(patch) {
    if (!patch || typeof patch !== 'object' || Object.keys(patch).length === 0) return null;
    return {
      ...patch,
      kpi: patch.kpi ? { ...patch.kpi } : patch.kpi,
      alarm: patch.alarm ? { ...patch.alarm } : patch.alarm,
    };
  }

  function emit() {
    for (const listener of listeners) listener(patches);
  }

  function store(id, patch) {
    if (!patch || Object.keys(patch).length === 0) {
      if (!patches[id]) return;
      const next = { ...patches };
      delete next[id];
      patches = next;
      return;
    }
    patches = { ...patches, [id]: patch };
  }

  function tick() {
    const next = {};
    for (const device of catalog) {
      if (!device?.id) continue;
      const patch = stepDevice(applyPatch(device, patches), { rng, faulted: faulted.has(device.id) });
      if (patch && Object.keys(patch).length > 0) next[device.id] = patch;
    }
    patches = next;
    emit();
  }

  function start() {
    if (timer != null) return;
    timer = setInterval(tick, ms);
  }

  function stop() {
    if (timer != null) clearInterval(timer);
    timer = null;
  }

  function setIntervalMs(nextMs) {
    const value = Number(nextMs);
    if (Number.isFinite(value) && value > 0) ms = value;
    if (timer != null) {
      stop();
      start();
    }
  }

  function subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  function injectFault(id) {
    if (id == null || id === '') return;
    if (!faulted.has(id)) {
      prior.set(id, clonePatch(patches[id]));
      faulted.add(id);
    }
    const base = catalog.find((item) => item?.id === id);
    if (!base) {
      emit();
      return;
    }
    store(id, stepDevice(applyPatch(base, patches), { rng, faulted: true }));
    emit();
  }

  function clearFault(id) {
    if (id == null || id === '') return;
    if (!faulted.has(id)) return;
    faulted.delete(id);
    const saved = prior.get(id) ?? null;
    prior.delete(id);
    store(id, saved);
    emit();
  }

  return {
    start,
    stop,
    isRunning: () => timer != null,
    setIntervalMs,
    subscribe,
    injectFault,
    clearFault,
  };
}
