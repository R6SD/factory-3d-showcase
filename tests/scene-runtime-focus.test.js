/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { SceneRuntime, createFactoryModel } from '../src/scene/SceneRuntime.js';

function frameRuntime() {
  const rt = Object.create(SceneRuntime.prototype);
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(2, 4, 2),
    new THREE.MeshStandardMaterial({ color: 0x336699 }),
  );
  mesh.position.set(3, 2, -1);
  mesh.userData.equipmentId = 'eq-silo-b';
  const hidden = new THREE.Mesh(new THREE.BoxGeometry(8, 8, 8), new THREE.MeshStandardMaterial());
  hidden.position.set(20, 0, 0);
  hidden.userData.equipmentId = 'eq-hidden';
  hidden.visible = false;
  const model = new THREE.Group();
  model.add(mesh, hidden);
  rt.model = model;
  rt.camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
  rt.camera.position.set(12, 8, 14);
  rt.control = {
    target: new THREE.Vector3(0, 1, 0),
    _sphericalDelta: { set() {} },
    _panOffset: { set() {} },
  };
  rt._needsRender = false;
  rt._viewReset = null;
  rt._statusFilter = null;
  rt._selectedEquipmentId = null;
  rt._equipmentCatalog = null;
  return { rt, mesh };
}

function loopStub(model, display) {
  const rt = Object.create(SceneRuntime.prototype);
  rt.model = model;
  rt._sceneConfig = { display, sunAzimuth: 45, sunElevation: 60 };
  rt._lastFrameTime = performance.now();
  rt.mixer = null;
  rt.control = { update() {} };
  rt._viewReset = null;
  rt.entranceStart = 0;
  rt.exitingModel = null;
  rt._press = { current: 0, target: 0, velocity: 0 };
  rt._pressActive = false;
  rt._baseCameraZoom = 1;
  rt._baseModelScale = new THREE.Vector3(1, 1, 1);
  rt.camera = {
    zoom: 1,
    updateProjectionMatrix() {},
    position: new THREE.Vector3(),
    quaternion: new THREE.Quaternion(),
  };
  rt.sun = { position: { set() {} } };
  rt._pCount = 0;
  rt._pGeo = { attributes: { position: { array: new Float32Array(0), needsUpdate: false } } };
  rt._pSpeed = new Float32Array(0);
  rt._frameCount = 0;
  rt._lastFpsTime = performance.now();
  rt._currentFps = 0;
  rt._parallax = { enabled: false, targetX: 0, targetY: 0, curX: 0, curY: 0, strength: 0, auto: false };
  rt._renderedFrames = 0;
  rt._skippedFrames = 0;
  rt._needsRender = false;
  rt.stereo = null;
  rt.renderer = {
    shadowMap: {},
    render() {},
    info: { render: { calls: 0, triangles: 0 } },
  };
  rt._scheduleFrame = () => {};
  window.__carouselConfig = { enabled: false };
  return rt;
}

function jointSnapshot(model) {
  return model.userData.robots.map((arm) => {
    const { base, shoulder, elbow } = arm.userData.joints;
    return [base.rotation.y, shoulder.rotation.z, elbow.rotation.z];
  });
}

describe('SceneRuntime 机械臂动画', () => {
  it('static 模式下不持续渲染，两帧之间机械臂角度不变', () => {
    const model = createFactoryModel();
    const rt = loopStub(model, 'static');
    const before = jointSnapshot(model);
    const now = vi.spyOn(performance, 'now');
    now.mockReturnValue(1_000);
    rt._lastFrameTime = 1_000;
    rt._loop();
    now.mockReturnValue(2_400);
    rt._loop();
    now.mockRestore();
    expect(rt._renderedFrames).toBe(0);
    expect(rt._skippedFrames).toBe(2);
    expect(jointSnapshot(model)).toEqual(before);
  });

  it('非 static 时机械臂角度会变，并且因为有动画而提交渲染', () => {
    const model = createFactoryModel();
    const rt = loopStub(model, 'standard');
    const before = jointSnapshot(model);
    const now = vi.spyOn(performance, 'now');
    now.mockReturnValue(1_500);
    rt._lastFrameTime = 1_000;
    rt._loop();
    now.mockRestore();
    expect(rt._renderedFrames).toBe(1);
    expect(jointSnapshot(model)).not.toEqual(before);
  });
});

describe('SceneRuntime 设备取景与状态过滤', () => {
  it('equipmentFrame 的 target 是可见设备包围盒中心，未知或隐藏 id 返回 null', () => {
    const { rt, mesh } = frameRuntime();
    const center = new THREE.Box3().setFromObject(mesh).getCenter(new THREE.Vector3());
    const frame = rt.equipmentFrame('eq-silo-b');
    expect(frame).not.toBeNull();
    expect(frame.target.x).toBeCloseTo(center.x, 5);
    expect(frame.target.y).toBeCloseTo(center.y, 5);
    expect(frame.target.z).toBeCloseTo(center.z, 5);
    expect(rt.equipmentFrame('missing')).toBeNull();
    expect(rt.equipmentFrame('eq-hidden')).toBeNull();
  });

  it('focusEquipment 把缓动终点写到设备中心', () => {
    const { rt, mesh } = frameRuntime();
    const center = new THREE.Box3().setFromObject(mesh).getCenter(new THREE.Vector3());
    expect(rt.focusEquipment('eq-silo-b')).toBe(true);
    expect(rt._viewReset.toTarget.x).toBeCloseTo(center.x, 5);
    expect(rt._viewReset.toTarget.y).toBeCloseTo(center.y, 5);
    expect(rt._viewReset.toTarget.z).toBeCloseTo(center.z, 5);
    expect(rt.focusEquipment('missing')).toBe(false);
  });

  it('换模型后 _statusFilter 为 null', () => {
    const { rt } = frameRuntime();
    rt._importSeq = 0;
    rt._cb = { onLoading() {} };
    rt._factory = () => new THREE.Group();
    rt.scene = { add() {} };
    rt._fit = () => {};
    rt._resetPress = () => {};
    rt._applyDeviceStatuses = () => {};
    rt._displayMode = 'solid';
    rt.mixer = null;
    rt._cancelViewReset = () => { rt._viewReset = null; };
    rt._statusFilter = 'alarm';
    rt._showDefault();
    expect(rt._statusFilter).toBeNull();

    rt._statusFilter = 'down';
    rt.clearDeviceStatuses();
    expect(rt._statusFilter).toBeNull();
  });
});
