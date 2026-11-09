import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { createBucket } from './bucket.js';
import { DEVICE_NAMES } from './layout.js';
import { ladder, railing, uprightCylinder, wallPanel } from './parts.js';
import { animateRobotArm, createRobotArm } from './robot-arm.js';

const CNC_SEGMENTS = 16;
const BENCH_SEGMENTS = 12;

function addMeshes(parent, meshes) {
  for (const mesh of meshes) parent.add(mesh);
}

function tagEquipment(group, id) {
  group.name = DEVICE_NAMES[id];
  group.userData.equipmentId = id;
}

/** RoundedBoxGeometry 在分段大于 0 时是非索引几何，bucket 要求同一批要么都有 index。 */
function ensureIndex(geometry) {
  if (geometry.index) return geometry;
  const count = geometry.getAttribute('position').count;
  const ArrayType = count > 65535 ? Uint32Array : Uint16Array;
  const index = new ArrayType(count);
  for (let i = 0; i < count; i++) index[i] = i;
  geometry.setIndex(new THREE.BufferAttribute(index, 1));
  geometry.clearGroups();
  return geometry;
}

function addRounded(bucket, matKey, width, height, depth, x, y, z, segments, radius) {
  const geometry = ensureIndex(new RoundedBoxGeometry(width, height, depth, segments, radius));
  geometry.translate(x, y, z);
  bucket.add(matKey, geometry);
}

/** 朝东南开口的外壳：北墙、西墙、低矮的东南墙和后半屋顶。相机在 +X/+Z，室内设备露在开口里。 */
function addCutawayShell(bucket, { w, d, h }) {
  const t = 0.08;
  const west = -w / 2;
  const east = w / 2;
  const north = -d / 2;
  const south = d / 2;
  bucket.add('wall', wallPanel(w, h, t, 0, h / 2, north + t / 2));
  bucket.add('wall', wallPanel(t, h, d, west + t / 2, h / 2, 0));
  bucket.add('wall', wallPanel(t, h * 0.28, d, east - t / 2, h * 0.14, 0));
  bucket.add('wall', wallPanel(w, h * 0.28, t, 0, h * 0.14, south - t / 2));
  for (const [x, z] of [
    [west + 0.07, north + 0.07],
    [east - 0.07, north + 0.07],
    [west + 0.07, south - 0.07],
    [east - 0.07, south - 0.07],
  ]) {
    bucket.add('wall', wallPanel(0.1, h, 0.1, x, h / 2, z));
  }
  const roof = new THREE.BoxGeometry(w * 0.62 + 0.08, 0.1, d * 0.62 + 0.08);
  roof.translate(-w * 0.16, h + 0.05, -d * 0.16);
  bucket.add('paintBlue', roof);
}

function mountRobot(group, materials, { phase, x, z, yaw, scale = 1 }) {
  const arm = createRobotArm(materials, { scale });
  arm.userData.phase = phase;
  arm.position.set(x, 0, z);
  arm.rotation.y = yaw;
  animateRobotArm(arm, 0);
  group.add(arm);
  group.userData.robot = arm;
}

/** 筒体(48 段) + 锥底 + 支腿 + 爬梯护笼 + 顶部平台栏杆。静态部分 3 个 Mesh。 */
export function buildSilo(materials, { id, name, radius, height, x, z }) {
  const group = new THREE.Group();
  group.name = name;
  group.userData.equipmentId = id;
  group.position.set(x, 0, z);

  const legH = height * 0.22;
  const coneH = height * 0.26;
  const bodyH = height - legH - coneH;
  const bodyBase = legH + coneH;
  const bodyTop = bodyBase + bodyH;
  const bucket = createBucket(materials);

  const body = new THREE.CylinderGeometry(radius, radius, bodyH, 48);
  body.translate(0, bodyBase + bodyH / 2, 0);
  bucket.add('stainless', body);
  const cap = new THREE.SphereGeometry(radius, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2);
  cap.translate(0, bodyTop, 0);
  bucket.add('stainless', cap);

  const lip = new THREE.CylinderGeometry(radius * 1.05, radius * 1.05, 0.08, 48);
  lip.translate(0, bodyTop, 0);
  bucket.add('paintBlue', lip);

  const cone = new THREE.CylinderGeometry(radius, radius * 0.28, coneH, 48);
  cone.translate(0, legH + coneH / 2, 0);
  bucket.add('steel', cone);
  for (let i = 0; i < 4; i++) {
    const angle = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const lx = Math.cos(angle) * radius * 0.62;
    const lz = Math.sin(angle) * radius * 0.62;
    bucket.add('steel', uprightCylinder(0.055, 0.075, legH, lx, lz, 0, 8));
    const foot = new THREE.BoxGeometry(0.2, 0.04, 0.2);
    foot.translate(lx, 0.02, lz);
    bucket.add('steel', foot);
  }
  const ladderX = radius + 0.16;
  bucket.add('steel', ladder(bodyTop, ladderX, 0, 0));
  for (let i = 0; i < 4; i++) {
    const ring = new THREE.TorusGeometry(0.26, 0.012, 6, 14);
    ring.rotateX(Math.PI / 2);
    ring.translate(ladderX, bodyBase + bodyH * (0.22 + i * 0.2), 0);
    bucket.add('steel', ring);
  }
  for (const side of [-1, 1]) {
    const bar = new THREE.BoxGeometry(0.02, bodyH * 0.85, 0.02);
    bar.translate(ladderX + side * 0.22, bodyBase + bodyH * 0.48, 0.16);
    bucket.add('steel', bar);
  }
  const deck = new THREE.BoxGeometry(0.55, 0.05, 0.7);
  deck.translate(ladderX, bodyTop, 0);
  bucket.add('steel', deck);
  bucket.add('steel', railing(0.85, ladderX, bodyTop, 0));

  addMeshes(group, bucket.build(id));
  return group;
}

/** 机架、皮带、护栏、急停盒合成 2 个 Mesh，滚筒单独 6 根并共享不锈钢。 */
export function buildConveyor(materials, { length = 12.5 } = {}) {
  const group = new THREE.Group();
  tagEquipment(group, 'eq-conveyor');
  const bucket = createBucket(materials);
  for (const z of [-0.82, 0.82]) {
    bucket.add('steel', wallPanel(length, 0.14, 0.08, 0, 0.4, z));
    bucket.add('steel', wallPanel(length, 0.26, 0.025, 0, 0.62, z));
  }
  for (let i = 0; i < 5; i++) {
    const x = -5 + i * 2.5;
    for (const z of [-0.72, 0.72]) {
      bucket.add('steel', wallPanel(0.08, 0.36, 0.08, x, 0.18, z));
    }
    bucket.add('steel', wallPanel(0.08, 0.06, 1.36, x, 0.1, 0));
  }
  const stop = new THREE.BoxGeometry(0.16, 0.22, 0.12);
  stop.translate(length / 2 - 0.45, 0.78, 0.98);
  bucket.add('steel', stop);
  const button = new THREE.CylinderGeometry(0.04, 0.04, 0.03, 12);
  button.rotateX(Math.PI / 2);
  button.translate(length / 2 - 0.45, 0.78, 1.05);
  bucket.add('steel', button);
  bucket.add('rubber', wallPanel(length - 0.2, 0.05, 1.42, 0, 0.3, 0));
  addMeshes(group, bucket.build('eq-conveyor'));

  const rollers = [];
  for (let i = 0; i < 6; i++) {
    const roller = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.09, 1.5, 16),
      materials.stainless,
    );
    roller.name = `eq-conveyor:roller-${i}`;
    roller.position.set(-5 + i * 2, 0.16, 0);
    roller.rotation.z = Math.PI / 2;
    roller.castShadow = true;
    roller.receiveShadow = true;
    roller.userData.roller = true;
    group.add(roller);
    rollers.push(roller);
  }
  group.userData.rollers = rollers;
  return group;
}

/** T1 外壳 + CNC×2（床身 / 防护罩 / 控制面板）+ 机械臂。 */
export function buildMfgHall(materials, layout) {
  const group = new THREE.Group();
  tagEquipment(group, 'eq-bldg-mfg');
  group.position.set(layout.x, 0, layout.z);
  const bucket = createBucket(materials);
  addCutawayShell(bucket, layout);
  for (const x of [-0.95, 0.9]) {
    addRounded(bucket, 'steel', 1.15, 0.46, 0.72, x, 0.32, -0.28, CNC_SEGMENTS, 0.08);
    addRounded(bucket, 'paintBlue', 1.02, 0.56, 0.6, x, 0.78, -0.28, CNC_SEGMENTS, 0.07);
    const panel = new THREE.BoxGeometry(0.22, 0.48, 0.16);
    panel.translate(x + 0.42, 0.55, 0.16);
    bucket.add('steel', panel);
  }
  addMeshes(group, bucket.build('eq-bldg-mfg'));
  mountRobot(group, materials, { phase: 0, x: 0.05, z: 0.82, yaw: Math.PI / 2, scale: 1 });
  return group;
}

/** 外壳 + 装配工位×3（工作台、工具架、灯）+ 机械臂。 */
export function buildAssemblyLine(materials, layout) {
  const group = new THREE.Group();
  tagEquipment(group, 'eq-line-c');
  group.position.set(layout.x, 0, layout.z);
  const bucket = createBucket(materials);
  addCutawayShell(bucket, layout);
  for (const x of [-1.05, 0, 1.05]) {
    bucket.add('wall', wallPanel(0.08, 0.72, 0.08, x - 0.32, 0.36, 0.85));
    bucket.add('wall', wallPanel(0.08, 0.72, 0.08, x + 0.32, 0.36, 0.85));
    addRounded(bucket, 'paintBlue', 0.86, 0.1, 0.58, x, 0.78, 0.85, BENCH_SEGMENTS, 0.04);
    bucket.add('paintBlue', wallPanel(0.34, 0.7, 0.08, x + 0.36, 1.15, 0.55));
    for (const peg of [0.95, 1.15, 1.35]) {
      const tool = new THREE.BoxGeometry(0.16, 0.035, 0.035);
      tool.translate(x + 0.28, peg, 0.62);
      bucket.add('paintBlue', tool);
    }
    bucket.add('lightStrip', wallPanel(0.7, 0.045, 0.16, x, 2.35, 0.85));
  }
  addMeshes(group, bucket.build('eq-line-c'));
  mountRobot(group, materials, { phase: 1.7, x: -0.15, z: -0.35, yaw: -Math.PI / 2, scale: 1 });
  return group;
}

/** 外壳 + 码垛托盘×4 堆 + 货架 2 排。 */
export function buildPackArea(materials, layout) {
  const group = new THREE.Group();
  tagEquipment(group, 'eq-bldg-pack');
  group.position.set(layout.x, 0, layout.z);
  const bucket = createBucket(materials);
  addCutawayShell(bucket, layout);
  for (const z of [-0.95, -0.45]) {
    for (const x of [-0.85, 0, 0.85]) {
      bucket.add('steel', wallPanel(0.06, 1.55, 0.06, x, 0.78, z));
    }
    for (const y of [0.45, 0.9, 1.35]) {
      bucket.add('steel', wallPanel(1.9, 0.04, 0.42, 0, y, z));
    }
  }
  for (const [x, z] of [[-0.62, 0.55], [0.22, 0.55], [-0.62, 1.02], [0.22, 1.02]]) {
    bucket.add('crate', wallPanel(0.5, 0.08, 0.5, x, 0.08, z));
    bucket.add('crate', wallPanel(0.42, 0.28, 0.42, x, 0.26, z));
    bucket.add('crate', wallPanel(0.38, 0.24, 0.38, x, 0.52, z));
  }
  addMeshes(group, bucket.build('eq-bldg-pack'));
  return group;
}
