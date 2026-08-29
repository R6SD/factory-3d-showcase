import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  createFactoryModel,
  convertMaterialToStandard,
  setMeshDisplayMode,
  restoreMeshDisplay,
  computeGridPlacement,
} from '../src/scene/SceneRuntime.js';

function collectMeshes(root) {
  const meshes = [];
  root.traverse((o) => { if (o.isMesh) meshes.push(o); });
  return meshes;
}

describe('createFactoryModel 默认工厂模型', () => {
  it('包含完整网格、传送带滚轮与货箱结构', () => {
    const g = createFactoryModel();
    const meshes = collectMeshes(g);
    expect(meshes.length).toBeGreaterThan(150);
    expect(g.userData.conveyor).toBeTruthy();
    expect(g.userData.conveyor.userData.rollers.length).toBeGreaterThan(0);
    expect(g.userData.crates).toHaveLength(5);
  });

  it('相同颜色/参数的网格共享同一材质实例（性能守卫：旧实现每网格一份材质）', () => {
    const g = createFactoryModel();
    const meshes = collectMeshes(g);
    const distinct = new Set(meshes.map((m) => m.material));
    // 共享后独立材质数应明显少于网格数（旧实现二者相等 = 178）
    expect(distinct.size).toBeLessThan(meshes.length);
    expect(distinct.size).toBeLessThan(60);
  });

  it('所有网格具备阴影设置', () => {
    const g = createFactoryModel();
    collectMeshes(g).forEach((m) => {
      expect(m.castShadow).toBe(true);
      expect(m.receiveShadow).toBe(true);
    });
  });
});

describe('convertMaterialToStandard 导入材质转换', () => {
  it('已经是 Standard/Physical 的材质原样返回（身份保持，不重复包装）', () => {
    const std = new THREE.MeshStandardMaterial({ color: 0xffffff });
    expect(convertMaterialToStandard(std)).toBe(std);
    const phys = new THREE.MeshPhysicalMaterial({ color: 0xffffff });
    expect(convertMaterialToStandard(phys)).toBe(phys);
  });

  it('null/undefined 安全透传', () => {
    expect(convertMaterialToStandard(null)).toBeNull();
    expect(convertMaterialToStandard(undefined)).toBeUndefined();
  });

  it('缺陷回归：Phong 的顶点色 vertexColors 转换后必须保留', () => {
    const phong = new THREE.MeshPhongMaterial({ color: 0xffffff, vertexColors: true });
    const out = convertMaterialToStandard(phong);
    expect(out).not.toBe(phong);
    expect(out.isMeshStandardMaterial).toBe(true);
    expect(out.vertexColors).toBe(true); // 旧实现丢失，模型顶点色会变黑/白
  });

  it('保留颜色与贴图引用', () => {
    const tex = new THREE.Texture();
    const phong = new THREE.MeshPhongMaterial({ color: 0x112233, map: tex });
    const out = convertMaterialToStandard(phong);
    expect(out.color.getHex()).toBe(0x112233);
    expect(out.map).toBe(tex);
  });

  it('保留透明材质的 opacity', () => {
    const lambert = new THREE.MeshLambertMaterial({ transparent: true, opacity: 0.4 });
    const out = convertMaterialToStandard(lambert);
    expect(out.transparent).toBe(true);
    expect(out.opacity).toBeCloseTo(0.4, 5);
  });
});

describe('显示模式状态机 setMeshDisplayMode / restoreMeshDisplay', () => {
  function makeMesh() {
    return new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0x888888 }));
  }

  it('solid 往返后恢复为原材质对象（身份保持）', () => {
    const mesh = makeMesh();
    const original = mesh.material;
    setMeshDisplayMode(mesh, 'wireframe');
    expect(mesh.material).not.toBe(original);
    expect(mesh.material.wireframe).toBe(true);
    restoreMeshDisplay(mesh);
    expect(mesh.material).toBe(original);
    expect(mesh.userData.origMat).toBeUndefined();
  });

  it('points 模式隐藏实体面并挂载 Points 代理，恢复后复位', () => {
    const mesh = makeMesh();
    const original = mesh.material;
    setMeshDisplayMode(mesh, 'points', 0.02);
    expect(mesh.material.visible).toBe(false); // 实体三角面隐藏
    const proxy = mesh.userData._pointsProxy;
    expect(proxy?.isPoints).toBe(true);
    expect(mesh.children).toContain(proxy);
    expect(proxy.material.size).toBeCloseTo(0.02, 5);

    restoreMeshDisplay(mesh);
    expect(mesh.material).toBe(original);
    expect(mesh.material.visible).toBe(true);
    expect(mesh.userData._pointsProxy).toBeNull();
    expect(mesh.children).not.toContain(proxy);
  });

  it('缺陷回归：wireframe→points 互切不泄漏上一份临时材质/代理', () => {
    const mesh = makeMesh();
    setMeshDisplayMode(mesh, 'wireframe');
    const wireMat = mesh.material;
    let disposed = 0;
    wireMat.addEventListener('dispose', () => { disposed++; });

    setMeshDisplayMode(mesh, 'points'); // 互切：旧线框材质必须被释放
    expect(disposed).toBe(1);
    expect(mesh.userData._pointsProxy?.isPoints).toBe(true);
    expect(mesh.material.visible).toBe(false);

    setMeshDisplayMode(mesh, 'solid'); // solid 内部先 restore，等价恢复
    restoreMeshDisplay(mesh);
    expect(mesh.userData.origMat).toBeUndefined();
    expect(mesh.userData._pointsProxy).toBeNull();
  });

  it('代理 Points 与原网格共享同一份 geometry（不复制几何）', () => {
    const mesh = makeMesh();
    setMeshDisplayMode(mesh, 'points');
    expect(mesh.userData._pointsProxy.geometry).toBe(mesh.geometry);
    restoreMeshDisplay(mesh);
  });

  it('共享同一材质的多个网格切换 points 再恢复，共享材质不被误释放且恢复可见', () => {
    const shared = new THREE.MeshStandardMaterial({ color: 0x445566 });
    const a = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), shared);
    const b = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), shared);
    setMeshDisplayMode(a, 'points');
    setMeshDisplayMode(b, 'points');
    expect(shared.visible).toBe(false);
    expect(a.userData._pointsProxy?.isPoints).toBe(true);
    expect(b.userData._pointsProxy?.isPoints).toBe(true);
    restoreMeshDisplay(a);
    restoreMeshDisplay(b);
    expect(a.material).toBe(shared);
    expect(b.material).toBe(shared);
    expect(shared.visible).toBe(true);
  });
});

describe('computeGridPlacement 参考网格跟随模型包围盒（错位回归）', () => {
  it('网格贴在模型底面略下方（boundsMinY - 0.04）并与模型 xz 中心一致', () => {
    const p = computeGridPlacement({ x: 18, y: 4, z: 14 }, { x: 0, y: 0, z: 0 }, -0.6);
    expect(p.grid).toEqual([0, -0.64, 0]);
  });

  it('缺陷回归：模型中心不在原点（导入模型）时，网格必须跟随模型中心而非固定世界原点', () => {
    const p = computeGridPlacement({ x: 8, y: 6, z: 8 }, { x: 10, y: 2, z: -5 }, -1);
    expect(p.grid[0]).toBe(10);
    expect(p.grid[2]).toBe(-5);
    expect(p.grid[1]).toBeCloseTo(-1.04, 6);
  });

  it('缩放：小模型保底为 1，大模型按最大边线性放大', () => {
    const small = computeGridPlacement({ x: 2, y: 2, z: 2 }, { x: 0, y: 0, z: 0 }, 0);
    expect(small.scale).toBe(1);
    const big = computeGridPlacement({ x: 44, y: 10, z: 10 }, { x: 0, y: 0, z: 0 }, 0);
    expect(big.scale).toBeCloseTo((44 / 22) * 1.25, 6);
  });

  it('场景已移除地面平面：返回值不再包含 ground', () => {
    const p = computeGridPlacement({ x: 2, y: 2, z: 2 }, { x: 0, y: 0, z: 0 }, 0);
    expect(p.ground).toBeUndefined();
  });
});

describe('传送带货箱等距（末端挤堆回归）', () => {
  it('货箱相位等距，且数量×间距与循环环长一致（含绕回处）', () => {
    const g = createFactoryModel();
    const offsets = g.userData.crates.map((c) => c.userData.crateOffset);
    expect(offsets).toEqual([0, 2, 4, 6, 8]);
    const CRATE_CYCLE = 10; // 必须与 _loop 中货箱取模环长一致：数量 5 × 间距 2
    const gaps = offsets.map((o, i) => (offsets[(i + 1) % offsets.length] - o + CRATE_CYCLE) % CRATE_CYCLE);
    expect(new Set(gaps).size).toBe(1); // 含绕回，所有相邻间距相等
  });
});
