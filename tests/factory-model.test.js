import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { createFactoryModel } from '../src/scene/factory/index.js';
import { applyPreviewBackground } from '../src/scene/factory/environment.js';
import { createBucket } from '../src/scene/factory/bucket.js';
import { createMaterials } from '../src/scene/factory/materials.js';
import { FOOTPRINT } from '../src/scene/factory/layout.js';

const EQUIPMENT_IDS = [
  'eq-silo-a',
  'eq-silo-b',
  'eq-bldg-mfg',
  'eq-line-c',
  'eq-bldg-pack',
  'eq-conveyor',
];

function collectMeshes(root) {
  const meshes = [];
  root.traverse((object) => { if (object.isMesh) meshes.push(object); });
  return meshes;
}

describe('createFactoryModel 网格预算与接口', () => {
  it('Mesh ≤60、投射阴影 ≤52、材质实例 ≤20，且没有 InstancedMesh 和 Light', () => {
    const model = createFactoryModel();
    const meshes = collectMeshes(model);
    expect(meshes.length).toBeLessThanOrEqual(60);
    expect(meshes.filter((mesh) => mesh.castShadow).length).toBeLessThanOrEqual(52);
    expect(new Set(meshes.map((mesh) => mesh.material)).size).toBeLessThanOrEqual(20);
    model.traverse((object) => {
      expect(object.isInstancedMesh).not.toBe(true);
      expect(object.isLight).not.toBe(true);
    });
  });

  it('包围盒 xz 为 18×14 ± 0.6，中心接近原点', () => {
    const model = createFactoryModel();
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    expect(size.x).toBeGreaterThan(FOOTPRINT.w - 0.6);
    expect(size.x).toBeLessThan(FOOTPRINT.w + 0.6);
    expect(size.z).toBeGreaterThan(FOOTPRINT.d - 0.6);
    expect(size.z).toBeLessThan(FOOTPRINT.d + 0.6);
    expect(Math.abs(center.x)).toBeLessThan(0.35);
    expect(Math.abs(center.z)).toBeLessThan(0.35);
  });

  it('六台设备仍是带 equipmentId 和 name 的 Group', () => {
    const model = createFactoryModel();
    const tagged = [];
    model.traverse((object) => {
      if (object.userData?.equipmentId) tagged.push(object);
    });
    expect(tagged.map((object) => object.userData.equipmentId).sort()).toEqual([...EQUIPMENT_IDS].sort());
    for (const object of tagged) {
      expect(object.isGroup).toBe(true);
      expect(object.name.length).toBeGreaterThan(0);
    }
  });

  it('每次建模使用新的材质实例', () => {
    const first = createFactoryModel();
    const second = createFactoryModel();
    const shared = new Set(collectMeshes(first).map((mesh) => mesh.material));
    const leaked = collectMeshes(second).filter((mesh) => shared.has(mesh.material));
    expect(leaked).toHaveLength(0);
  });
});

describe('设置页预览背景', () => {
  it('scene.background 为 #000000，clear alpha 为 1', () => {
    const scene = new THREE.Scene();
    let color = null;
    let alpha = null;
    const renderer = {
      setClearColor(next, nextAlpha) {
        color = next;
        alpha = nextAlpha;
      },
      getClearAlpha() {
        return alpha;
      },
    };
    applyPreviewBackground(scene, renderer);
    expect(scene.background.isColor).toBe(true);
    expect(scene.background.getHexString()).toBe('000000');
    expect(color).toBe(0x000000);
    expect(renderer.getClearAlpha()).toBe(1);
  });
});

describe('createBucket 按材质合并', () => {
  it('同一 matKey 的 3 个几何合并成 1 个 Mesh，顶点数相加，原几何已 dispose', () => {
    const materials = createMaterials();
    const bucket = createBucket(materials);
    const geometries = [0, 1, 2].map(() => new THREE.BoxGeometry(1, 1, 1));
    const expected = geometries.reduce((sum, geometry) => sum + geometry.getAttribute('position').count, 0);
    let disposed = 0;
    geometries.forEach((geometry) => geometry.addEventListener('dispose', () => { disposed += 1; }));
    geometries.forEach((geometry, index) => {
      bucket.add('steel', geometry, { position: [index * 2, 0, 0] });
    });
    const meshes = bucket.build('batch');
    expect(meshes).toHaveLength(1);
    expect(meshes[0].isMesh).toBe(true);
    expect(meshes[0].isInstancedMesh).not.toBe(true);
    expect(meshes[0].name).toBe('batch:steel');
    expect(meshes[0].geometry.getAttribute('position').count).toBe(expected);
    expect(disposed).toBe(3);
    meshes[0].geometry.computeBoundingBox();
    expect(meshes[0].geometry.boundingBox.max.x).toBeGreaterThan(4);
  });
});
