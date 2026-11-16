/**
 * 可复现的模拟历史。固定种子按拍推进，故障脚本沿用实时 feed 的快照语义。
 * 不录制真实会话，也不写 localStorage。
 */
import { advance, applyPatch, stepDevice } from './device-feed.js';

export const HISTORY_MS = 10 * 60 * 1000;
export const STEP_MS = 2000;

/** @typedef {{ at: number, op: 'inject'|'clear', id: string }} HistoryEvent */

export const DEFAULT_SCRIPT = [
  { at: 90_000, op: 'inject', id: 'eq-conveyor' },
  { at: 180_000, op: 'clear', id: 'eq-conveyor' },
  { at: 300_000, op: 'inject', id: 'eq-silo-b' },
  { at: 420_000, op: 'clear', id: 'eq-silo-b' },
];

/** 可复现的 rng。seed 相同则序列逐次相同。 */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clonePatch(patch) {
  if (!patch || typeof patch !== 'object' || Object.keys(patch).length === 0) return null;
  return {
    ...patch,
    kpi: patch.kpi ? { ...patch.kpi } : patch.kpi,
    alarm: patch.alarm ? { ...patch.alarm } : patch.alarm,
  };
}

function store(patches, id, patch) {
  if (!patch || Object.keys(patch).length === 0) {
    if (!patches[id]) return patches;
    const next = { ...patches };
    delete next[id];
    return next;
  }
  return { ...patches, [id]: patch };
}

function snapshotPatches(patches) {
  const out = {};
  for (const id of Object.keys(patches)) out[id] = clonePatch(patches[id]);
  return out;
}

function injectFault(state, catalog, rng, id) {
  if (id == null || id === '') return;
  if (!state.faulted.has(id)) {
    state.prior.set(id, clonePatch(state.patches[id]));
    state.faulted.add(id);
  }
  const base = catalog.find((item) => item?.id === id);
  if (!base) return;
  state.patches = store(
    state.patches,
    id,
    stepDevice(applyPatch(base, state.patches), { rng, faulted: true }),
  );
}

function clearFault(state, id) {
  if (id == null || id === '') return;
  if (!state.faulted.has(id)) return;
  state.faulted.delete(id);
  const saved = state.prior.get(id) ?? null;
  state.prior.delete(id);
  state.patches = store(state.patches, id, saved);
}

/**
 * 预先算出整段历史。frames[i] 是时刻 i*stepMs 的 patches。
 * 有脚本的那一拍先 advance，再注入或恢复，这样恢复帧就是注入前的快照。
 * @returns {{ stepMs: number, frames: Array<Record<string, import('./device-feed.js').DevicePatch>> }}
 */
export function simulateHistory(baseDevices, {
  seed = 42,
  durationMs = HISTORY_MS,
  stepMs = STEP_MS,
  script = DEFAULT_SCRIPT,
} = {}) {
  const catalog = Array.isArray(baseDevices) ? baseDevices : [];
  const safeStep = Number.isFinite(stepMs) && stepMs > 0 ? stepMs : STEP_MS;
  const safeDuration = Number.isFinite(durationMs) && durationMs > 0 ? durationMs : 0;
  const count = Math.floor(safeDuration / safeStep);
  const rng = mulberry32(seed);
  const state = {
    patches: {},
    faulted: new Set(),
    prior: new Map(),
  };
  const events = Array.isArray(script) ? script : [];
  const frames = [];
  for (let i = 0; i < count; i += 1) {
    if (i > 0) advance(state, catalog, rng, state.faulted);
    for (const event of events) {
      if (!event || !Number.isFinite(event.at)) continue;
      if (Math.floor(event.at / safeStep) !== i) continue;
      if (event.op === 'inject') injectFault(state, catalog, rng, event.id);
      else if (event.op === 'clear') clearFault(state, event.id);
    }
    frames.push(snapshotPatches(state.patches));
  }
  return { stepMs: safeStep, frames };
}

/** floor(ms/stepMs) 夹到合法帧，返回那一帧的 patches。 */
export function frameAt(history, ms) {
  const frames = Array.isArray(history?.frames) ? history.frames : [];
  if (frames.length === 0) return {};
  const step = Number.isFinite(history.stepMs) && history.stepMs > 0 ? history.stepMs : STEP_MS;
  let index = Math.floor(Number(ms) / step);
  if (!Number.isFinite(index) || index < 0) index = 0;
  if (index >= frames.length) index = frames.length - 1;
  return frames[index];
}
