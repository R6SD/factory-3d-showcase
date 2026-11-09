import { describe, expect, it } from 'vitest';
import { createMaterials } from '../src/scene/factory/materials.js';
import { animateRobotArm, createRobotArm } from '../src/scene/factory/robot-arm.js';

function posedArm() {
  const arm = createRobotArm(createMaterials());
  arm.userData.phase = 0;
  return arm;
}

describe('animateRobotArm', () => {
  it('t=0 和 t=1 的关节角度不同，且落在设计范围内', () => {
    const arm = posedArm();
    animateRobotArm(arm, 0);
    const { base, shoulder, elbow } = arm.userData.joints;
    const at0 = [base.rotation.y, shoulder.rotation.z, elbow.rotation.z];
    animateRobotArm(arm, 1);
    const at1 = [base.rotation.y, shoulder.rotation.z, elbow.rotation.z];
    expect(at1[0]).not.toBeCloseTo(at0[0]);
    expect(at1[1]).not.toBeCloseTo(at0[1]);
    expect(at1[2]).not.toBeCloseTo(at0[2]);

    for (const t of [0, 0.4, 1, 2.2, 4.8, 9]) {
      animateRobotArm(arm, t);
      expect(base.rotation.y).toBeGreaterThanOrEqual(-0.6 - 1e-9);
      expect(base.rotation.y).toBeLessThanOrEqual(0.6 + 1e-9);
      expect(shoulder.rotation.z).toBeGreaterThanOrEqual(-0.65 - 1e-9);
      expect(shoulder.rotation.z).toBeLessThanOrEqual(-0.15 + 1e-9);
      expect(elbow.rotation.z).toBeGreaterThanOrEqual(0.6 - 1e-9);
      expect(elbow.rotation.z).toBeLessThanOrEqual(1.2 + 1e-9);
    }
  });

  it('只改关节 rotation，不改 position', () => {
    const arm = posedArm();
    const before = Object.values(arm.userData.joints).map((joint) => joint.position.clone());
    animateRobotArm(arm, 0);
    animateRobotArm(arm, 1.4);
    Object.values(arm.userData.joints).forEach((joint, index) => {
      expect(joint.position.distanceTo(before[index])).toBe(0);
    });
  });

  it('关节按 base > shoulder > elbow > wrist 嵌套，Mesh ≤5', () => {
    const arm = createRobotArm(createMaterials());
    const { base, shoulder, elbow, wrist } = arm.userData.joints;
    expect(shoulder.parent).toBe(base);
    expect(elbow.parent).toBe(shoulder);
    expect(wrist.parent).toBe(elbow);
    expect(base.parent).toBe(arm);
    let meshes = 0;
    arm.traverse((object) => { if (object.isMesh) meshes += 1; });
    expect(meshes).toBeLessThanOrEqual(5);
  });
});
