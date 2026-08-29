import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EVENTS, dispatch, listen } from '../events.js';
import { loadModelFile } from './ModelLoader.js';
import { StereoPipeline, normalizePointer, damp, parallaxEyeOffset, autoSway } from './stereo.js';
import { parallaxSettled, shouldRenderFrame, shouldUpdateShadow } from './render-policy.js';

/**
 * SceneRuntime — owns the Three.js scene, render loop, and model lifecycle.
 * The React Scene component is a thin adapter that mounts this runtime and
 * forwards config changes and UI callbacks.
 *
 * Public interface (also exposed on window.__factorySceneRuntime for public scripts):
 *   renderer, scene, camera, control, grid, hemi, sun, rim, THREE
 *   getModel(), fit(), setView(), screenshot(), getModelInfo()
 *   setDisplayMode(), getFps(), getModelTree(), focusNode(), toggleNodeVisible()
 *   updateConfig(sceneConfig), dispose()
 */

/**
 * 按压回弹弹簧的单步积分（半隐式欧拉）。纯函数，便于单测覆盖收敛/钳制行为。
 * 状态结构 { current, target, velocity }，原地更新并返回同一对象。
 */
export function stepPressSpring(p, dt, stiffness = 280, damping = 20) {
  const force = -stiffness * (p.current - p.target) - damping * p.velocity;
  p.velocity += (force * dt);
  p.current += p.velocity * dt;
  p.current = Math.max(-0.15, Math.min(1.15, p.current));
  return p;
}

/**
 * 计算参考网格的摆放（纯函数，便于单测）。
 * 网格始终跟随模型包围盒（同一缩放、xz 中心、贴底面），而非固定在世界原点。
 * 入参为普通 {x,y,z} 对象即可；返回 { scale, grid:[x,y,z] }。
 */
export function computeGridPlacement(size, center, boundsMinY) {
  const maxDim = Math.max(size.x, size.y, size.z);
  const scale = Math.max(1, (maxDim / 22) * 1.25);
  return {
    scale,
    grid: [center.x, boundsMinY - 0.04, center.z],
  };
}

/**
 * 将不参与物理光照的材质（Phong/Lambert/Basic 等）转换为 MeshStandardMaterial，
 * 使其能接收方向光与阴影；已经是 Standard/Physical 的材质原样返回。
 * 保留颜色、常用贴图与顶点色等关键视觉属性。
 */
export function convertMaterialToStandard(m) {
  if (!m) return m;
  if (m.isMeshStandardMaterial || m.isMeshPhysicalMaterial) return m;
  const p = {
    color: (m.color && m.color.clone) ? m.color.clone() : new THREE.Color(0xffffff),
    roughness: 0.65,
    metalness: 0.15,
  };
  if (m.map) p.map = m.map;
  if (m.normalMap) { p.normalMap = m.normalMap; p.normalScale = m.normalScale; }
  if (m.roughnessMap) p.roughnessMap = m.roughnessMap;
  if (m.metalnessMap) p.metalnessMap = m.metalnessMap;
  if (m.aoMap) { p.aoMap = m.aoMap; p.aoMapIntensity = m.aoMapIntensity; }
  if (m.emissive && m.emissive.clone) { p.emissive = m.emissive.clone(); p.emissiveIntensity = m.emissiveIntensity || 0; }
  if (m.transparent) { p.transparent = true; p.opacity = m.opacity; }
  if (m.side) p.side = m.side;
  if (m.alphaTest) p.alphaTest = m.alphaTest;
  if (m.vertexColors) p.vertexColors = true;
  if (m.flatShading) p.flatShading = true;
  if (m.envMap) p.envMap = m.envMap;
  const nm = new THREE.MeshStandardMaterial(p);
  nm.needsUpdate = true;
  return nm;
}

/** 恢复单个网格的原始材质，移除并释放点云代理 */
export function restoreMeshDisplay(o) {
  const proxy = o.userData._pointsProxy;
  if (proxy) {
    o.remove(proxy);
    // geometry 与原网格共享，只释放代理自己的 PointsMaterial
    proxy.material.dispose();
    o.userData._pointsProxy = null;
  }
  if (o.userData.origMat) {
    const orig = o.userData.origMat;
    // 当前材质若是切换时创建的临时代质（线框材质等），释放它，避免 wireframe↔points 互切泄漏
    if (o.material && o.material !== orig) o.material.dispose?.();
    orig.visible = true;
    o.material = orig;
    delete o.userData.origMat;
  }
}

/**
 * 把单个网格切换到指定显示模式（solid/wireframe/points）。
 * 每次先 restore，保证 wireframe↔points 互切不泄漏上一份临时材质；
 * points 模式用 Points 代理（作为子节点继承变换）渲染顶点并隐藏实体面。
 */
export function setMeshDisplayMode(o, mode, pointSize = 0.03) {
  restoreMeshDisplay(o);
  if (mode === 'wireframe') {
    o.userData.origMat = o.material;
    o.material = new THREE.MeshBasicMaterial({ color: 0x6ea8ff, wireframe: true });
  } else if (mode === 'points') {
    o.userData.origMat = o.material;
    o.material.visible = false;
    const proxy = new THREE.Points(
      o.geometry,
      new THREE.PointsMaterial({ color: 0x6ea8ff, size: pointSize, sizeAttenuation: true })
    );
    o.userData._pointsProxy = proxy;
    o.add(proxy);
  }
}

/**
 * 创建默认工厂模型（建筑、储罐、管道、传送带、树木、围栏等）。
 * 供 SceneRuntime 和设置页实时预览共用。
 */
export function createFactoryModel() {
  const g = new THREE.Group();
  // 相同 (颜色, 参数) 的材质共享实例，避免每个网格一份材质（原实现 178 个网格 = 178 个材质）
  const matCache = new Map();
  const mat = (c, opts = {}) => {
    const key = `${c}|${JSON.stringify(opts)}`;
    let material = matCache.get(key);
    if (!material) {
      material = new THREE.MeshStandardMaterial({ color: c, metalness: opts.metalness ?? 0.3, roughness: opts.roughness ?? 0.55, ...opts });
      matCache.set(key, material);
    }
    return material;
  };
  const box = (w, h, d, x, y, z, c, opts) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(c, opts));
    m.position.set(x, y + h / 2, z);
    m.castShadow = m.receiveShadow = true;
    g.add(m);
    return m;
  };
  const cyl = (r1, r2, h, x, y, z, c, seg = 16, opts) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, seg), mat(c, opts));
    m.position.set(x, y + h / 2, z);
    m.castShadow = m.receiveShadow = true;
    g.add(m);
    return m;
  };
  const pipe = (x1, y1, z1, x2, y2, z2, r, c) => {
    const dx = x2 - x1, dy = y2 - y1, dz = z2 - z1;
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 10), mat(c, { metalness: 0.6, roughness: 0.35 }));
    m.position.set((x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(dx, dy, dz).normalize());
    m.castShadow = m.receiveShadow = true;
    g.add(m);
  };

  // Floor platform (深色，可接收阴影)
  box(18, 0.4, 14, 0, -0.4, 0, 0x0a0f18, { roughness: 0.9 });
  box(18, 0.06, 14, 0, 0, 0, 0x0d1520, { roughness: 0.85 });
  for (let x = -8; x <= 8; x += 2) box(0.06, 0.02, 14, x, 0.03, 0, 0x2a4a70);
  for (let z = -6; z <= 6; z += 2) box(18, 0.02, 0.06, 0, 0.03, z, 0x1a3a5c);

  // Main buildings
  box(4.5, 2.8, 3.2, -4.2, 0, -2.8, 0x6a7a96, { metalness: 0.4 });
  box(4.6, 0.15, 3.3, -4.2, 2.8, -2.8, 0x3a7ad8, { metalness: 0.6, roughness: 0.3 });
  for (let i = 0; i < 3; i++) box(0.6, 0.5, 0.05, -5.5 + i * 1.3, 1.2, -4.42, 0x88c8ff, { emissive: 0x4488cc, emissiveIntensity: 0.2, roughness: 0.2 });
  box(3.8, 2.4, 2.8, -4.2, 0, 3.2, 0x5e6e8a, { metalness: 0.4 });
  box(3.9, 0.12, 2.9, -4.2, 2.4, 3.2, 0x3a7ad8, { metalness: 0.6, roughness: 0.3 });
  box(3.4, 3.4, 3.6, 3.6, 0, -2.4, 0x72829e, { metalness: 0.4 });
  box(3.5, 0.15, 3.7, 3.6, 3.4, -2.4, 0x3a7ad8, { metalness: 0.6, roughness: 0.3 });
  for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) box(0.5, 0.45, 0.05, 2.6 + i * 1.0, 1.0 + j * 1.2, -4.22, 0x88c8ff, { emissive: 0x4488cc, emissiveIntensity: 0.2, roughness: 0.2 });
  box(2.8, 2.0, 3, 3.8, 0, 3.2, 0x7a8aa6, { metalness: 0.4 });
  box(2.9, 0.12, 3.1, 3.8, 2.0, 3.2, 0x3a7ad8, { metalness: 0.6, roughness: 0.3 });

  // Silos
  cyl(0.95, 0.95, 3.4, -7.2, 0, 1.5, 0x5a7a9a, 24, { metalness: 0.5, roughness: 0.4 });
  cyl(1.0, 1.0, 0.18, -7.2, 3.4, 1.5, 0x8aaacc, 24, { metalness: 0.6, roughness: 0.3 });
  cyl(0.7, 0.7, 2.8, -7.2, 0, -1.5, 0x5a7a9a, 24, { metalness: 0.5, roughness: 0.4 });
  cyl(0.75, 0.75, 0.14, -7.2, 2.8, -1.5, 0x8aaacc, 24, { metalness: 0.6, roughness: 0.3 });
  box(0.04, 2.5, 0.04, -6.2, 0.3, 1.5, 0x8a9ab0, { metalness: 0.7 });
  for (let i = 0; i < 6; i++) box(0.15, 0.03, 0.04, -6.2, 0.5 + i * 0.4, 1.5, 0x8a9ab0, { metalness: 0.7 });

  // Pipes
  pipe(-7.2, 3.5, 1.5, -7.2, 4.4, 1.5, 0.12, 0x8aaacc);
  pipe(-7.2, 4.4, 1.5, -4.2, 4.4, 1.5, 0.12, 0x8aaacc);
  pipe(-4.2, 4.4, 1.5, -4.2, 3.0, 1.5, 0.1, 0x8aaacc);
  pipe(-7.2, 2.9, -1.5, -7.2, 4.0, -1.5, 0.1, 0x8aaacc);
  pipe(-7.2, 4.0, -1.5, 3.6, 4.0, -1.5, 0.1, 0x8aaacc);
  pipe(3.6, 4.0, -1.5, 3.6, 3.6, -1.5, 0.08, 0x8aaacc);
  cyl(0.15, 0.15, 0.1, -5.5, 4.35, 1.5, 0xc04040, 8, { metalness: 0.6 });
  cyl(0.12, 0.12, 0.08, 0, 3.95, -1.5, 0xc04040, 8, { metalness: 0.6 });

  // Conveyor
  const conv = new THREE.Group();
  conv.position.set(0, 0, 0);
  box(12.5, 0.15, 0.25, 0, 0.15, -0.95, 0x3a4a66, { metalness: 0.7 });
  box(12.5, 0.15, 0.25, 0, 0.15, 0.95, 0x3a4a66, { metalness: 0.7 });
  for (let i = 0; i < 5; i++) {
    const lx = -5 + i * 2.5;
    box(0.1, 0.35, 0.1, lx, 0, -0.95, 0x4a5a76, { metalness: 0.6 });
    box(0.1, 0.35, 0.1, lx, 0, 0.95, 0x4a5a76, { metalness: 0.6 });
  }
  for (let i = 0; i < 14; i++) {
    const slat = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 1.6), mat(0x4a5a78, { metalness: 0.5, roughness: 0.6 }));
    slat.position.set(-5.5 + i * 0.85, 0.32, 0);
    slat.castShadow = slat.receiveShadow = true;
    conv.add(slat);
  }
  for (let i = 0; i < 7; i++) {
    const roller = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 1.8, 12), mat(0x5a6a88, { metalness: 0.7, roughness: 0.3 }));
    roller.position.set(-5 + i * 1.65, 0.22, 0);
    roller.rotation.z = Math.PI / 2;
    roller.castShadow = roller.receiveShadow = true;
    roller.userData.roller = true;
    conv.add(roller);
  }
  conv.userData.rollers = conv.children.filter((c) => c.userData.roller);
  g.add(conv);
  g.userData.conveyor = conv;

  // Crates on conveyor
  const crates = [];
  for (let i = 0; i < 5; i++) {
    const crate = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.55, 0.65), mat(i % 2 ? 0xc4956a : 0xb8865a, { roughness: 0.8 }));
    crate.position.set(-4.5 + i * 2, 0.63, 0);
    crate.castShadow = crate.receiveShadow = true;
    crate.userData.crate = true;
    crate.userData.crateOffset = i * 2;
    crates.push(crate);
    g.add(crate);
  }
  g.userData.crates = crates;

  // Warning lights
  for (let i = 0; i < 6; i++) {
    const x = -6 + i * 2.4;
    cyl(0.05, 0.07, 1.0, x, 0.05, -5.5, 0x4a4a4a, 8, { metalness: 0.6 });
    cyl(0.08, 0.08, 0.18, x, 1.05, -5.5, i % 2 ? 0xff6b35 : 0xe8c84a, 8, { emissive: i % 2 ? 0xff4400 : 0xccaa00, emissiveIntensity: 0.5 });
    cyl(0.05, 0.07, 1.0, x, 0.05, 5.5, 0x4a4a4a, 8, { metalness: 0.6 });
    cyl(0.08, 0.08, 0.18, x, 1.05, 5.5, i % 2 ? 0xe8c84a : 0xff6b35, 8, { emissive: i % 2 ? 0xccaa00 : 0xff4400, emissiveIntensity: 0.5 });
  }

  // Trees
  for (let x = -7; x <= 7; x += 2.8) {
    for (const z of [-4.8, 4.8]) {
      const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.5, 6), mat(0x5a4028, { roughness: 0.9 }));
      tr.position.set(x, 0.05, z); tr.castShadow = true; tr.receiveShadow = true;
      const l = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 8), mat(0x2b8060, { roughness: 0.8 }));
      l.position.set(x, 0.6, z); l.castShadow = true; l.receiveShadow = true;
      g.add(tr, l);
    }
  }

  // Ceiling lamps
  for (let i = 0; i < 4; i++) {
    const lx = -5 + i * 3.3;
    box(1.4, 0.08, 0.4, lx, 5.0, 0, 0x3a4a66, { metalness: 0.5 });
    box(1.2, 0.03, 0.3, lx, 4.96, 0, 0xfff4e0, { emissive: 0xfff0d0, emissiveIntensity: 0.8 });
    const glow = new THREE.PointLight(0xfff0d8, 0.35, 10);
    glow.position.set(lx, 4.7, 0);
    g.add(glow);
  }

  // Fence
  for (let x = -9; x <= 9; x += 1.5) {
    cyl(0.04, 0.04, 0.8, x, 0, -6.8, 0x6a7a8a, 6, { metalness: 0.6 });
    cyl(0.04, 0.04, 0.8, x, 0, 6.8, 0x6a7a8a, 6, { metalness: 0.6 });
  }
  box(18.5, 0.04, 0.04, 0, 0.5, -6.8, 0x7a8a9a, { metalness: 0.6 });
  box(18.5, 0.04, 0.04, 0, 0.7, -6.8, 0x7a8a9a, { metalness: 0.6 });
  box(18.5, 0.04, 0.04, 0, 0.5, 6.8, 0x7a8a9a, { metalness: 0.6 });
  box(18.5, 0.04, 0.04, 0, 0.7, 6.8, 0x7a8a9a, { metalness: 0.6 });

  return g;
}

export class SceneRuntime {
  constructor(container, callbacks = {}) {
    this._root = container;
    this._cb = callbacks; // { onNotice, onLoading, onDragOver, onModelLoaded }
    this._sceneConfig = null;

    // Three.js objects
    this.renderer = null;
    this.scene = null;
    this.camera = null;
    this.control = null;
    this.grid = null;
    this.hemi = null;
    this.sun = null;
    this.rim = null;
    this.THREE = THREE;

    // Model state
    this.model = null;
    this.mixer = null;
    this.exitingModel = null;
    this.entranceStart = 0;
    this._displayMode = 'solid';

    // Render loop
    this._frame = null;
    this._needsRender = true;

    // Particles
    this._pCount = 180;
    this._pGeo = null;
    this._pMat = null;
    this._particles = null;
    this._pSpeed = null;

    // FPS
    this._frameCount = 0;
    this._lastFpsTime = performance.now();
    this._currentFps = 0;

    // 性能计数：实际提交 WebGL 渲染的帧数 / 被跳过的帧数（getPerf 按秒换算速率）
    this._renderedFrames = 0;
    this._skippedFrames = 0;
    this._lastPerfAt = performance.now();
    this._lastCalls = 0;
    this._lastTris = 0;

    // Sun cycle cache
    this._sunCache = { sec: -1, h: 0, e: 0, z: 0 };

    // Press bounce spring (3D space squash & stretch)
    this._press = { current: 0, target: 0, velocity: 0 };
    this._pressActive = false;
    this._baseModelScale = new THREE.Vector3(1, 1, 1);
    this._baseCameraZoom = 1;
    this._lastFrameTime = performance.now();

    // Glasses-free 3D：运动视差状态 + 双目立体管线（在 _init 中创建 pipeline）
    this.stereo = null;
    this._parallax = { targetX: 0, targetY: 0, curX: 0, curY: 0, strength: 0.4, auto: false, enabled: false };
    this._parallaxGain = 0.12; // 视差位移占“相机到注视点距离”的比例
    this._tmpRight = new THREE.Vector3();
    this._tmpUp = new THREE.Vector3();
    this._tmpBasePos = new THREE.Vector3();

    // Observers / handlers (bound for removal)
    this._observer = null;
    this._onDragOver = this._onDragOver.bind(this);
    this._onDragLeave = this._onDragLeave.bind(this);
    this._onDrop = this._onDrop.bind(this);
    this._onKey = this._onKey.bind(this);
    this._onVis = this._onVis.bind(this);
    this._onImport = this._onImport.bind(this);
    this._onShowDefault = this._onShowDefault.bind(this);
    this._onReset = this._onReset.bind(this);
    this._onPointerMove = this._onPointerMove.bind(this);
    this._onPointerLeave = this._onPointerLeave.bind(this);

    this._init();
  }

  // ── Initialization ──────────────────────────────────────────────

  _init() {
    const root = this._root;

    // Renderer
    // powerPreference:'high-performance' 让双显卡（核显+独显）设备优先使用独立 GPU
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    // 阴影只取决于模型与光源的相对关系，静态查看/轨道旋转/视差时无需每帧重算：
    // 关闭自动更新，改由帧循环按 shouldUpdateShadow 在确有动画或显式标脏时更新一次
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.shadowMap.needsUpdate = true;
    root.append(this.renderer.domElement);

    // WebGL context lost handling
    const ctxLost = document.createElement('div');
    ctxLost.className = 'webgl-context-lost';
    ctxLost.innerHTML = '<div><b>WebGL 上下文已丢失</b><p>浏览器释放了图形资源，正在尝试恢复…</p><button>重新加载</button></div>';
    ctxLost.querySelector('button').addEventListener('click', () => location.reload());
    root.append(ctxLost);
    this.renderer.domElement.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      ctxLost.style.display = 'grid';
      cancelAnimationFrame(this._frame);
    });
    this.renderer.domElement.addEventListener('webglcontextrestored', () => {
      ctxLost.style.display = 'none';
      this._needsRender = true;
      this._frame = requestAnimationFrame(() => this._loop());
    });

    // Scene & camera
    this.scene = new THREE.Scene();
    this.scene.fog = null;
    this.camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
    this.control = new OrbitControls(this.camera, this.renderer.domElement);
    this.control.enableDamping = true;
    this.control.maxPolarAngle = Math.PI * 0.47;

    // Lights
    this.hemi = new THREE.HemisphereLight(0x88bbff, 0x1a2a4a, 0.85);
    this.sun = new THREE.DirectionalLight(0xe8f0ff, 1.6);
    this.rim = new THREE.PointLight(0x88aaff, 0.8, 40);
    this.sun.position.set(-8, 14, 6);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.02;
    this.sun.shadow.camera.near = 0.5;
    this.sun.shadow.camera.far = 80;
    this.sun.shadow.camera.left = -20;
    this.sun.shadow.camera.right = 20;
    this.sun.shadow.camera.top = 20;
    this.sun.shadow.camera.bottom = -20;
    this.rim.position.set(7, 4, -3);
    this.scene.add(this.hemi, this.sun, this.rim, this.sun.target);

    // 参考网格（默认关闭，可在设置中心“显示网格”打开）；不添加任何地面平面，模型直接置于背景中
    this.grid = new THREE.GridHelper(26, 26, 0x3a6ea5, 0x1a3a5c);
    this.scene.add(this.grid);

    // Default model
    this.model = this._factory();
    this.scene.add(this.model);

    // Particles
    this._initParticles();

    // Fit camera
    this._fit(this.model);

    // Expose runtime
    this._exposeRuntime();

    // Resize
    this._observer = new ResizeObserver(() => this._resize());
    this._observer.observe(root);
    this._resize();

    // Drag & drop
    root.addEventListener('dragover', this._onDragOver);
    root.addEventListener('dragleave', this._onDragLeave);
    root.addEventListener('drop', this._onDrop);

    // Glasses-free 3D：立体渲染管线 + 指针运动视差
    this.stereo = new StereoPipeline(this.renderer);
    this.renderer.domElement.addEventListener('pointermove', this._onPointerMove);
    this.renderer.domElement.addEventListener('pointerleave', this._onPointerLeave);

    // Keyboard
    window.addEventListener('keydown', this._onKey);

    // Visibility
    document.addEventListener('visibilitychange', this._onVis);

    // Model events
    this._unsubImport = listen(EVENTS.IMPORT, this._onImport);
    this._unsubShowDefault = listen(EVENTS.SHOW_DEFAULT, this._onShowDefault);
    this._unsubReset = listen(EVENTS.RESET, this._onReset);

    // Control change triggers render
    this.control.addEventListener('change', () => { this._needsRender = true; });

    // Start loop
    this._loop();

    // Notify ready
    dispatch(EVENTS.SCENE_READY);
  }

  _initParticles() {
    const pCount = this._pCount;
    this._pGeo = new THREE.BufferGeometry();
    const pPos = new Float32Array(pCount * 3);
    this._pSpeed = new Float32Array(pCount);
    for (let i = 0; i < pCount; i++) {
      pPos[i * 3] = (Math.random() - 0.5) * 20;
      pPos[i * 3 + 1] = Math.random() * 8;
      pPos[i * 3 + 2] = (Math.random() - 0.5) * 16;
      this._pSpeed[i] = 0.003 + Math.random() * 0.008;
    }
    this._pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
    this._pMat = new THREE.PointsMaterial({
      color: 0x88bbff, size: 0.04, transparent: true, opacity: 0.45,
      depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this._particles = new THREE.Points(this._pGeo, this._pMat);
    this.scene.add(this._particles);
  }

  // ── Default factory model ───────────────────────────────────────

  _factory() {
    return createFactoryModel();
  }

  // ── Helpers ─────────────────────────────────────────────────────

  _disposeObject(x) {
    x?.traverse((o) => {
      o.geometry?.dispose();
      if (o.material) {
        (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
      }
    });
    if (x?.userData?._springRAF) {
      cancelAnimationFrame(x.userData._springRAF);
      x.userData._springRAF = null;
    }
  }

  _fit(obj) {
    const bounds = new THREE.Box3().setFromObject(obj);
    const size = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());
    const f = THREE.MathUtils.degToRad(this.camera.fov);
    const distance = Math.max(
      size.y / (2 * Math.tan(f / 2)),
      size.x / (2 * Math.tan(f / 2) * this.camera.aspect),
      size.z * 0.65
    ) * 1.4;
    this.control.target.copy(center);
    this.camera.position.copy(center).addScaledVector(new THREE.Vector3(0.72, 0.52, 0.78).normalize(), distance);
    this.camera.near = Math.max(0.01, distance / 1200);
    this.camera.far = Math.max(1000, distance * 80);
    this.camera.updateProjectionMatrix();
    this.control.minDistance = Math.max(0.1, distance * 0.12);
    this.control.maxDistance = Math.max(40, distance * 5);
    const gridPlace = computeGridPlacement(size, center, bounds.min.y);
    this.grid.scale.setScalar(gridPlace.scale);
    this.grid.position.set(...gridPlace.grid);
    const maxDim = Math.max(size.x, size.y, size.z);
    this._particles.position.set(center.x, bounds.min.y, center.z);
    this._particles.scale.setScalar(Math.max(1, maxDim / 20));
    this._pMat.size = 0.04 * Math.max(1, maxDim / 20);
    this._setupSunForBounds(size, center, maxDim);
    this.control.update();
  }

  /**
   * 按模型包围盒设置平行光位置与正交阴影相机范围。
   * PCFSoftShadowMap 不使用 shadow.radius（仅 VSM 生效），这里用阴影范围等效控制柔化：
   * shadowSoftness 越大 → 同分辨率贴图覆盖的世界范围越大 → 每 texel 越宽 → PCF 边缘过渡越柔。
   */
  _setupSunForBounds(size, center, maxDim, reposition = true) {
    const softness = this._sceneConfig?.shadowSoftness ?? 0.6;
    const softPad = 1 + Math.max(0, softness) * 0.18;
    const shadowRange = (Math.max(size.x, size.z) * 0.8 + 4) * softPad;
    const sc = this.sun.shadow.camera;
    sc.left = -shadowRange;
    sc.right = shadowRange;
    sc.top = shadowRange;
    sc.bottom = -shadowRange;
    sc.near = 0.5;
    sc.far = Math.max(100, maxDim * 6);
    sc.updateProjectionMatrix();
    // reposition=false 时只刷新阴影范围（配置滑块拖动），不移动太阳，避免覆盖手动/循环位置
    if (reposition) {
      const sunDist = Math.max(15, maxDim * 1.5);
      this.sun.position.copy(center).add(new THREE.Vector3(-0.4, 0.85, 0.5).normalize().multiplyScalar(sunDist));
    }
    this.sun.target.position.copy(center);
    this.sun.target.updateMatrixWorld();
    this.sun.shadow.needsUpdate = true;
  }

  _resize() {
    const r = this._root.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return;
    this.renderer.setSize(r.width, r.height);
    this.stereo?.setSize(r.width, r.height);
    this.camera.aspect = r.width / r.height;
    this.camera.updateProjectionMatrix();
    // 仅首次挂载按真实宽高比自动取景；之后的尺寸变化（切换导航、缩放窗口）保留用户当前视角
    if (!this._initialFitDone) {
      this._fit(this.model);
      this._initialFitDone = true;
    }
  }

  // ── Public API ──────────────────────────────────────────────────

  getModel() { return this.model; }
  fit(obj) { this._fit(obj || this.model); }
  getFps() { return this._currentFps; }

  /** 自上次调用以来的渲染/跳过帧速率与最近一帧绘制调用、三角面（性能面板用） */
  getPerf() {
    const now = performance.now();
    const dt = Math.max(1, (now - this._lastPerfAt) / 1000);
    const rfs = Math.round(this._renderedFrames / dt);
    const sfs = Math.round(this._skippedFrames / dt);
    this._renderedFrames = 0;
    this._skippedFrames = 0;
    this._lastPerfAt = now;
    return { rfs, sfs, calls: this._lastCalls, tris: this._lastTris, mode: this.getStereoMode() };
  }

  /**
   * 3D 空间按压回弹：相机会拉近 + 模型整体缩小，产生空间凹下去的感觉；
   * 松开时弹簧回弹，带一次过冲，产生果冻般凸显的爽感。
   * @param {boolean} active - true=按下, false=松开回弹
   */
  pressBounce(active) {
    this._press.target = active ? 1 : 0;
    if (active) {
      // 按下时捕获当前相机 zoom 作为基准，避免覆盖用户手动缩放
      this._baseCameraZoom = this.camera.zoom;
      this._press.velocity = 0;
    }
  }

  /** 切换模型时清空弹簧，避免旧模型残留形变带到新模型入场末尾 */
  _resetPress() {
    this._press.current = 0;
    this._press.target = 0;
    this._press.velocity = 0;
    this._pressActive = false;
  }

  setView(preset) {
    const m = this.model;
    if (!m) return;
    const bounds = new THREE.Box3().setFromObject(m);
    const size = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const dist = maxDim * 2.2;
    let pos;
    if (preset === 'top') pos = new THREE.Vector3(center.x, center.y + dist, center.z + 0.01);
    else if (preset === 'front') pos = new THREE.Vector3(center.x, center.y, center.z + dist);
    else if (preset === 'side') pos = new THREE.Vector3(center.x + dist, center.y, center.z);
    else pos = center.clone().addScaledVector(new THREE.Vector3(0.72, 0.52, 0.78).normalize(), dist * 1.1);
    this.control.target.copy(center);
    this.camera.position.copy(pos);
    this.camera.near = Math.max(0.01, dist / 1200);
    this.camera.far = Math.max(1000, dist * 80);
    this.camera.updateProjectionMatrix();
    this.control.minDistance = Math.max(0.1, dist * 0.12);
    this.control.maxDistance = Math.max(40, dist * 5);
    this.control.update();
    this._needsRender = true;
  }

  screenshot() {
    // 截图强制单目渲染，避免截到红蓝/分屏立体画面
    if (this.stereo) this.stereo.renderPlain(this.scene, this.camera);
    else this.renderer.render(this.scene, this.camera);
    const url = this.renderer.domElement.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = `factory-3d-${Date.now()}.png`;
    a.click();
  }

  getModelInfo() {
    const m = this.model;
    if (!m) return null;
    let tris = 0, meshes = 0;
    const mats = new Set();
    m.traverse((o) => {
      if (o.isMesh) {
        meshes++;
        if (o.geometry?.index) tris += o.geometry.index.count / 3;
        else if (o.geometry?.attributes?.position) tris += o.geometry.attributes.position.count / 3;
        if (Array.isArray(o.material)) o.material.forEach((mm) => mats.add(mm.type));
        else if (o.material) mats.add(o.material.type);
      }
    });
    return { meshes, tris: Math.round(tris), materials: mats.size };
  }

  /** 恢复单个网格的原始材质并移除点云代理（对称清理，避免临时材质泄漏） */
  _restoreMeshDisplay(o) {
    restoreMeshDisplay(o);
  }

  /** 把当前显示模式应用到整棵模型树 */
  _applyDisplayMode(root) {
    if (!root) return;
    const mode = this._displayMode;
    let pointSize = 0.03;
    if (mode === 'points') {
      const box = new THREE.Box3().setFromObject(root);
      const size = box.getSize(new THREE.Vector3());
      pointSize = Math.max(size.x, size.y, size.z) * 0.002 || 0.03;
    }
    root.traverse((o) => {
      if (o.isMesh) setMeshDisplayMode(o, mode, pointSize);
    });
    this._needsRender = true;
  }

  setDisplayMode(mode) {
    this._displayMode = mode;
    this._applyDisplayMode(this.model);
  }

  /** 切换裸眼 3D / 立体模式（也可由 updateConfig 统一驱动） */
  setStereoMode(mode) {
    this.stereo?.setMode(mode);
    this._parallax.enabled = !!mode && mode !== 'off';
    this._needsRender = true;
  }

  getStereoMode() {
    return this.stereo?.mode || 'off';
  }

  _buildTree(obj) {
    const children = (obj.children || []).filter((c) => c.isMesh || c.children?.length).map((c) => this._buildTree(c));
    return { name: obj.name || (obj.isMesh ? 'Mesh' : 'Group'), type: obj.type, visible: obj.visible, children, uuid: obj.uuid };
  }

  getModelTree() {
    return this.model ? this._buildTree(this.model) : null;
  }

  focusNode(uuid) {
    const m = this.model;
    if (!m) return;
    let target = null;
    m.traverse((o) => { if (o.uuid === uuid) target = o; });
    if (!target) return;
    const box = new THREE.Box3().setFromObject(target);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const dist = maxDim * 2.5;
    this.control.target.copy(center);
    this.camera.position.copy(center).addScaledVector(new THREE.Vector3(0.72, 0.52, 0.78).normalize(), dist);
    this.camera.near = Math.max(0.01, dist / 1200);
    this.camera.far = Math.max(1000, dist * 80);
    this.camera.updateProjectionMatrix();
    this.control.update();
    this._needsRender = true;
  }

  toggleNodeVisible(uuid) {
    const m = this.model;
    if (!m) return;
    m.traverse((o) => { if (o.uuid === uuid) o.visible = !o.visible; });
    this._needsRender = true;
  }

  // ── Narrow interface (for public scripts, avoids leaking Three.js internals) ──

  /** 返回相机朝向的单位向量 */
  getCameraDirection() {
    return this.camera.getWorldDirection(new THREE.Vector3());
  }

  /** 将模型局部坐标投影到屏幕坐标 [0,1] */
  projectPoint(local) {
    const m = this.model;
    if (!m) return null;
    const world = m.localToWorld(new THREE.Vector3(local.x, local.y, local.z));
    const projected = world.clone().project(this.camera);
    return { x: (projected.x + 1) / 2, y: (-projected.y + 1) / 2, z: projected.z };
  }

  /** 从屏幕坐标射线检测模型，返回交点或 null */
  raycast(clientX, clientY) {
    const m = this.model;
    if (!m) return null;
    const bounds = this._root.getBoundingClientRect();
    const pointer = new THREE.Vector2(
      (clientX - bounds.left) / bounds.width * 2 - 1,
      -(clientY - bounds.top) / bounds.height * 2 + 1
    );
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(pointer, this.camera);
    return raycaster.intersectObject(m, true)[0] || null;
  }

  // ── Config application ──────────────────────────────────────────

  updateConfig(sceneConfig) {
    this._sceneConfig = sceneConfig;
    const r = this;
    const env = {
      factory: [0x000000, 0xa6c8ff, 0x071128, 2.2, 0xd8e8ff, 3, 0x4488ff, 22],
      studio: [0x172440, 0xffffff, 0x4b5561, 3.1, 0xffffff, 3.8, 0x9fc0ff, 13],
      dusk: [0x251625, 0x8b87c9, 0x241625, 1.9, 0xffa96d, 3.3, 0xe266b8, 18],
    }[sceneConfig.environment];
    r.scene.background = new THREE.Color(0x000000); // 强制纯黑背景
    r.scene.fog = null;
    r.hemi.color.setHex(env[1]);
    r.hemi.groundColor.setHex(env[2]);
    r.hemi.intensity = env[3] * sceneConfig.ambientIntensity;
    r.sun.color.setHex(env[4]);
    r.sun.intensity = env[5] * sceneConfig.sunIntensity;
    r.rim.color.setHex(env[6]);
    r.rim.intensity = env[7];
    r.camera.fov = sceneConfig.fov;
    r.camera.updateProjectionMatrix();
    r.control.enableRotate = sceneConfig.rotate;
    r.control.enableZoom = sceneConfig.zoom;
    r.control.enablePan = sceneConfig.pan;
    r.control.autoRotate = sceneConfig.display !== 'static';
    r.control.autoRotateSpeed = sceneConfig.rotationSpeed * (sceneConfig.display === 'showcase' ? 1.65 : 1);
    r.control.dampingFactor = sceneConfig.display === 'showcase' ? 0.085 : 0.05;
    r.grid.visible = sceneConfig.grid;
    // 场景不再包含地面平面，模型直接置于背景中；网格线由“显示网格”单独控制
    r.renderer.shadowMap.enabled = sceneConfig.shadows;
    const shadowSize = { low: 512, medium: 1024, high: 2048 }[sceneConfig.shadowQuality] || 1024;
    r.sun.shadow.mapSize.set(shadowSize, shadowSize);
    r.sun.shadow.needsUpdate = true;
    r.renderer.shadowMap.needsUpdate = true;
    r.renderer.toneMappingExposure = sceneConfig.exposure;
    r.renderer.setPixelRatio(sceneConfig.dpr === 'auto' ? Math.min(devicePixelRatio, 2) : Number(sceneConfig.dpr));
    // 阴影柔化等参数变化时，按当前模型重算阴影相机范围（不重置用户相机）
    if (this.model) {
      const b = new THREE.Box3().setFromObject(this.model);
      const sz = b.getSize(new THREE.Vector3());
      const ct = b.getCenter(new THREE.Vector3());
      this._setupSunForBounds(sz, ct, Math.max(sz.x, sz.y, sz.z), false);
    }
    // 裸眼 3D：运动视差参数 + 双目立体输出模式
    const px = this._parallax;
    px.strength = sceneConfig.parallaxStrength ?? 0.4;
    px.auto = sceneConfig.parallaxAuto === true;
    px.enabled = sceneConfig.stereoMode && sceneConfig.stereoMode !== 'off';
    this.stereo?.setMode(sceneConfig.stereoMode || 'off');
    this._needsRender = true;
  }

  // ── Model loading ───────────────────────────────────────────────

  async _importFile(file, silent) {
    if (!file) return;
    if (this.mixer) { this.mixer.stopAllAction(); this.mixer = null; }
    if (file.size > 200 * 1024 * 1024) {
      this._cb.onNotice?.('文件超过 200MB 限制');
      return;
    }
    this._cb.onLoading?.(true);
    if (!silent) this._cb.onNotice?.(`正在加载 ${file.name}…`);
    let next;
    try {
      const loaded = await loadModelFile(file);
      next = loaded.object;
      this.mixer = loaded.mixer;
      // 导入模型：统一启用阴影 + 转换不支持光照的材质
      next.traverse((o) => {
        if (o.isMesh) {
          o.castShadow = true;
          o.receiveShadow = true;
          o.frustumCulled = false;
          if (Array.isArray(o.material)) {
            o.material = o.material.map(convertMaterialToStandard);
          } else {
            o.material = convertMaterialToStandard(o.material);
          }
        }
      });
      if (this.model) {
        this.exitingModel = this.model;
        this.exitingModel.userData.exitStart = performance.now();
        this.exitingModel.userData.exitScale = this.model.scale.clone();
        this.exitingModel.userData.exitPos = this.model.position.clone();
        this.exitingModel.userData.exitRot = this.model.rotation.clone();
      }
      this.scene.add(next);
      this.model = next;
      this._fit(this.model);
      // 模型入场景后再强制遍历一次，确保所有网格（含地面）启用阴影
      next.traverse((o) => {
        if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; }
      });
      // 强制阴影贴图更新，确保导入模型立即有阴影
      this.sun.shadow.needsUpdate = true;
      this.renderer.shadowMap.needsUpdate = true;
      this._needsRender = true;
      this.model.userData.tScale = this.model.scale.clone();
      this.model.userData.tPos = this.model.position.clone();
      this.model.userData.tRot = this.model.rotation.clone();
      this.model.scale.setScalar(0.3);
      this.model.position.y = this.model.userData.tPos.y - 1.8;
      this.model.rotation.y = this.model.userData.tRot.y - 2.0;
      this.entranceStart = performance.now();
      this._resetPress();
      if (this._displayMode !== 'solid') this._applyDisplayMode(this.model);
      this._cb.onModelLoaded?.(file);
      if (!silent) this._cb.onNotice?.(`${file.name} 已载入`);
    } catch {
      this._cb.onNotice?.('模型载入失败：请检查格式、资源引用和文件完整性');
    } finally {
      this._cb.onLoading?.(false);
    }
  }

  _showDefault() {
    if (this.model) {
      this.exitingModel = this.model;
      this.exitingModel.userData.exitStart = performance.now();
      this.exitingModel.userData.exitScale = this.model.scale.clone();
      this.exitingModel.userData.exitPos = this.model.position.clone();
      this.exitingModel.userData.exitRot = this.model.rotation.clone();
    }
    if (this.mixer) { this.mixer.stopAllAction(); this.mixer = null; }
    const nm = this._factory();
    this.scene.add(nm);
    this.model = nm;
    this._fit(this.model);
    this.model.userData.tScale = this.model.scale.clone();
    this.model.userData.tPos = this.model.position.clone();
    this.model.userData.tRot = this.model.rotation.clone();
    this.model.scale.setScalar(0.3);
    this.model.position.y = this.model.userData.tPos.y - 1.8;
    this.model.rotation.y = this.model.userData.tRot.y - 2.0;
    this.entranceStart = performance.now();
    this._resetPress();
    if (this._displayMode !== 'solid') this._applyDisplayMode(this.model);
  }

  // ── Event handlers ──────────────────────────────────────────────

  _onImport(event) {
    const { file, silent } = event.detail || {};
    this._importFile(file, silent);
  }

  _onShowDefault() {
    this._showDefault();
  }

  _onReset() {
    this._fit(this.model);
    this._needsRender = true;
  }

  _onDragOver(e) {
    e.preventDefault();
    this._cb.onDragOver?.(true);
  }

  _onDragLeave(e) {
    if (e.target === this._root || !this._root.contains(e.relatedTarget)) {
      this._cb.onDragOver?.(false);
    }
  }

  _onDrop(e) {
    e.preventDefault();
    this._cb.onDragOver?.(false);
    const f = e.dataTransfer?.files?.[0];
    if (f && /\.(glb|gltf|fbx|obj)$/i.test(f.name)) {
      dispatch(EVENTS.IMPORT, { file: f, silent: false });
    }
  }

  _onPointerMove(e) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const { nx, ny } = normalizePointer(e.clientX, e.clientY, rect);
    this._parallax.targetX = nx;
    this._parallax.targetY = ny;
    // 指针移动当帧立即恢复渲染，直到视差阻尼重新收敛（配合 shouldRenderFrame 的静止停绘）
    this._needsRender = true;
  }

  _onPointerLeave() {
    this._parallax.targetX = 0;
    this._parallax.targetY = 0;
    this._needsRender = true;
  }

  _onKey(e) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (e.key === 'r' || e.key === 'R') { this._fit(this.model); this._needsRender = true; }
    if (e.key === 'f' || e.key === 'F') { document.querySelector('.viewer-page')?.requestFullscreen?.(); }
    if (e.key === 'l' || e.key === 'L') {
      const v = document.querySelector('.viewer');
      if (v) {
        v.classList.toggle('labels-hidden');
        const tgl = document.querySelector('.label-toggle');
        if (tgl) tgl.classList.toggle('inactive', v.classList.contains('labels-hidden'));
      }
    }
  }

  _onVis() {
    if (document.hidden) {
      cancelAnimationFrame(this._frame);
    } else {
      this._needsRender = true;
      this._frame = requestAnimationFrame(() => this._loop());
    }
  }

  // ── Render loop ─────────────────────────────────────────────────

  _loop() {
    const sc = this._sceneConfig || {};
    // 真实 delta time，适配不同刷新率
    const frameNow = performance.now();
    const dt = Math.min((frameNow - this._lastFrameTime) / 1000, 0.05);
    this._lastFrameTime = frameNow;
    this.mixer?.update(dt);
    this.control.update();

    // 静态展示模式（display:'static'）冻结传送带/粒子等环境动画，让画面真正静止、可空闲省电；
    // dynamic / showcase 模式行为不变
    const envPaused = sc.display === 'static';

    // Conveyor animation
    const convRef = envPaused ? null : this.model?.userData?.conveyor;
    if (convRef) {
      const t = performance.now() * 0.001;
      convRef.userData.rollers.forEach((c, i) => { c.rotation.x = t * 2 + i * 0.3; });
      // 货箱在创建时已收集，避免每帧 scene.traverse 全树
      (this.model.userData.crates || []).forEach((o) => {
        // 环长取 10 = 货箱数 5 × 间距 2，保证绕回处相邻货箱也是等距 2，避免末端挤堆
        o.position.x = -4.5 + ((t * 0.4 + (o.userData.crateOffset || 0)) % 10);
      });
    }

    // Particles（静态模式冻结，避免无谓的 CPU 写缓冲与 GPU 重传）
    if (!envPaused) {
      const pArr = this._pGeo.attributes.position.array;
      for (let i = 0; i < this._pCount; i++) {
        pArr[i * 3 + 1] += this._pSpeed[i];
        if (pArr[i * 3 + 1] > 8) {
          pArr[i * 3 + 1] = 0;
          pArr[i * 3] = (Math.random() - 0.5) * 20;
          pArr[i * 3 + 2] = (Math.random() - 0.5) * 16;
        }
      }
      this._pGeo.attributes.position.needsUpdate = true;
    }

    // Entrance animation
    if (this.entranceStart > 0 && this.model && this.model.userData.tScale) {
      const ep = Math.min((performance.now() - this.entranceStart) / 850, 1);
      const c1 = 1.70158, c3 = c1 + 1;
      const eb = 1 + c3 * Math.pow(ep - 1, 3) + c1 * Math.pow(ep - 1, 2);
      const ec = ep * ep * ep;
      const ts = this.model.userData.tScale;
      const tp = this.model.userData.tPos;
      const tr = this.model.userData.tRot;
      this.model.scale.set(ts.x * (0.3 + 0.7 * eb), ts.y * (0.3 + 0.7 * eb), ts.z * (0.3 + 0.7 * eb));
      this.model.position.y = (tp.y - 1.8) * (1 - ec) + tp.y * ec;
      this.model.rotation.y = (tr.y - 2.0) * (1 - ec) + tr.y * ec;
      const punch = Math.sin(ep * Math.PI) * 0.13;
      this.camera.zoom = 1 + punch;
      this.camera.updateProjectionMatrix();
      if (ep >= 1) {
        this.entranceStart = 0;
        this.camera.zoom = 1;
        this.camera.updateProjectionMatrix();
      }
    }

    // Exit animation
    if (this.exitingModel) {
      const xp = Math.min((performance.now() - this.exitingModel.userData.exitStart) / 500, 1);
      const xi = xp * xp * xp;
      const es = this.exitingModel.userData.exitScale;
      const ep2 = this.exitingModel.userData.exitPos;
      const er = this.exitingModel.userData.exitRot;
      this.exitingModel.scale.set(es.x * (1 - 0.8 * xi), es.y * (1 - 0.8 * xi), es.z * (1 - 0.8 * xi));
      this.exitingModel.position.y = ep2.y * (1 - xi) + (ep2.y - 1.3) * xi;
      this.exitingModel.rotation.y = er.y * (1 - xi) + (er.y + 1.2) * xi;
      if (xp >= 1) {
        this.scene.remove(this.exitingModel);
        this._disposeObject(this.exitingModel);
        this.exitingModel = null;
      }
    }

    // Press bounce spring (3D space squash & stretch)
    // 只在入场动画结束后应用，避免冲突；收敛后停止写 model.scale，避免屏蔽动画自身的缩放轨道
    if (this.entranceStart <= 0 && this.model) {
      const p = this._press;
      const wasActive = this._pressActive;
      stepPressSpring(p, dt);
      const active = p.target !== 0 || Math.abs(p.current) > 0.001 || Math.abs(p.velocity) > 0.01;
      if (active) {
        const pressVal = p.current;
        if (Math.abs(pressVal) > 0.001) {
          // 基于按压开始时的基础 zoom，避免覆盖用户手动缩放
          this.camera.zoom = this._baseCameraZoom * (1 + pressVal * 0.4);
          this.camera.updateProjectionMatrix();
        }
        const scaleFactor = 1 - pressVal * 0.18;
        const ts = this.model.userData.tScale || this._baseModelScale;
        this.model.scale.set(ts.x * scaleFactor, ts.y * scaleFactor, ts.z * scaleFactor);
      } else if (wasActive) {
        // 弹簧刚收敛：复位一次相机与模型缩放，之后交还给模型自身/动画
        this.camera.zoom = this._baseCameraZoom;
        this.camera.updateProjectionMatrix();
        const ts = this.model.userData.tScale;
        if (ts) this.model.scale.copy(ts);
        p.current = 0;
        p.velocity = 0;
      }
      this._pressActive = active;
    }

    // Sun cycle
    const d0 = new Date();
    const sec0 = d0.getSeconds();
    if (sec0 !== this._sunCache.sec) {
      this._sunCache.sec = sec0;
      this._sunCache.h = d0.getHours() + d0.getMinutes() / 60 + sec0 / 3600;
      const a = (this._sunCache.h - 6) / 12 * Math.PI;
      this._sunCache.e = Math.sin(a);
      this._sunCache.z = Math.cos(a);
    }
    const e = this._sunCache.e, z = this._sunCache.z;
    if (sc.sunCycle !== false) {
      if (sc.sunManual) {
        const az = sc.sunAzimuth * Math.PI / 180;
        const el = sc.sunElevation * Math.PI / 180;
        const r = 18;
        this.sun.position.set(Math.cos(el) * Math.sin(az) * r, Math.sin(el) * r, Math.cos(el) * Math.cos(az) * r);
        this.sun.color.setRGB(1, 0.95, 0.85);
        this.sun.intensity = sc.sunIntensity * 1.2;
        this.hemi.color.setHex(0x88bbff);
        this.hemi.groundColor.setHex(0x1a2a4a);
        this.hemi.intensity = 0.7 * sc.ambientIntensity;
        this.rim.intensity = 0.4;
      } else {
        this.sun.position.set(z * 15, Math.max(0.5, e * 18), z * 8);
        const sunGain = sc.sunIntensity ?? 1;
        const ambGain = sc.ambientIntensity ?? 1;
        if (e > 0.3) {
          const t = (e - 0.3) / 0.7;
          this.sun.color.setRGB(1, 0.93 + t * 0.07, 0.8 + t * 0.2);
          this.sun.intensity = (0.6 + e * 0.9) * sunGain;
          this.hemi.color.setHex(0x88bbff);
          this.hemi.groundColor.setHex(0x1a2a4a);
          this.hemi.intensity = (0.6 + e * 0.3) * ambGain;
          this.rim.intensity = 0.2;
        } else if (e > 0) {
          this.sun.color.setRGB(1, 0.4 + e * 1.7, 0.2 + e * 2);
          this.sun.intensity = (0.2 + e * 1.3) * sunGain;
          this.hemi.color.setHex(0xff9966);
          this.hemi.groundColor.setHex(0x2a1a1a);
          this.hemi.intensity = (0.3 + e) * ambGain;
          this.rim.intensity = 0.3;
        } else {
          this.sun.intensity = 0;
          this.hemi.color.setHex(0x1a2a4a);
          this.hemi.groundColor.setHex(0x0a0a1a);
          this.hemi.intensity = 0.15 * ambGain;
          this.rim.color.setHex(0x6688aa);
          this.rim.intensity = 0.5;
        }
      }
    }

    // Carousel
    if (!window.__carouselConfig) {
      try {
        window.__carouselConfig = JSON.parse(localStorage.getItem('factory-workbench-v4') || '{}').carousel || {};
      } catch { window.__carouselConfig = {}; }
    }
    const car = window.__carouselConfig;
    if (car.enabled && car.modelNames && car.modelNames.length > 1) {
      const cn = Date.now();
      if (!window._carouselTs) window._carouselTs = cn;
      if (cn - window._carouselTs > (car.interval || 8) * 1000) {
        window._carouselTs = cn;
        const names = car.modelNames;
        const cur = localStorage.getItem('factory-active-model') || names[0];
        const idx = names.indexOf(cur);
        const nextName = names[(idx + 1) % names.length];
        if (nextName && nextName !== cur) {
          localStorage.setItem('factory-active-model', nextName);
          dispatch(EVENTS.ACTIVE_MODEL_CHANGE, nextName);
          if (nextName === 'Factory Campus A.glb') {
            dispatch(EVENTS.SHOW_DEFAULT);
          } else {
            dispatch(EVENTS.SHOW_MODEL, { name: nextName, silent: true });
          }
        }
      }
    }

    // FPS
    this._frameCount++;
    const now = performance.now();
    if (now - this._lastFpsTime >= 1000) {
      this._currentFps = Math.round(this._frameCount * 1000 / (now - this._lastFpsTime));
      this._frameCount = 0;
      this._lastFpsTime = now;
    }

    // Glasses-free 3D：运动视差（指针 / 自动微摆），帧率无关阻尼后对相机做离轴偏移
    const px = this._parallax;
    let parallaxApplied = false;
    if (px.enabled) {
      let tx = px.targetX, ty = px.targetY;
      if (px.auto) { const sway = autoSway(frameNow / 1000); tx = sway.nx; ty = sway.ny; }
      px.curX = damp(px.curX, tx, 6, dt);
      px.curY = damp(px.curY, ty, 6, dt);
      const off = parallaxEyeOffset(px.curX, px.curY, px.strength);
      // 偏移幅度与“相机到注视点距离”成比例，保证不同模型缩放下视差观感一致
      const dist = this.camera.position.distanceTo(this.control.target);
      const amp = dist * this._parallaxGain;
      if (Math.abs(off.fx) > 0.0005 || Math.abs(off.fy) > 0.0005) {
        this._tmpRight.set(1, 0, 0).applyQuaternion(this.camera.quaternion);
        this._tmpUp.set(0, 1, 0).applyQuaternion(this.camera.quaternion);
        this._tmpBasePos.copy(this.camera.position);
        this.camera.position
          .addScaledVector(this._tmpRight, off.fx * amp)
          .addScaledVector(this._tmpUp, off.fy * amp);
        parallaxApplied = true;
      }
    }

    // Render（启用视差或双目立体时需要持续渲染）
    // 视差只在“阻尼未收敛 / 自动微摆 / 双目输出”时需要连续渲染；指针静止、偏移收敛后
    // 回到按需渲染，避免“视差开关常开”导致的逐帧空转
    const dualEye = this.stereo?.isDualEye ?? false;
    const pxSettled = !px.enabled || (!px.auto && parallaxSettled(px.curX, px.curY, px.targetX, px.targetY));
    const hasAnim = this.mixer || this.entranceStart > 0 || this.exitingModel || sc.sunCycle !== false || (!envPaused && this.model?.userData?.conveyor);
    const doRender = shouldRenderFrame({
      needs: this._needsRender, hasAnim, dualEye,
      parallaxEnabled: px.enabled, autoSway: px.auto, settled: pxSettled,
    });
    if (doRender) {
      // 阴影按需：仅场景动画时重算阴影贴图，轨道旋转/运动视差/纯静态不重算
      // （换模型、改阴影质量等离散事件在各自位置直接置 needsUpdate）
      if (shouldUpdateShadow({ hasAnim })) {
        this.renderer.shadowMap.needsUpdate = true;
      }
      if (this.stereo) this.stereo.render(this.scene, this.camera);
      else this.renderer.render(this.scene, this.camera);
      this._needsRender = false;
      this._renderedFrames++;
      this._lastCalls = this.renderer.info.render.calls;
      this._lastTris = this.renderer.info.render.triangles;
    } else {
      this._skippedFrames++;
    }
    // 还原相机位置：离轴偏移只作用于本帧渲染，不进入 OrbitControls 的轨道状态
    if (parallaxApplied) this.camera.position.copy(this._tmpBasePos);
    this._frame = requestAnimationFrame(() => this._loop());
  }

  // ── Runtime exposure (for public scripts) ───────────────────────

  _exposeRuntime() {
    const rt = this;
    window.__factorySceneRuntime = {
      renderer: rt.renderer,
      scene: rt.scene,
      camera: rt.camera,
      control: rt.control,
      grid: rt.grid,
      hemi: rt.hemi,
      sun: rt.sun,
      rim: rt.rim,
      THREE: rt.THREE,
      fit: (obj) => rt.fit(obj),
      getModel: () => rt.getModel(),
      setView: (p) => rt.setView(p),
      screenshot: () => rt.screenshot(),
      getModelInfo: () => rt.getModelInfo(),
      setDisplayMode: (m) => rt.setDisplayMode(m),
      getFps: () => rt.getFps(),
      getPerf: () => rt.getPerf(),
      getModelTree: () => rt.getModelTree(),
      focusNode: (u) => rt.focusNode(u),
      toggleNodeVisible: (u) => rt.toggleNodeVisible(u),
      // Narrow interface (preferred for new code)
      getCameraDirection: () => rt.getCameraDirection(),
      projectPoint: (local) => rt.projectPoint(local),
      raycast: (x, y) => rt.raycast(x, y),
      pressBounce: (active) => rt.pressBounce(active),
      setStereoMode: (m) => rt.setStereoMode(m),
      getStereoMode: () => rt.getStereoMode(),
    };
    window.__factorySetView = (p) => rt.setView(p);
    window.__factoryScreenshot = () => rt.screenshot();
    window.__factoryGetModelInfo = () => rt.getModelInfo();
    window.__factorySetDisplayMode = (m) => rt.setDisplayMode(m);
    window.__factoryGetDisplayMode = () => rt._displayMode;
    window.__factoryGetFps = () => rt.getFps();
    window.__factoryGetPerf = () => rt.getPerf();
    window.__factoryGetModelTree = () => rt.getModelTree();
    window.__factoryFocusNode = (u) => rt.focusNode(u);
    window.__factoryToggleNodeVisible = (u) => rt.toggleNodeVisible(u);
  }

  // ── Cleanup ─────────────────────────────────────────────────────

  dispose() {
    this._unsubImport?.();
    this._unsubShowDefault?.();
    this._unsubReset?.();
    window.removeEventListener('keydown', this._onKey);
    document.removeEventListener('visibilitychange', this._onVis);
    this._root.removeEventListener('dragover', this._onDragOver);
    this._root.removeEventListener('dragleave', this._onDragLeave);
    this._root.removeEventListener('drop', this._onDrop);
    this.renderer.domElement.removeEventListener('pointermove', this._onPointerMove);
    this.renderer.domElement.removeEventListener('pointerleave', this._onPointerLeave);
    this._observer?.disconnect();
    cancelAnimationFrame(this._frame);
    if (this.exitingModel) {
      this._disposeObject(this.exitingModel);
      this.exitingModel = null;
    }
    this._disposeObject(this.model);
    this._pGeo?.dispose();
    this._pMat?.dispose();
    this.stereo?.dispose();
    this.renderer.dispose();
    this._root.replaceChildren();
    // Clear globals
    window.__factorySceneRuntime = null;
    window.__factorySetView = null;
    window.__factoryScreenshot = null;
    window.__factoryGetModelInfo = null;
    window.__factorySetDisplayMode = null;
    window.__factoryGetDisplayMode = null;
    window.__factoryGetFps = null;
    window.__factoryGetPerf = null;
    window.__factoryGetModelTree = null;
    window.__factoryFocusNode = null;
    window.__factoryToggleNodeVisible = null;
  }
}
