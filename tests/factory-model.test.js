import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { createFactoryModel } from '../src/scene/factory/index.js';
import { applyPreviewBackground } from '../src/scene/factory/environment.js';
import { createBucket } from '../src/scene/factory/bucket.js';
import { createMaterials } from '../src/scene/factory/materials.js';
import { FOOTPRINT } from '../src/scene/factory/layout.js';
import { countTriangles } from '../src/scene/model-stats.js';
import { SceneRuntime } from '../src/scene/SceneRuntime.js';

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

function equipmentGroup(model, id) {
  let group = null;
  model.traverse((object) => {
    if (object.userData?.equipmentId === id) group = object;
  });
  return group;
}

describe('createFactoryModel 网格预算与接口', () => {
  it('Mesh ≤56、投射阴影 ≤52、两者之和 + 3 ≤120，材质实例 ≤20，且没有 InstancedMesh 和 Light', () => {
    const model = createFactoryModel();
    const meshes = collectMeshes(model);
    const casting = meshes.filter((mesh) => mesh.castShadow).length;
    expect(meshes.length).toBeLessThanOrEqual(56);
    expect(casting).toBeLessThanOrEqual(52);
    expect(meshes.length + casting + 3).toBeLessThanOrEqual(120);
    expect(new Set(meshes.map((mesh) => mesh.material)).size).toBeLessThanOrEqual(20);
    model.traverse((object) => {
      expect(object.isInstancedMesh).not.toBe(true);
      expect(object.isBatchedMesh).not.toBe(true);
      expect(object.isLight).not.toBe(true);
    });
  });

  it('三角面在 5 万到 15 万之间', () => {
    const model = createFactoryModel();
    const tris = countTriangles(model);
    expect(tris).toBeGreaterThanOrEqual(50_000);
    expect(tris).toBeLessThanOrEqual(150_000);
  });

  it('预热一次后，三次建模耗时的中位数 < 300ms', () => {
    createFactoryModel();
    const samples = [0, 1, 2].map(() => {
      const start = performance.now();
      createFactoryModel();
      return performance.now() - start;
    });
    samples.sort((a, b) => a - b);
    expect(samples[1]).toBeLessThan(300);
  });

  it('每台设备 Mesh ≤9，组内没有 InstancedMesh 或 BatchedMesh', () => {
    const model = createFactoryModel();
    for (const id of EQUIPMENT_IDS) {
      const group = equipmentGroup(model, id);
      const meshes = [];
      group.traverse((object) => {
        if (object.isMesh) meshes.push(object);
        expect(object.isInstancedMesh).not.toBe(true);
        expect(object.isBatchedMesh).not.toBe(true);
      });
      expect(meshes.length).toBeLessThanOrEqual(9);
      expect(meshes.length).toBeGreaterThan(0);
    }
  });

  it('两台机械臂、滚筒不超过 6 且共享材质，货箱相位为 0/2/4/6/8', () => {
    const model = createFactoryModel();
    expect(model.userData.robots).toHaveLength(2);
    const phases = model.userData.robots.map((arm) => arm.userData.phase);
    expect(phases[0]).not.toBe(phases[1]);
    const rollers = model.userData.conveyor.userData.rollers;
    expect(rollers.length).toBeGreaterThan(0);
    expect(rollers.length).toBeLessThanOrEqual(6);
    expect(new Set(rollers.map((roller) => roller.material)).size).toBe(1);
    expect(model.userData.crates.map((crate) => crate.userData.crateOffset)).toEqual([0, 2, 4, 6, 8]);
  });

  it('六台设备都能算出 equipmentFrame', () => {
    const rt = Object.create(SceneRuntime.prototype);
    rt.model = createFactoryModel();
    for (const id of EQUIPMENT_IDS) {
      const frame = rt.equipmentFrame(id);
      expect(frame).not.toBeNull();
      expect(Number.isFinite(frame.target.x)).toBe(true);
      expect(Number.isFinite(frame.target.y)).toBe(true);
      expect(Number.isFinite(frame.target.z)).toBe(true);
    }
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
