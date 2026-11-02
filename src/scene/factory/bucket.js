import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const _pos = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _scale = new THREE.Vector3();
const _euler = new THREE.Euler();
const _matrix = new THREE.Matrix4();

function readVector(value, x, y, z) {
  if (!value) return _pos.set(x, y, z);
  if (Array.isArray(value)) return _pos.set(value[0] || 0, value[1] || 0, value[2] || 0);
  return _pos.set(value.x || 0, value.y || 0, value.z || 0);
}

function applyTransform(geometry, transform) {
  readVector(transform.position, 0, 0, 0);
  const position = _pos.clone();
  const rotation = transform.rotation;
  if (Array.isArray(rotation)) _euler.set(rotation[0] || 0, rotation[1] || 0, rotation[2] || 0);
  else if (rotation) _euler.set(rotation.x || 0, rotation.y || 0, rotation.z || 0);
  else _euler.set(0, 0, 0);
  _quat.setFromEuler(_euler);
  readVector(transform.scale, 1, 1, 1);
  _scale.copy(_pos);
  _matrix.compose(position, _quat, _scale);
  geometry.applyMatrix4(_matrix);
}

/**
 * 按材质收集几何，build 时每种 matKey 合并成一个 Mesh。
 * 调用方把几何的所有权交给 bucket；合并后原几何会被 dispose。
 * 零件几何必须都带 index，或都不带，且属性集合一致。
 */
export function createBucket(materials) {
  const groups = new Map();

  return {
    add(matKey, geometry, transform) {
      if (!materials[matKey]) throw new Error(`Unknown material key: ${matKey}`);
      if (transform) applyTransform(geometry, transform);
      let list = groups.get(matKey);
      if (!list) {
        list = [];
        groups.set(matKey, list);
      }
      list.push(geometry);
    },

    build(name, { castShadow = true, receiveShadow = true } = {}) {
      const meshes = [];
      for (const [matKey, geometries] of groups) {
        if (geometries.length === 0) continue;
        let geometry = geometries[0];
        if (geometries.length > 1) {
          geometry = mergeGeometries(geometries, false);
          if (!geometry) throw new Error(`mergeGeometries failed for ${name}:${matKey}`);
          for (const source of geometries) source.dispose();
        }
        const mesh = new THREE.Mesh(geometry, materials[matKey]);
        mesh.name = `${name}:${matKey}`;
        mesh.castShadow = castShadow;
        mesh.receiveShadow = receiveShadow;
        meshes.push(mesh);
      }
      groups.clear();
      return meshes;
    },
  };
}
