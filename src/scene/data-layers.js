/**
 * 数据图层：把设备 KPI 映射成着色 spec。
 * status 以及告警/停机返回 null，调用方继续用状态色。只改颜色，不新增网格。
 */

export const LAYERS = Object.freeze({
  status: null,
  temp: Object.freeze({ key: 'temp', unit: '°C', min: 20, max: 90 }),
  vib: Object.freeze({ key: 'vib', unit: 'mm/s', min: 0, max: 12 }),
  power: Object.freeze({ key: 'power', unit: 'kW', min: 0, max: 60 }),
});

export const LAYER_IDS = ['status', 'temp', 'vib', 'power'];

/** 冷到热，5 段。 */
export const RAMP = Object.freeze(['#2b6cff', '#27c4a8', '#f5d742', '#ff8a2b', '#ff3b3b']);

/** 数值缺失时的中性灰。图例据此显示「无数据」。 */
export const MISSING_SPEC = Object.freeze({
  emissive: '#8b95a7',
  emissiveIntensity: 0.08,
  albedoScale: 0.85,
  missing: true,
});

function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}

function hexChannel(hex, shift) {
  return parseInt(hex.slice(1), 16) >> shift & 255;
}

function channelHex(value) {
  return Math.round(value).toString(16).padStart(2, '0');
}

/** t∈[0,1]，在 RAMP 上线性插值，返回 #rrggbb。 */
export function rampColor(t) {
  const scaled = clamp01(Number(t) || 0) * (RAMP.length - 1);
  const index = Math.min(RAMP.length - 2, Math.floor(scaled));
  const fraction = scaled - index;
  if (fraction === 0) return RAMP[index];
  const from = RAMP[index];
  const to = RAMP[index + 1];
  const mix = (shift) => hexChannel(from, shift) + (hexChannel(to, shift) - hexChannel(from, shift)) * fraction;
  return `#${channelHex(mix(16))}${channelHex(mix(8))}${channelHex(mix(0))}`;
}

function readValue(device, key) {
  const raw = device?.kpi?.[key];
  if (raw == null || raw === '') return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

/**
 * 返回着色 spec，或 null（null 表示用状态色）。
 * layerId 为 status，或设备处于 alarm / down：告警和停机优先，返回 null。
 */
export function layerSpec(device, layerId) {
  const layer = LAYERS[layerId];
  if (!layer || device?.status === 'alarm' || device?.status === 'down') return null;
  const value = readValue(device, layer.key);
  if (value == null) return MISSING_SPEC;
  const span = layer.max - layer.min;
  const t = span === 0 ? 0 : clamp01((value - layer.min) / span);
  return { emissive: rampColor(t), emissiveIntensity: 0.55, albedoScale: 0.85 };
}

/** min/max 是图层量程。lo/hi 是当前数据的最小/最大，缺数值不参与。 */
export function layerRange(devices, layerId) {
  const layer = LAYERS[layerId];
  if (!layer) return { min: 0, max: 0, lo: null, hi: null };
  let lo = null;
  let hi = null;
  const list = Array.isArray(devices) ? devices : [];
  for (const device of list) {
    const value = readValue(device, layer.key);
    if (value == null) continue;
    if (lo == null || value < lo) lo = value;
    if (hi == null || value > hi) hi = value;
  }
  return { min: layer.min, max: layer.max, lo, hi };
}
