import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const _up = new THREE.Vector3(0, 1, 0);
const _dir = new THREE.Vector3();
const _mid = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _matrix = new THREE.Matrix4();

function mergeParts(parts) {
  if (parts.length === 1) return parts[0];
  const merged = mergeGeometries(parts, false);
  parts.forEach((geometry) => geometry.dispose());
  if (!merged) throw new Error('part merge failed');
  return merged;
}

function place(geometry, x, y, z, rotY = 0) {
  if (rotY) geometry.rotateY(rotY);
  geometry.translate(x, y, z);
  return geometry;
}

/** I 形钢柱。底面在 y=0，已放到 (x, z)。 */
export function steelColumn(height, x, z, size = 0.32) {
  const flangeT = size * 0.16;
  const webT = size * 0.14;
  const flange = (side) => {
    const geometry = new THREE.BoxGeometry(size, height, flangeT);
    geometry.translate(0, height / 2, side * (size / 2 - flangeT / 2));
    return geometry;
  };
  const web = new THREE.BoxGeometry(webT, height, size - flangeT * 2);
  web.translate(0, height / 2, 0);
  const geometry = mergeParts([flange(-1), web, flange(1)]);
  geometry.translate(x, 0, z);
  return geometry;
}

/** 两端点之间的方管。几何中心在连线中点。 */
export function trussBeam(from, to, thickness = 0.07) {
  _dir.set(to[0] - from[0], to[1] - from[1], to[2] - from[2]);
  const length = Math.max(_dir.length(), 0.001);
  const geometry = new THREE.BoxGeometry(thickness, length, thickness);
  _mid.set((from[0] + to[0]) / 2, (from[1] + to[1]) / 2, (from[2] + to[2]) / 2);
  _quat.setFromUnitVectors(_up, _dir.normalize());
  _matrix.compose(_mid, _quat, new THREE.Vector3(1, 1, 1));
  geometry.applyMatrix4(_matrix);
  return geometry;
}

/** 墙板或体块。x/y/z 是几何中心。 */
export function wallPanel(width, height, depth, x, y, z) {
  return place(new THREE.BoxGeometry(width, height, depth), x, y, z);
}

/** 直爬梯。局部沿 Y，rotY 绕竖直轴，底面在 y=0。 */
export function ladder(height, x, z, rotY = 0) {
  const width = 0.42;
  const parts = [];
  for (const side of [-1, 1]) {
    const rail = new THREE.BoxGeometry(0.04, height, 0.04);
    rail.translate(side * width / 2, height / 2, 0);
    parts.push(rail);
  }
  const rungs = Math.max(4, Math.floor(height / 0.32));
  for (let i = 0; i < rungs; i++) {
    const rung = new THREE.BoxGeometry(width, 0.028, 0.028);
    rung.translate(0, 0.18 + i * ((height - 0.36) / rungs), 0);
    parts.push(rung);
  }
  return place(mergeParts(parts), x, 0, z, rotY);
}

/** 栏杆沿局部 X。y 是栏杆底（立柱落地的高度）。 */
export function railing(length, x, y, z, rotY = 0) {
  const postH = 0.9;
  const parts = [];
  const top = new THREE.BoxGeometry(length, 0.04, 0.04);
  top.translate(0, postH, 0);
  const mid = new THREE.BoxGeometry(length, 0.03, 0.03);
  mid.translate(0, postH * 0.5, 0);
  parts.push(top, mid);
  const count = Math.max(2, Math.round(length / 1.8) + 1);
  for (let i = 0; i < count; i++) {
    const px = -length / 2 + (count === 1 ? 0 : (length * i) / (count - 1));
    const post = new THREE.BoxGeometry(0.045, postH, 0.045);
    post.translate(px, postH / 2, 0);
    parts.push(post);
  }
  return place(mergeParts(parts), x, y, z, rotY);
}

/** 地坪漆分区。底面比混凝土地面高 0.001。 */
export function floorZone(width, depth, x, z) {
  const thickness = 0.003;
  const geometry = new THREE.BoxGeometry(width, thickness, depth);
  geometry.translate(x, 0.001 + thickness / 2, z);
  return geometry;
}

/** 地面标线。底面比混凝土地面高 0.005，配合材质 polygonOffset。 */
export function floorMarking(width, depth, x, z) {
  const thickness = 0.004;
  const geometry = new THREE.BoxGeometry(width, thickness, depth);
  geometry.translate(x, 0.005 + thickness / 2, z);
  return geometry;
}

/** 竖直圆柱。yBase 是底面高度。 */
export function uprightCylinder(radiusTop, radiusBottom, height, x, z, yBase = 0, segments = 10) {
  const geometry = new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments);
  geometry.translate(x, yBase + height / 2, z);
  return geometry;
}

export function treeTrunk(x, z) {
  const geometry = new THREE.CylinderGeometry(0.07, 0.11, 0.62, 6);
  geometry.translate(x, 0.31, z);
  return geometry;
}

export function treeCrown(x, z) {
  const geometry = new THREE.SphereGeometry(0.36, 8, 6);
  geometry.translate(x, 0.86, z);
  return geometry;
}
