import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { paintEquipmentStatuses } from '../src/scene/device-status.js';

describe('paintEquipmentStatuses 状态过滤', () => {
  it('filter 不匹配的网格 color 乘 0.3，匹配的套状态色；去掉 filter 后材质恢复且 clone 被 dispose', () => {
    const shared = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x000000, emissiveIntensity: 0 });
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const alarm = new THREE.Mesh(geo, shared);
    alarm.userData.equipmentId = 'eq-silo-a';
    const running = new THREE.Mesh(geo, shared);
    running.userData.equipmentId = 'eq-conveyor';
    const plain = new THREE.Mesh(geo, shared);
    const root = new THREE.Group();
    root.add(alarm, running, plain);
    const catalog = [
      { id: 'eq-silo-a', status: 'alarm' },
      { id: 'eq-conveyor', status: 'normal' },
    ];

    paintEquipmentStatuses(root, catalog, null, 'normal');

    const dimmed = shared.color.clone().multiplyScalar(0.3);
    expect(alarm.material).not.toBe(shared);
    expect(alarm.material.color.r).toBeCloseTo(dimmed.r, 5);
    expect(alarm.material.color.g).toBeCloseTo(dimmed.g, 5);
    expect(alarm.material.color.b).toBeCloseTo(dimmed.b, 5);
    expect(alarm.material.emissive.getHexString()).toBe('000000');
    expect(alarm.material.emissiveIntensity).toBe(0);
    expect(running.material.emissive.getHexString()).toBe('22c55e');
    expect(running.material.color.r).toBeCloseTo(shared.color.r, 5);
    expect(plain.material).toBe(shared);
    expect(shared.color.getHex()).toBe(0xffffff);

    const dimClone = alarm.material;
    let disposed = 0;
    dimClone.addEventListener('dispose', () => { disposed += 1; });
    paintEquipmentStatuses(root, catalog, null, null);
    expect(disposed).toBe(1);
    expect(alarm.material).not.toBe(dimClone);
    expect(alarm.material.emissive.getHexString()).toBe('f59e0b');
    expect(alarm.userData._statusOrig).toBe(shared);
    expect(running.material.emissive.getHexString()).toBe('22c55e');
    expect(plain.material).toBe(shared);
  });
});
