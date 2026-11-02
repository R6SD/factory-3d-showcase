/** 厂房占地。原点在平面中心，与 ADR 0003 的旧模型一致。 */
export const FOOTPRINT = Object.freeze({ w: 18, d: 14 });

/**
 * 设备中心沿用旧 createFactoryModel。
 * 建筑的 w/d/h 是 T1 简版体块尺寸，精细外形留给 #48。
 */
export const DEVICE_LAYOUT = Object.freeze({
  'eq-silo-a': Object.freeze({ x: -7.2, z: 1.5, r: 0.95, h: 3.4 }),
  'eq-silo-b': Object.freeze({ x: -7.2, z: -1.5, r: 0.7, h: 2.8 }),
  'eq-bldg-mfg': Object.freeze({ x: -4.2, z: -2.8, w: 4.5, d: 3.2, h: 2.8 }),
  'eq-line-c': Object.freeze({ x: 3.6, z: -2.4, w: 3.4, d: 3.6, h: 3.4 }),
  'eq-bldg-pack': Object.freeze({ x: 3.8, z: 3.2, w: 2.8, d: 3, h: 2 }),
  'eq-conveyor': Object.freeze({ x: 0, z: 0, length: 12.5 }),
});

/** 不登记设备的辅楼，只作为外壳里的体块。 */
export const AUX_BUILDING = Object.freeze({ x: -4.2, z: 3.2, w: 3.8, d: 2.8, h: 2.4 });

export const DEVICE_NAMES = Object.freeze({
  'eq-silo-a': '原料仓 A',
  'eq-silo-b': '原料仓 B',
  'eq-bldg-mfg': '制造主厂房',
  'eq-line-c': '总装线 C',
  'eq-bldg-pack': '包装车间',
  'eq-conveyor': '主传送带',
});
