import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EVENTS, dispatch, listen } from '../events.js';
import { sheetErrorMessage } from '../data/sheet-io.js';
import { loadModelFile } from './ModelLoader.js';
import { StereoPipeline, normalizePointer, damp, parallaxEyeOffset, autoSway } from './stereo.js';
import { parallaxSettled, shouldRenderFrame, shouldUpdateShadow } from './render-policy.js';
import {
  bindEquipmentClickGuard,
  bindEquipmentIds,
  equipmentIdOf,
  firstVisibleHit,
  isHierarchyVisible,
  normalizeStatusEntry,
  paintEquipmentStatuses,
  restoreStatusMaterials,
} from './device-status.js';
import { statusColor } from '../data/selectors.js';
import { createTour, tourPause, tourResume, tourStart, tourStop, tourTick } from './tour.js';
import { VIEW_RESET_DOUBLE_TAP_PX } from './pointer-slop.js';
import { createEnvironmentMap } from './factory/environment.js';
import { createFactoryModel } from './factory/index.js';
import { animateRobotArm } from './factory/robot-arm.js';
import { countTriangles } from './model-stats.js';

export { createFactoryModel };

/**
 * SceneRuntime — owns the Three.js scene, render loop, and model lifecycle.
 * The React Scene component is a thin adapter that mounts this runtime and
 * forwards config changes and UI callbacks.
 *
 * Public interface (also exposed on window.__factorySceneRuntime for public scripts):
 *   renderer, scene, camera, control, grid, hemi, sun, rim, THREE
 *   getModel(), fit(), setView(), screenshot(), getModelInfo(), getHomeView()
 *   setDisplayMode(), getFps(), getModelTree(), focusNode(), toggleNodeVisible()
 *   setDeviceStatuses(map), clearDeviceStatuses(), setEquipmentPickEnabled(bool)
 *   equipmentFrame(id), focusEquipment(id), setStatusFilter(status|null)
 *   raycastVisible(clientX, clientY), isHierarchyVisible(object)
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

/** 双击归位动画时长（毫秒）。缓出，结束时精确落在初始取景。 */
export const VIEW_RESET_MS = 680;
/** 触屏两次抬起的最大间隔。超过则不是双击。位移阈值见 VIEW_RESET_DOUBLE_TAP_PX。 */
export const VIEW_RESET_DOUBLE_TAP_MS = 350;
export { VIEW_RESET_DOUBLE_TAP_PX };

/** 只有点在空白处才归位，命中模型时把单击留给选中。 */
export function shouldResetViewOnDoubleActivate({ hitsModel }) {
  return hitsModel !== true;
}

/** prev/next 为 { t, x, y }。用于触屏双击（与鼠标 dblclick 同一归位结果）。 */
export function isViewResetDoubleTap(prev, next) {
  if (!prev || !next) return false;
  const dt = next.t - prev.t;
  if (!(dt > 0) || dt > VIEW_RESET_DOUBLE_TAP_MS) return false;
  const dx = next.x - prev.x;
  const dy = next.y - prev.y;
  return dx * dx + dy * dy <= VIEW_RESET_DOUBLE_TAP_PX * VIEW_RESET_DOUBLE_TAP_PX;
}

function easeOutCubic(t) {
  const x = t < 0 ? 0 : t > 1 ? 1 : t;
  return 1 - (1 - x) ** 3;
}

/**
 * 把当前机位插向已记录的初始机位。t 为 0..1 的进度。
 * 终点就是调用方传入的初始 position/target（来自现有 _fit，不另写取景常数）。
 * 不修改入参。
 */
export function sampleViewReset(fromPos, fromTarget, toPos, toTarget, t) {
  const done = t >= 1;
  if (done) {
    return {
      position: { x: toPos.x, y: toPos.y, z: toPos.z },
      target: { x: toTarget.x, y: toTarget.y, z: toTarget.z },
      done: true,
    };
  }
  const k = easeOutCubic(t);
  const mix = (a, b) => ({
    x: a.x + (b.x - a.x) * k,
    y: a.y + (b.y - a.y) * k,
    z: a.z + (b.z - a.z) * k,
  });
  return { position: mix(fromPos, toPos), target: mix(fromTarget, toTarget), done: false };
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
    roughness: 0.58,
    metalness: 0.22,
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

export class SceneRuntime {
  constructor(container, callbacks = {}) {
    this._root = container;
    this._cb = callbacks; // { onNotice, onLoading, onLoadProgress, onDragOver, onModelLoaded }
    this._sceneConfig = null;

    // Three.js objects
    this.renderer = null;
    this._envTarget = null;
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
    // 模型导入请求序号：连续快速导入时只提交最后一次请求，避免“先请求后返回”覆盖新模型
    this._importSeq = 0;

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

    // 双击归位：记下 _fit 写出的初始机位，轨道操作之后平滑回到该值
    this._captureHome = true;
    this._homePosition = null;
    this._homeTarget = null;
    this._viewReset = null;
    this._lastTap = null;
    // pointerup 已经用 _lastTap 判定过双击；click 晚于 pointerup，只读这一下的结果。
    this._touchClickDouble = false;
    // 鼠标、笔、触屏共用这一份按下记录。moved 在按下期间由 pointermove 置位，pointerdown 换新记录即清零。
    this._pointerDown = null;
    this._touchIds = new Set();
    this._touchGesture = null;

    // 设备拾取与状态着色（与双击归位的监听分开登记，便于合并）
    this._equipmentPickEnabled = true;
    this._equipmentCatalog = null;
    this._selectedEquipmentId = null;
    this._statusFilter = null;
    this._equipRaycaster = null;
    this._equipPointer = null;
    this._unbindEquipmentPick = null;
    this._unsubEquipmentSelect = null;
    this._onEquipmentSelect = this._onEquipmentSelect.bind(this);

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
    this._onDblClick = this._onDblClick.bind(this);
    this._onViewResetPointerDown = this._onViewResetPointerDown.bind(this);
    this._onViewResetPointerMove = this._onViewResetPointerMove.bind(this);
    this._onViewResetPointerUp = this._onViewResetPointerUp.bind(this);
    this._onViewResetPointerCancel = this._onViewResetPointerCancel.bind(this);
    this._onControlStart = this._onControlStart.bind(this);

    // 自动巡检。idle 时不改按需渲染；飞行靠已有的相机缓动把 _needsRender 置上。
    this._tour = createTour([]);
    this._tourSaved = null;
    // 只有巡检自己派发的选中才算巡检弹出的卡片。用户再选时这个标记清掉，stopTour 不再关那张卡。
    this._tourOpenedCard = false;
    this._selectionFromTour = false;

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
    // ACES 电影级色调映射：压缩高光、拉开明暗对比，增强体积与材质层次
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
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
      this._frame = null;
    });
    this.renderer.domElement.addEventListener('webglcontextrestored', () => {
      ctxLost.style.display = 'none';
      if (this.scene) this._setEnvironment();
      this._needsRender = true;
      this._scheduleFrame();
    });

    // Scene & camera
    this.scene = new THREE.Scene();
    this.scene.fog = null;
    this._setEnvironment();
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
    this.renderer.domElement.addEventListener('dblclick', this._onDblClick);
    this.renderer.domElement.addEventListener('pointerdown', this._onViewResetPointerDown);
    this.renderer.domElement.addEventListener('pointermove', this._onViewResetPointerMove);
    this.renderer.domElement.addEventListener('pointerup', this._onViewResetPointerUp);
    this.renderer.domElement.addEventListener('pointercancel', this._onViewResetPointerCancel);
    this._bindEquipmentPick();

    // Keyboard
    window.addEventListener('keydown', this._onKey);

    // Visibility
    document.addEventListener('visibilitychange', this._onVis);

    // Model events
    this._unsubImport = listen(EVENTS.IMPORT, this._onImport);
    this._unsubShowDefault = listen(EVENTS.SHOW_DEFAULT, this._onShowDefault);
    this._unsubReset = listen(EVENTS.RESET, this._onReset);

    // Control change triggers render. 拖拽旋转一开始就停掉归位动画，避免下一帧被拉回。
    this.control.addEventListener('change', () => { this._needsRender = true; });
    this.control.addEventListener('start', this._onControlStart);

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

  _setEnvironment() {
    const next = createEnvironmentMap(this.renderer);
    const previous = this._envTarget;
    this._envTarget = next;
    this.scene.environment = next.texture;
    previous?.dispose();
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

  /** 用户改机位时停巡检，不缓回巡检前的位置。拖动和缩放只暂停，不走这里。 */
  _userTakesCamera() {
    this.stopTour({ restoreView: false });
    this._cancelViewReset();
  }

  _fit(obj, captureHome = this._captureHome) {
    this._userTakesCamera();
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
    if (captureHome) this._storeHomeFromCamera();
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
      this._captureHome = false;
    }
  }

  // ── Public API ──────────────────────────────────────────────────

  getModel() { return this.model; }
  fit(obj) { this._fit(obj || this.model); }
  getFps() { return this._currentFps; }

  /**
   * 自上次调用以来的渲染/跳过帧速率、最近一帧绘制调用与每帧提交三角面。
   * trisTotal 是模型静态三角面，来自最近一次 getModelInfo() 缓存。
   * 这里只在 this.model 对象本身换掉时才调用 getModelInfo()。就地往当前模型添加子节点不会在 getPerf 里重算，缓存会一直停在旧的遍历结果。
   * 三维页 ModelInfoBadge 每 1.5s 调用一次 getModelInfo()，那次调用会刷新这份缓存，所以面板暂时跟得上。
   * 只读，不标脏、不触发渲染。
   */
  getPerf() {
    const now = performance.now();
    const dt = Math.max(1, (now - this._lastPerfAt) / 1000);
    const rfs = Math.round(this._renderedFrames / dt);
    const sfs = Math.round(this._skippedFrames / dt);
    this._renderedFrames = 0;
    this._skippedFrames = 0;
    this._lastPerfAt = now;
    let trisTotal = null;
    if (this.model) {
      if (this._cachedModelInfoModel !== this.model) this.getModelInfo();
      trisTotal = this._cachedModelInfo?.tris ?? null;
    }
    return { rfs, sfs, calls: this._lastCalls, tris: this._lastTris, trisTotal, mode: this.getStereoMode() };
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
    this._userTakesCamera();
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
    if (!m) {
      this._cachedModelInfo = null;
      this._cachedModelInfoModel = null;
      return null;
    }
    let meshes = 0;
    const mats = new Set();
    m.traverse((o) => {
      if (o.isMesh) {
        meshes++;
        if (Array.isArray(o.material)) o.material.forEach((mm) => mats.add(mm.type));
        else if (o.material) mats.add(o.material.type);
      }
    });
    const info = { meshes, tris: countTriangles(m), materials: mats.size };
    this._cachedModelInfo = info;
    this._cachedModelInfoModel = m;
    return info;
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
    this._userTakesCamera();
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

  // ── Config application ──────────────────────────────────────────

  updateConfig(sceneConfig) {
    this._sceneConfig = sceneConfig;
    const r = this;
    const env = {
      // 末列 envIntensity：环境贴图强度，和 ambientIntensity 相乘后写入 scene.environmentIntensity
      factory: [0x000000, 0xa6c8ff, 0x071128, 1.7, 0xeaf2ff, 3.3, 0x6aa8ff, 30, 0.6],
      studio: [0x172440, 0xffffff, 0x4b5561, 3.1, 0xffffff, 3.8, 0x9fc0ff, 13, 0.9],
      dusk: [0x251625, 0x8b87c9, 0x241625, 1.9, 0xffa96d, 3.3, 0xe266b8, 18, 0.45],
    }[sceneConfig.environment];
    r.scene.background = new THREE.Color(0x000000); // 强制纯黑背景
    r.scene.fog = null;
    r.hemi.color.setHex(env[1]);
    r.hemi.groundColor.setHex(env[2]);
    // 环境贴图已提供间接光，半球光在原强度上减半，避免过曝
    r.hemi.intensity = env[3] * 0.5 * sceneConfig.ambientIntensity;
    r.scene.environmentIntensity = env[8] * sceneConfig.ambientIntensity;
    r.sun.color.setHex(env[4]);
    r.sun.intensity = env[5] * sceneConfig.sunIntensity;
    r.rim.color.setHex(env[6]);
    r.rim.intensity = env[7];
    r.camera.fov = sceneConfig.fov;
    r.camera.updateProjectionMatrix();
    r.control.enableRotate = sceneConfig.rotate;
    r.control.enableZoom = sceneConfig.zoom;
    r.control.enablePan = sceneConfig.pan;
    const spin = sceneConfig.display !== 'static';
    if (this._tour && this._tour.phase !== 'idle') {
      if (this._tourSaved) this._tourSaved.autoRotate = spin;
      r.control.autoRotate = false;
    } else {
      r.control.autoRotate = spin;
    }
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
    if (file.size > 200 * 1024 * 1024) {
      this._cb.onNotice?.('文件超过 200MB 限制');
      return;
    }
    this.stopTour();
    // 每次导入自增序号：连续快速导入 A、B 时，只提交最后一次请求（B），先返回的 A 作废
    const seq = ++this._importSeq;
    this._cb.onLoading?.(true);
    // 还没读到字节。0 是真实起点，避免遮罩在第一片回来前误显示成「正在解析」。
    this._cb.onLoadProgress?.(0);
    if (!silent) this._cb.onNotice?.(`正在加载 ${file.name}…`);
    try {
      const loaded = await loadModelFile(file, {
        onProgress: (p) => { if (seq === this._importSeq) this._cb.onLoadProgress?.(p); },
      });
      // 等待解析期间又发起了更新的导入（或切回默认模型）：本次结果已过期，释放 GPU 资源后直接放弃
      if (seq !== this._importSeq) {
        this._disposeObject(loaded.object);
        return;
      }
      const next = loaded.object;
      // 确认提交时才停掉旧动画，避免加载失败/被覆盖时把当前模型的动画误停
      if (this.mixer) { this.mixer.stopAllAction(); this.mixer = null; }
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
        this._dropEquipmentSelection();
        this.exitingModel = this.model;
        this.exitingModel.userData.exitStart = performance.now();
        this.exitingModel.userData.exitScale = this.model.scale.clone();
        this.exitingModel.userData.exitPos = this.model.position.clone();
        this.exitingModel.userData.exitRot = this.model.rotation.clone();
      }
      this.scene.add(next);
      this._cancelViewReset();
      this.model = next;
      this._fit(this.model, true);
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
      this._applyDeviceStatuses();
      if (this._displayMode !== 'solid') this._applyDisplayMode(this.model);
      this._cb.onModelLoaded?.(file);
      if (!silent) this._cb.onNotice?.(`${file.name} 已载入`);
    } catch (err) {
      // 过期请求的 reject 不再提示；只有最新一次导入失败才通知用户。
      // 文案与表格导入共用 sheetErrorMessage，避免再写一份字符串。
      if (seq === this._importSeq) {
        this._cb.onNotice?.(sheetErrorMessage(err));
      }
    } finally {
      // 加载指示也只由最新请求收尾，避免过期请求提前关掉仍在进行的加载动画
      if (seq === this._importSeq) {
        this._cb.onLoading?.(false);
        this._cb.onLoadProgress?.(null);
      }
    }
  }

  _showDefault() {
    // 换模型先停巡检，且不把镜头缓回旧模型的机位；接下来的 _fit 才是新机位。
    this.stopTour({ restoreView: false });
    // 切回默认模型同样使在途的异步导入作废，防止其晚返回后覆盖默认场景
    this._importSeq++;
    this._cb.onLoading?.(false); // 作废在途导入时一并关闭它可能开启的加载遮罩，避免卡住
    this._cb.onLoadProgress?.(null);
    if (this.model) {
      this._dropEquipmentSelection();
      this.exitingModel = this.model;
      this.exitingModel.userData.exitStart = performance.now();
      this.exitingModel.userData.exitScale = this.model.scale.clone();
      this.exitingModel.userData.exitPos = this.model.position.clone();
      this.exitingModel.userData.exitRot = this.model.rotation.clone();
    }
    if (this.mixer) { this.mixer.stopAllAction(); this.mixer = null; }
    const nm = this._factory();
    this.scene.add(nm);
    this._cancelViewReset();
    this.model = nm;
    this._fit(this.model, true);
    this.model.userData.tScale = this.model.scale.clone();
    this.model.userData.tPos = this.model.position.clone();
    this.model.userData.tRot = this.model.rotation.clone();
    this.model.scale.setScalar(0.3);
    this.model.position.y = this.model.userData.tPos.y - 1.8;
    this.model.rotation.y = this.model.userData.tRot.y - 2.0;
    this.entranceStart = performance.now();
    this._resetPress();
    this._applyDeviceStatuses();
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
    this._userTakesCamera();
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

  _storeHomeFromCamera() {
    if (!this._homePosition) {
      this._homePosition = new THREE.Vector3();
      this._homeTarget = new THREE.Vector3();
    }
    this._homePosition.copy(this.camera.position);
    this._homeTarget.copy(this.control.target);
  }

  getHomeView() {
    if (!this._homePosition) return null;
    return {
      position: { x: this._homePosition.x, y: this._homePosition.y, z: this._homePosition.z },
      target: { x: this._homeTarget.x, y: this._homeTarget.y, z: this._homeTarget.z },
    };
  }

  _pointerHitsModel(event) {
    return this._raycastVisible(event.clientX, event.clientY) != null;
  }

  _cancelViewReset() {
    this._viewReset = null;
  }

  /** now 可注入，单测用它推进 680ms 动画，而不跑整条渲染循环。 */
  _applyViewReset(now = performance.now()) {
    if (!this._viewReset) return;
    const t = (now - this._viewReset.start) / this._viewReset.duration;
    const sample = sampleViewReset(
      this._viewReset.fromPos,
      this._viewReset.fromTarget,
      this._viewReset.toPos,
      this._viewReset.toTarget,
      t,
    );
    this.camera.position.set(sample.position.x, sample.position.y, sample.position.z);
    this.control.target.set(sample.target.x, sample.target.y, sample.target.z);
    this.camera.lookAt(this.control.target);
    this.control._sphericalDelta?.set(0, 0, 0);
    this.control._panOffset?.set(0, 0, 0);
    if (sample.done) this._viewReset = null;
    this._needsRender = true;
  }

  _onControlStart() {
    if (this._tour && (this._tour.phase === 'flying' || this._tour.phase === 'dwelling')) {
      this.pauseTour();
      return;
    }
    this._cancelViewReset();
  }

  _emitTour() {
    const tour = this._tour;
    this._cb.onTourChange?.(tour?.phase || 'idle', tour?.index || 0);
  }

  /**
   * @param {import('./tour.js').TourStop[]} stops
   * @param {{ dwellMs?: number }} [options]
   */
  startTour(stops, { dwellMs } = {}) {
    if (!this.camera || !this.control) return;
    const next = tourStart(createTour(stops, { dwellMs: dwellMs ?? 5000, flyMs: 1200 }), performance.now());
    if (next.phase === 'idle') return;
    if (!this._tour || this._tour.phase === 'idle') {
      this._tourSaved = {
        pos: { x: this.camera.position.x, y: this.camera.position.y, z: this.camera.position.z },
        target: { x: this.control.target.x, y: this.control.target.y, z: this.control.target.z },
        autoRotate: !!this.control.autoRotate,
      };
    }
    this.control.autoRotate = false;
    this._tour = next;
    const stop = next.stops[0];
    this._beginCameraTween(stop.position, stop.target, next.flyMs);
    this._emitTour();
  }

  pauseTour() {
    if (!this._tour || (this._tour.phase !== 'flying' && this._tour.phase !== 'dwelling')) return;
    this._tour = tourPause(this._tour, performance.now());
    this._cancelViewReset();
    this._emitTour();
  }

  resumeTour() {
    if (!this._tour || this._tour.phase !== 'paused') return;
    this._tour = tourResume(this._tour, performance.now());
    if (this._tour.phase === 'flying') {
      const stop = this._tour.stops[this._tour.index];
      const elapsed = performance.now() - this._tour.phaseStart;
      const remain = Math.max(1, this._tour.flyMs - elapsed);
      if (stop) this._beginCameraTween(stop.position, stop.target, remain);
    }
    this._emitTour();
  }

  /** restoreView 为 false 时只停状态，不把相机拉回巡检前的机位（双击归位自己决定终点）。 */
  stopTour({ restoreView = true } = {}) {
    if (!this._tour || this._tour.phase === 'idle') return;
    const saved = this._tourSaved;
    this._tour = tourStop(this._tour);
    this._tourSaved = null;
    if (this.control && saved) this.control.autoRotate = !!saved.autoRotate;
    // 只收起巡检弹出的卡片。用户自己点中的设备留给详情面板。
    if (this._tourOpenedCard) {
      this._tourOpenedCard = false;
      this._dispatchEquipmentSelect(null, true);
    }
    if (restoreView && saved && this.camera && this.control) {
      this._beginCameraTween(saved.pos, saved.target);
    }
    this._emitTour();
  }

  _dispatchEquipmentSelect(detail, fromTour = false) {
    this._selectionFromTour = fromTour;
    try {
      dispatch(EVENTS.EQUIPMENT_SELECT, detail);
    } finally {
      this._selectionFromTour = false;
    }
  }

  _syncTour(now) {
    const tour = this._tour;
    if (!tour || tour.phase === 'idle') return;
    const prevPhase = tour.phase;
    const prevIndex = tour.index;
    const { tour: next, event } = tourTick(tour, now);
    this._tour = next;
    if (event === 'arrive') {
      const stop = next.stops[next.index];
      if (stop?.equipmentId) {
        this._tourOpenedCard = true;
        this._dispatchEquipmentSelect({ id: stop.equipmentId }, true);
      }
    } else if (event === 'leave') {
      this._tourOpenedCard = false;
      this._dispatchEquipmentSelect(null, true);
      const stop = next.stops[next.index];
      if (stop) this._beginCameraTween(stop.position, stop.target, next.flyMs);
    }
    if (next.phase !== prevPhase || next.index !== prevIndex) this._emitTour();
  }

  _beginCameraTween(toPos, toTarget, duration = VIEW_RESET_MS) {
    if (!this.camera || !this.control || !toPos || !toTarget) return;
    this._viewReset = {
      fromPos: { x: this.camera.position.x, y: this.camera.position.y, z: this.camera.position.z },
      fromTarget: { x: this.control.target.x, y: this.control.target.y, z: this.control.target.z },
      toPos: { x: toPos.x, y: toPos.y, z: toPos.z },
      toTarget: { x: toTarget.x, y: toTarget.y, z: toTarget.z },
      start: performance.now(),
      duration,
    };
    this.control._sphericalDelta?.set(0, 0, 0);
    this.control._panOffset?.set(0, 0, 0);
    this._needsRender = true;
  }

  _beginViewReset() {
    if (!this._homePosition || !this.camera || !this.control) return;
    this._userTakesCamera();
    this._beginCameraTween(this._homePosition, this._homeTarget);
  }

  _tryViewReset(event) {
    if (!shouldResetViewOnDoubleActivate({ hitsModel: this._pointerHitsModel(event) })) return;
    this._beginViewReset();
  }

  _onDblClick(event) {
    if (event.button !== 0) return;
    this._tryViewReset(event);
  }

  _onViewResetPointerDown(event) {
    if (event.pointerType === 'touch') {
      this._touchIds.add(event.pointerId);
      if (this._touchIds.size > 1) {
        this._touchGesture = 'multi';
        // 第二指按下：捏合不能当作双击的前半下。
        this._lastTap = null;
        this._touchClickDouble = false;
      }
      if (this._touchGesture === 'multi') return;
      this._touchClickDouble = false;
    } else if (event.button !== 0 || (event.pointerType !== 'mouse' && event.pointerType !== 'pen')) {
      return;
    }
    this._pointerDown = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false, pointerType: event.pointerType };
  }

  _onViewResetPointerMove(event) {
    const down = this._pointerDown;
    if (!down || down.released || event.pointerId !== down.id) return;
    // 鼠标/笔只在主键按住时累计；触屏的按下状态就是这份尚未松开的记录。
    if (down.pointerType !== 'touch' && (event.buttons & 1) !== 1) return;
    if (Math.hypot(event.clientX - down.x, event.clientY - down.y) > VIEW_RESET_DOUBLE_TAP_PX) {
      down.moved = true;
    }
  }

  _onViewResetPointerUp(event) {
    const down = this._pointerDown;
    if (down && event.pointerId === down.id) down.released = true;
    if (event.pointerType !== 'touch') return;
    this._touchIds.delete(event.pointerId);
    if (this._touchGesture === 'multi') {
      if (down && event.pointerId === down.id) this._pointerDown = null;
      if (this._touchIds.size === 0) this._touchGesture = null;
      this._touchClickDouble = false;
      return;
    }
    if (!down || down.moved || Math.hypot(event.clientX - down.x, event.clientY - down.y) > VIEW_RESET_DOUBLE_TAP_PX) {
      this._lastTap = null;
      this._touchClickDouble = false;
      return;
    }
    const tap = { t: performance.now(), x: event.clientX, y: event.clientY };
    if (isViewResetDoubleTap(this._lastTap, tap)) {
      this._lastTap = null;
      this._touchClickDouble = true;
      this._tryViewReset(event);
    } else {
      this._lastTap = tap;
      this._touchClickDouble = false;
    }
  }

  _onViewResetPointerCancel(event) {
    if (this._pointerDown?.id === event.pointerId) this._pointerDown = null;
    if (event.pointerType !== 'touch') return;
    this._touchIds.delete(event.pointerId);
    this._lastTap = null;
    this._touchClickDouble = false;
    if (this._touchIds.size === 0) this._touchGesture = null;
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
    const key = typeof e.key === 'string' ? e.key.toLowerCase() : '';
    // T/S 与工具栏同一入口走 setView，R 走重置视角。F 仍切全屏；巡检中这四键都会停巡检。
    if (key === 't') this.setView('top');
    else if (key === 'f') {
      document.querySelector('.viewer-page')?.requestFullscreen?.();
      if (this._tour && this._tour.phase !== 'idle') this._userTakesCamera();
    }
    else if (key === 's') this.setView('side');
    else if (key === 'r') this._onReset();
    else if (key === 'l') {
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
      this._frame = null;
    } else {
      this._needsRender = true;
      this._scheduleFrame();
    }
  }

  /**
   * 幂等调度下一帧：先撤销在途帧再排新帧。
   * 主循环自调度、上下文恢复、页面重新可见都走这里，避免出现两条并行 RAF 主循环。
   */
  _scheduleFrame() {
    if (this._frame) cancelAnimationFrame(this._frame);
    this._frame = requestAnimationFrame(() => {
      this._frame = null;
      this._loop();
    });
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
    this._applyViewReset(frameNow);
    this._syncTour(frameNow);

    // 静态展示模式（display:'static'）冻结传送带/粒子等环境动画，让画面真正静止、可空闲省电；
    // dynamic / showcase 模式行为不变
    const envPaused = sc.display === 'static';

    // Conveyor animation。t 同时驱动机械臂，静态展示两边都不写。
    const convRef = envPaused ? null : this.model?.userData?.conveyor;
    const t = performance.now() * 0.001;
    if (convRef) {
      convRef.userData.rollers.forEach((c, i) => { c.rotation.x = t * 2 + i * 0.3; });
      // 货箱在创建时已收集，避免每帧 scene.traverse 全树
      (this.model.userData.crates || []).forEach((o) => {
        // 环长取 10 = 货箱数 5 × 间距 2，保证绕回处相邻货箱也是等距 2，避免末端挤堆
        o.position.x = -4.5 + ((t * 0.4 + (o.userData.crateOffset || 0)) % 10);
      });
    }
    if (!envPaused) (this.model?.userData?.robots || []).forEach((arm) => animateRobotArm(arm, t));

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

    // Manual sun position (driven by the 太阳环绕 dial; no time-based day/night cycle)
    {
      const az = (sc.sunAzimuth ?? 45) * Math.PI / 180;
      const el = (sc.sunElevation ?? 60) * Math.PI / 180;
      const r = 18;
      this.sun.position.set(Math.cos(el) * Math.sin(az) * r, Math.sin(el) * r, Math.cos(el) * Math.cos(az) * r);
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
      if (this._tour && this._tour.phase !== 'idle') {
        window._carouselTs = cn;
      } else if (!window._carouselTs) window._carouselTs = cn;
      else if (cn - window._carouselTs > (car.interval || 8) * 1000) {
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
    const hasAnim = this.mixer || this.entranceStart > 0 || this.exitingModel || (!envPaused && this.model?.userData?.conveyor) || (!envPaused && this.model?.userData?.robots?.length);
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
    this._scheduleFrame();
  }

  // ── Equipment pick & status ─────────────────────────────────────
  // 与轨道双击归位分开：这里只处理左键点击拾取和状态材质。

  setDeviceStatuses(map) {
    const source = map && typeof map === 'object' ? map : {};
    this._equipmentCatalog = Object.entries(source)
      .map(([id, value]) => normalizeStatusEntry(id, value))
      .filter((device) => device.id && statusColor(device.status));
    this._applyDeviceStatuses();
  }

  clearDeviceStatuses() {
    this._writeStatusFilter(null, { apply: false });
    restoreStatusMaterials(this.model);
    restoreStatusMaterials(this.exitingModel);
    this._equipmentCatalog = null;
    this._selectedEquipmentId = null;
    this._needsRender = true;
  }

  setEquipmentPickEnabled(enabled) {
    this._equipmentPickEnabled = !!enabled;
  }

  /** 最近的可见交点。隐藏节点（自身或祖先 visible === false）不命中。拾取复用此结果。 */
  raycastVisible(clientX, clientY) {
    return this._raycastVisible(clientX, clientY);
  }

  _bindEquipmentPick() {
    this._unbindEquipmentPick?.();
    const el = this.renderer?.domElement;
    if (!el) return;
    this._unbindEquipmentPick = bindEquipmentClickGuard(el, {
      pick: (event) => this._pickEquipmentId(event),
      onSelect: (id) => {
        if (this._equipmentPickEnabled === false) return;
        this._setEquipmentSelection(id);
        // 点中的是用户自己的设备。选中先落地，再停巡检，避免把这张卡清掉。
        if (id && this._tour && this._tour.phase !== 'idle') this._userTakesCamera();
      },
      isTouchDoubleTap: (down, event) => this._isTouchPickDoubleTap(down, event),
      wasDragged: () => {
        const down = this._pointerDown;
        if (!down) return false;
        const moved = down.moved === true;
        if (down.released) this._pointerDown = null;
        return moved;
      },
    });
    this._unsubEquipmentSelect?.();
    this._unsubEquipmentSelect = listen(EVENTS.EQUIPMENT_SELECT, this._onEquipmentSelect);
  }

  /**
   * 触屏 click.detail 恒为 1。双击只认 pointerup 写下的 _lastTap / _touchClickDouble，
   * 与归位共用 isViewResetDoubleTap，这里不再存第二份 {t,x,y}。
   */
  _isTouchPickDoubleTap(down) {
    if (down?.pointerType !== 'touch') return false;
    const doubleTap = this._touchClickDouble === true;
    this._touchClickDouble = false;
    return doubleTap;
  }

  _pickEquipmentId(event) {
    const hit = this._raycastVisible(event.clientX, event.clientY);
    return hit ? equipmentIdOf(hit.object) : null;
  }

  _raycastVisible(clientX, clientY) {
    const model = this.model;
    const el = this.renderer?.domElement;
    if (!model || !el || !this.camera) return null;
    const rect = el.getBoundingClientRect();
    if (!(rect.width > 0) || !(rect.height > 0)) return null;
    if (!this._equipRaycaster) {
      this._equipRaycaster = new THREE.Raycaster();
      this._equipPointer = new THREE.Vector2();
    }
    this._equipPointer.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    this._equipRaycaster.setFromCamera(this._equipPointer, this.camera);
    return firstVisibleHit(this._equipRaycaster.intersectObject(model, true));
  }

  _applyDeviceStatuses() {
    if (!this.model) return;
    if (this._equipmentCatalog) bindEquipmentIds(this.model, this._equipmentCatalog);
    paintEquipmentStatuses(this.model, this._equipmentCatalog || [], this._selectedEquipmentId, this._statusFilter);
    this._needsRender = true;
  }

  /**
   * 可见网格里 equipmentId 命中 id 的并集包围盒。
   * 取景方向和距离与 focusNode 相同。模型里没有这台设备时返回 null。
   */
  equipmentFrame(id) {
    const model = this.model;
    if (!model?.traverse || id == null || id === '') return null;
    const box = new THREE.Box3();
    let found = false;
    model.traverse((node) => {
      if (!node.isMesh || !isHierarchyVisible(node)) return;
      if (equipmentIdOf(node) !== id) return;
      const meshBox = new THREE.Box3().setFromObject(node);
      if (meshBox.isEmpty()) return;
      if (!found) box.copy(meshBox);
      else box.union(meshBox);
      found = true;
    });
    if (!found || box.isEmpty()) return null;
    const size = box.getSize(new THREE.Vector3());
    const target = box.getCenter(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const dist = maxDim * 2.5;
    const position = target.clone().addScaledVector(new THREE.Vector3(0.72, 0.52, 0.78).normalize(), dist);
    return { position, target };
  }

  /** 缓动到设备。模型里没有时返回 false，不改当前机位。 */
  focusEquipment(id) {
    const frame = this.equipmentFrame(id);
    if (!frame || !this.camera || !this.control) return false;
    const dist = frame.position.distanceTo(frame.target);
    this.camera.near = Math.max(0.01, dist / 1200);
    this.camera.far = Math.max(1000, dist * 80);
    this.camera.updateProjectionMatrix();
    this._userTakesCamera();
    this._beginCameraTween(frame.position, frame.target);
    return true;
  }

  /** 只高亮该状态；null 恢复全部。接着重刷设备色。 */
  setStatusFilter(status) {
    this._writeStatusFilter(status);
  }

  /**
   * 过滤只有这一处写入，并通知统计条。
   * 换模型时先清值再卸材质，不在旧模型上重刷。
   */
  _writeStatusFilter(status, { apply = true } = {}) {
    this._statusFilter = status == null ? null : status;
    if (apply) this._applyDeviceStatuses();
    dispatch(EVENTS.EQUIPMENT_STATUS_FILTER, this._statusFilter);
  }

  /** 换模型前恢复旧材质并清选择。状态表保留，新模型装上后再套色。过滤一起清掉。 */
  _dropEquipmentSelection() {
    this._writeStatusFilter(null, { apply: false });
    restoreStatusMaterials(this.model);
    this._selectedEquipmentId = null;
    dispatch(EVENTS.EQUIPMENT_SELECT, null);
  }

  _setEquipmentSelection(id) {
    const next = id || null;
    if (next === this._selectedEquipmentId) {
      dispatch(EVENTS.EQUIPMENT_SELECT, next ? { id: next } : null);
      return;
    }
    this._selectedEquipmentId = next;
    this._applyDeviceStatuses();
    dispatch(EVENTS.EQUIPMENT_SELECT, next ? { id: next } : null);
  }

  _onEquipmentSelect(event) {
    if (!this._selectionFromTour) this._tourOpenedCard = false;
    const id = event.detail?.id || null;
    if (id === this._selectedEquipmentId) return;
    this._selectedEquipmentId = id;
    this._applyDeviceStatuses();
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
      pressBounce: (active) => rt.pressBounce(active),
      getHomeView: () => rt.getHomeView(),
      setDeviceStatuses: (map) => rt.setDeviceStatuses(map),
      clearDeviceStatuses: () => rt.clearDeviceStatuses(),
      setEquipmentPickEnabled: (enabled) => rt.setEquipmentPickEnabled(enabled),
      equipmentFrame: (id) => rt.equipmentFrame(id),
      focusEquipment: (id) => rt.focusEquipment(id),
      startTour: (stops, options) => rt.startTour(stops, options),
      pauseTour: () => rt.pauseTour(),
      resumeTour: () => rt.resumeTour(),
      stopTour: () => rt.stopTour(),
      setStatusFilter: (status) => rt.setStatusFilter(status),
      raycastVisible: (clientX, clientY) => rt.raycastVisible(clientX, clientY),
      isHierarchyVisible: (object) => isHierarchyVisible(object),
    };
  }

  // ── Cleanup ─────────────────────────────────────────────────────

  dispose() {
    this.stopTour({ restoreView: false });
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
    this.renderer.domElement.removeEventListener('dblclick', this._onDblClick);
    this.renderer.domElement.removeEventListener('pointerdown', this._onViewResetPointerDown);
    this.renderer.domElement.removeEventListener('pointermove', this._onViewResetPointerMove);
    this.renderer.domElement.removeEventListener('pointerup', this._onViewResetPointerUp);
    this.renderer.domElement.removeEventListener('pointercancel', this._onViewResetPointerCancel);
    this._unbindEquipmentPick?.();
    this._unbindEquipmentPick = null;
    this._unsubEquipmentSelect?.();
    this._unsubEquipmentSelect = null;
    this.clearDeviceStatuses();
    this._observer?.disconnect();
    cancelAnimationFrame(this._frame);
    this._frame = null;
    if (this.exitingModel) {
      this._disposeObject(this.exitingModel);
      this.exitingModel = null;
    }
    this._disposeObject(this.model);
    this._envTarget?.dispose();
    this._envTarget = null;
    if (this.scene) this.scene.environment = null;
    this._pGeo?.dispose();
    this._pMat?.dispose();
    this.stereo?.dispose();
    this.control?.removeEventListener('start', this._onControlStart);
    this.control?.dispose();
    this.renderer.dispose();
    this._root.replaceChildren();
    // Clear globals
    window.__factorySceneRuntime = null;
  }
}
