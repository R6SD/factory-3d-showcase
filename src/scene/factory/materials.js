import * as THREE from 'three';

/**
 * 每次建模新建一套材质。不要做模块级缓存：换模型时 _disposeObject 会释放材质，
 * 跨实例共享会把下一座厂房的材质一起释放掉。
 * 全部 roughness / metalness，不贴图。种类保持在 20 以内。
 */
export function createMaterials() {
  const standard = (params) => new THREE.MeshStandardMaterial(params);
  const floor = (color) => standard({
    color,
    metalness: 0.04,
    roughness: 0.72,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const hazard = (color) => standard({
    color,
    metalness: 0.12,
    roughness: 0.46,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
  });

  return Object.freeze({
    steel: standard({ color: 0x8e98a4, metalness: 0.86, roughness: 0.34 }),
    paintBlue: standard({ color: 0x2d6ebd, metalness: 0.48, roughness: 0.38 }),
    concrete: standard({ color: 0x8b9198, metalness: 0.02, roughness: 0.92 }),
    floorZoneA: floor(0x2f6a52),
    floorZoneB: floor(0x3c5678),
    floorZoneC: floor(0x6d5b3c),
    hazardYellow: hazard(0xf0c020),
    hazardBlack: hazard(0x161616),
    wall: standard({ color: 0xb7c1ca, metalness: 0.18, roughness: 0.6 }),
    glass: new THREE.MeshPhysicalMaterial({
      color: 0x9ecae8,
      metalness: 0.04,
      roughness: 0.08,
      transmission: 0,
      opacity: 0.35,
      transparent: true,
      depthWrite: false,
    }),
    rubber: standard({ color: 0x2a2e32, metalness: 0.04, roughness: 0.86 }),
    stainless: standard({ color: 0xc5ced6, metalness: 0.9, roughness: 0.24 }),
    lightStrip: standard({
      color: 0xfff6e4,
      emissive: 0xfff1c9,
      emissiveIntensity: 1.7,
      metalness: 0,
      roughness: 0.32,
    }),
    trunk: standard({ color: 0x5c4030, metalness: 0, roughness: 0.9 }),
    leaf: standard({ color: 0x2f7d4a, metalness: 0, roughness: 0.78 }),
    warnOrange: standard({
      color: 0xff6b35,
      emissive: 0xff4400,
      emissiveIntensity: 0.7,
      metalness: 0.2,
      roughness: 0.4,
    }),
    warnYellow: standard({
      color: 0xe8c84a,
      emissive: 0xccaa00,
      emissiveIntensity: 0.65,
      metalness: 0.2,
      roughness: 0.4,
    }),
    crate: standard({ color: 0xc4956a, metalness: 0.04, roughness: 0.8 }),
    crateAlt: standard({ color: 0xb8865a, metalness: 0.04, roughness: 0.82 }),
  });
}
