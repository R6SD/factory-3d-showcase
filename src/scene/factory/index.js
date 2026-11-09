import * as THREE from 'three';
import { createBucket } from './bucket.js';
import { createMaterials } from './materials.js';
import { buildAssemblyLine, buildConveyor, buildMfgHall, buildPackArea, buildSilo } from './equipment.js';
import { AUX_BUILDING, DEVICE_LAYOUT, DEVICE_NAMES } from './layout.js';
import {
  floorMarking,
  floorZone,
  ladder,
  railing,
  steelColumn,
  treeCrown,
  treeTrunk,
  trussBeam,
  uprightCylinder,
  wallPanel,
} from './parts.js';

const EAVE = 5.05;
const RIDGE = 6.45;
const SPAN_Z = 6.05;
const FRAME_X = [-7.4, -3.7, 0, 3.7, 7.4];
const WALL_T = 0.16;

function addMeshes(parent, meshes) {
  for (const mesh of meshes) parent.add(mesh);
}

function addTruss(bucket, x) {
  const z0 = -SPAN_Z;
  const z1 = SPAN_Z;
  bucket.add('steel', trussBeam([x, EAVE, z0], [x, EAVE, z1], 0.08));
  bucket.add('steel', trussBeam([x, EAVE, z0], [x, RIDGE, 0], 0.07));
  bucket.add('steel', trussBeam([x, EAVE, z1], [x, RIDGE, 0], 0.07));
  bucket.add('steel', trussBeam([x, EAVE, 0], [x, RIDGE, 0], 0.06));
  for (const z of [-SPAN_Z / 2, SPAN_Z / 2]) {
    const yTop = EAVE + (RIDGE - EAVE) * (1 - Math.abs(z) / SPAN_Z);
    bucket.add('steel', trussBeam([x, EAVE, z], [x, yTop, z], 0.05));
  }
  bucket.add('steel', trussBeam([x, EAVE, z0], [x, EAVE + (RIDGE - EAVE) * 0.5, -SPAN_Z / 2], 0.045));
  bucket.add('steel', trussBeam([x, EAVE, -SPAN_Z / 2], [x, RIDGE, 0], 0.045));
  bucket.add('steel', trussBeam([x, EAVE, z1], [x, EAVE + (RIDGE - EAVE) * 0.5, SPAN_Z / 2], 0.045));
  bucket.add('steel', trussBeam([x, EAVE, SPAN_Z / 2], [x, RIDGE, 0], 0.045));
}

function addShell(root, materials) {
  const shell = createBucket(materials);
  for (const x of FRAME_X) {
    shell.add('steel', steelColumn(EAVE, x, -SPAN_Z));
    shell.add('steel', steelColumn(EAVE, x, SPAN_Z));
    addTruss(shell, x);
  }
  for (const z of [-SPAN_Z, -4.5, -3, -1.5, 0, 1.5, 3, 4.5, SPAN_Z]) {
    const y = EAVE + (RIDGE - EAVE) * (1 - Math.abs(z) / SPAN_Z) + 0.05;
    shell.add('steel', trussBeam([FRAME_X[0], y, z], [FRAME_X[FRAME_X.length - 1], y, z], 0.06));
  }
  shell.add('steel', ladder(4.85, -7.85, 1.8, Math.PI / 2));
  shell.add('steel', railing(15.4, 0, 1, 6.35));

  const wallX = 8.35;
  const wallZ = 6.35;
  shell.add('wall', wallPanel(WALL_T, EAVE, wallZ * 2 + WALL_T, -wallX, EAVE / 2, 0));
  shell.add('wall', wallPanel(wallX * 2 + WALL_T, EAVE, WALL_T, 0, EAVE / 2, -wallZ));
  shell.add('wall', wallPanel(WALL_T, 1, wallZ * 2 + WALL_T, wallX, 0.5, 0));
  shell.add('wall', wallPanel(wallX * 2 + WALL_T, 1, WALL_T, 0, 0.5, wallZ));

  const aux = AUX_BUILDING;
  shell.add('wall', wallPanel(aux.w, aux.h, aux.d, aux.x, aux.h / 2, aux.z));
  shell.add('paintBlue', wallPanel(aux.w + 0.12, 0.12, aux.d + 0.12, aux.x, aux.h + 0.06, aux.z));
  addMeshes(root, shell.build('shell'));

  const glass = createBucket(materials);
  for (const z of [-3.2, 0, 3.2]) {
    glass.add('glass', wallPanel(0.04, 1.2, 1.7, -7.98, 2.55, z));
  }
  for (const x of [-4.2, 0, 4.2]) {
    glass.add('glass', wallPanel(2.1, 1.2, 0.04, x, 2.55, -6.02));
  }
  addMeshes(root, glass.build('glass', { castShadow: false, receiveShadow: true }));

  const lights = createBucket(materials);
  for (const z of [-2.5, 0, 2.5]) {
    lights.add('lightStrip', wallPanel(11.5, 0.05, 0.22, 0, EAVE - 0.22, z));
  }
  addMeshes(root, lights.build('light', { castShadow: false, receiveShadow: true }));
}

function addGround(root, materials) {
  const ground = createBucket(materials);
  const slab = new THREE.BoxGeometry(18, 0.22, 14);
  slab.translate(0, -0.11, 0);
  ground.add('concrete', slab);
  const mfg = DEVICE_LAYOUT['eq-bldg-mfg'];
  const line = DEVICE_LAYOUT['eq-line-c'];
  const pack = DEVICE_LAYOUT['eq-bldg-pack'];
  ground.add('floorZoneA', floorZone(mfg.w + 0.7, mfg.d + 0.6, mfg.x, mfg.z));
  ground.add('floorZoneA', floorZone(2.8, 4.8, DEVICE_LAYOUT['eq-silo-a'].x, 0));
  ground.add('floorZoneB', floorZone(line.w + 0.7, line.d + 0.6, line.x, line.z));
  ground.add('floorZoneC', floorZone(pack.w + 0.6, pack.d + 0.6, pack.x, pack.z));
  addMeshes(root, ground.build('ground', { castShadow: false, receiveShadow: true }));

  const marks = createBucket(materials);
  for (let i = 0; i < 28; i++) {
    const x = -6.3 + i * 0.46;
    const key = i % 2 === 0 ? 'hazardYellow' : 'hazardBlack';
    marks.add(key, floorMarking(0.34, 0.28, x, 1.22));
    marks.add(key, floorMarking(0.34, 0.28, x, -1.22));
  }
  addMeshes(root, marks.build('mark', { castShadow: false, receiveShadow: true }));
}

function addEnvironment(root, materials) {
  const env = createBucket(materials);
  const postX = [];
  for (let x = -8.7; x <= 8.7 + 1e-6; x += 1.74) postX.push(Number(x.toFixed(4)));
  const postZ = [];
  for (let z = -6.75; z <= 6.75 + 1e-6; z += 1.6875) postZ.push(Number(z.toFixed(4)));
  for (const x of postX) {
    env.add('steel', uprightCylinder(0.04, 0.04, 0.85, x, -6.75, 0, 6));
    env.add('steel', uprightCylinder(0.04, 0.04, 0.85, x, 6.75, 0, 6));
  }
  for (const z of postZ) {
    if (z <= -6.75 + 0.01 || z >= 6.75 - 0.01) continue;
    env.add('steel', uprightCylinder(0.04, 0.04, 0.85, -8.7, z, 0, 6));
    env.add('steel', uprightCylinder(0.04, 0.04, 0.85, 8.7, z, 0, 6));
  }
  for (const z of [-6.75, 6.75]) {
    env.add('steel', trussBeam([-8.7, 0.55, z], [8.7, 0.55, z], 0.035));
    env.add('steel', trussBeam([-8.7, 0.78, z], [8.7, 0.78, z], 0.035));
  }
  for (const x of [-8.7, 8.7]) {
    env.add('steel', trussBeam([x, 0.55, -6.75], [x, 0.55, 6.75], 0.035));
    env.add('steel', trussBeam([x, 0.78, -6.75], [x, 0.78, 6.75], 0.035));
  }

  const poles = [
    [-6, 6.58], [-2, 6.58], [2, 6.58], [6, 6.58],
    [8.5, -4.2], [8.5, -1.2], [8.5, 1.8], [8.5, 4.6],
  ];
  poles.forEach(([x, z], index) => {
    env.add('steel', uprightCylinder(0.055, 0.07, 1.12, x, z, 0, 8));
    const lamp = index % 2 === 0 ? 'warnOrange' : 'warnYellow';
    env.add(lamp, uprightCylinder(0.09, 0.09, 0.16, x, z, 1.12, 8));
  });

  const trees = [[6.85, 5.15], [6.9, -5.45], [1.1, 5.25], [-1.6, 5.25], [0.2, -5.5], [-7.55, 5.15]];
  for (const [x, z] of trees) {
    env.add('trunk', treeTrunk(x, z));
    env.add('leaf', treeCrown(x, z));
  }

  env.add('stainless', trussBeam([-6.2, 3.35, -5.35], [6.2, 3.35, -5.35], 0.11));
  env.add('stainless', trussBeam([-6.2, 3.72, -5.35], [6.2, 3.72, -5.35], 0.09));
  for (const x of [-6.2, -3.1, 0, 3.1, 6.2]) {
    env.add('stainless', trussBeam([x, 0.05, -5.35], [x, 3.9, -5.35], 0.07));
    env.add('stainless', trussBeam([x, 3.52, -5.52], [x, 3.52, -5.18], 0.05));
  }

  addMeshes(root, env.build('env'));
}

function addCrates(root, materials) {
  const crates = [];
  for (let i = 0; i < 5; i++) {
    const crate = new THREE.Mesh(
      new THREE.BoxGeometry(0.62, 0.5, 0.62),
      i % 2 ? materials.crateAlt : materials.crate,
    );
    crate.name = `crate-${i}`;
    crate.position.set(-4.5 + i * 2, 0.58, 0);
    crate.castShadow = true;
    crate.receiveShadow = true;
    crate.userData.crate = true;
    crate.userData.crateOffset = i * 2;
    root.add(crate);
    crates.push(crate);
  }
  root.userData.crates = crates;
}

/** 默认厂房。供 SceneRuntime._factory 和设置页预览共用。 */
export function createFactoryModel() {
  const materials = createMaterials();
  const root = new THREE.Group();
  root.name = 'factory';
  addShell(root, materials);
  addGround(root, materials);
  addEnvironment(root, materials);
  const siloA = DEVICE_LAYOUT['eq-silo-a'];
  const siloB = DEVICE_LAYOUT['eq-silo-b'];
  root.add(buildSilo(materials, {
    id: 'eq-silo-a',
    name: DEVICE_NAMES['eq-silo-a'],
    radius: siloA.r,
    height: siloA.h,
    x: siloA.x,
    z: siloA.z,
  }));
  root.add(buildSilo(materials, {
    id: 'eq-silo-b',
    name: DEVICE_NAMES['eq-silo-b'],
    radius: siloB.r,
    height: siloB.h,
    x: siloB.x,
    z: siloB.z,
  }));
  const mfg = buildMfgHall(materials, DEVICE_LAYOUT['eq-bldg-mfg']);
  const line = buildAssemblyLine(materials, DEVICE_LAYOUT['eq-line-c']);
  root.add(mfg, line, buildPackArea(materials, DEVICE_LAYOUT['eq-bldg-pack']));
  const conveyorLayout = DEVICE_LAYOUT['eq-conveyor'];
  const conveyor = buildConveyor(materials, { length: conveyorLayout.length });
  conveyor.position.set(conveyorLayout.x, 0, conveyorLayout.z);
  root.add(conveyor);
  root.userData.conveyor = conveyor;
  addCrates(root, materials);
  root.userData.robots = [mfg.userData.robot, line.userData.robot];
  return root;
}
