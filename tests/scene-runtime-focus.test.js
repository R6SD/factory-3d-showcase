/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { SceneRuntime } from '../src/scene/SceneRuntime.js';

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
