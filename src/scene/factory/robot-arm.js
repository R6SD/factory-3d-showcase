import * as THREE from 'three';
import { createBucket } from './bucket.js';

function addMeshes(parent, meshes) {
  for (const mesh of meshes) parent.add(mesh);
}

/**
 * 关节 Group 嵌套：base(绕 y) > shoulder(绕 z) > elbow(绕 z) > wrist。
 * 连杆涂装黄色，关节外壳用钢色，每台最多 5 个 Mesh。
 */
export function createRobotArm(materials, { scale = 1 } = {}) {
  const arm = new THREE.Group();
  arm.name = 'robot-arm';
  arm.scale.setScalar(scale);

  const base = new THREE.Group();
  const shoulder = new THREE.Group();
  const elbow = new THREE.Group();
  const wrist = new THREE.Group();
  base.name = 'robot-base';
  shoulder.name = 'robot-shoulder';
  elbow.name = 'robot-elbow';
  wrist.name = 'robot-wrist';

  arm.add(base);
  base.add(shoulder);
  shoulder.add(elbow);
  elbow.add(wrist);
  shoulder.position.set(0, 0.42, 0);
  elbow.position.set(0, 0.56, 0);
  wrist.position.set(0, 0.46, 0);

  const baseBucket = createBucket(materials);
  const foot = new THREE.CylinderGeometry(0.28, 0.32, 0.08, 16);
  foot.translate(0, 0.04, 0);
  baseBucket.add('steel', foot);
  const waist = new THREE.CylinderGeometry(0.13, 0.15, 0.36, 16);
  waist.translate(0, 0.24, 0);
  baseBucket.add('steel', waist);
  addMeshes(base, baseBucket.build('robot-base'));

  const shoulderBucket = createBucket(materials);
  shoulderBucket.add('steel', new THREE.SphereGeometry(0.12, 14, 12));
  addMeshes(shoulder, shoulderBucket.build('robot-shoulder'));

  const upperBucket = createBucket(materials);
  const upper = new THREE.BoxGeometry(0.12, 0.58, 0.12);
  upper.translate(0, 0.3, 0);
  upperBucket.add('paintYellow', upper);
  const upperCap = new THREE.CylinderGeometry(0.07, 0.07, 0.14, 12);
  upperCap.rotateZ(Math.PI / 2);
  upperCap.translate(0, 0.56, 0);
  upperBucket.add('paintYellow', upperCap);
  addMeshes(shoulder, upperBucket.build('robot-upper'));

  const foreBucket = createBucket(materials);
  foreBucket.add('paintYellow', new THREE.SphereGeometry(0.09, 12, 10));
  const forearm = new THREE.BoxGeometry(0.1, 0.48, 0.1);
  forearm.translate(0, 0.24, 0);
  foreBucket.add('paintYellow', forearm);
  addMeshes(elbow, foreBucket.build('robot-fore'));

  const wristBucket = createBucket(materials);
  const hub = new THREE.CylinderGeometry(0.055, 0.055, 0.1, 12);
  hub.rotateZ(Math.PI / 2);
  wristBucket.add('steel', hub);
  const jawA = new THREE.BoxGeometry(0.03, 0.14, 0.045);
  jawA.translate(0.045, 0.08, 0);
  const jawB = new THREE.BoxGeometry(0.03, 0.14, 0.045);
  jawB.translate(-0.045, 0.08, 0);
  wristBucket.add('steel', jawA);
  wristBucket.add('steel', jawB);
  addMeshes(wrist, wristBucket.build('robot-wrist'));

  arm.userData.joints = { base, shoulder, elbow, wrist };
  arm.userData.phase = 0;
  animateRobotArm(arm, 0);
  return arm;
}

/** 只写关节 rotation。phase 取 arm.userData.phase，两台机械臂错开。 */
export function animateRobotArm(arm, t) {
  const phase = arm.userData.phase || 0;
  const { base, shoulder, elbow } = arm.userData.joints;
  base.rotation.y = 0.6 * Math.sin(t * 0.5 + phase);
  shoulder.rotation.z = -0.4 + 0.25 * Math.sin(t * 0.8 + phase);
  elbow.rotation.z = 0.9 + 0.3 * Math.sin(t * 1.1 + phase);
}
