import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';

/**
 * XHR 进度 → 0–100 的整数。不可计算或 total 为 0 时返回 null。
 * 未带 lengthComputable 的事件（只要 total > 0）仍按 loaded/total 计算。
 */
export function progressPercent(e) {
  if (!e || e.lengthComputable === false || !(e.total > 0)) return null;
  const n = Math.round((Number(e.loaded) / e.total) * 100);
  if (!Number.isFinite(n)) return null;
  return Math.min(100, Math.max(0, n));
}

/**
 * ModelLoader — 纯函数模块，解析 GLTF/GLB/FBX/OBJ 文件。
 * 只做格式解析 + 动画设置，不做缩放归一化（由调用方的 fit() 负责）。
 *
 * @param {File} file - 模型文件
 * @param {{ onProgress?: (percent: number|null) => void }} [options]
 * @returns {Promise<{object: THREE.Object3D, mixer: THREE.AnimationMixer|null, format: string}>}
 */
export async function loadModelFile(file, { onProgress } = {}) {
  const ext = file.name.split('.').pop().toLowerCase();
  const url = URL.createObjectURL(file);
  const onXhr = (e) => onProgress?.(progressPercent(e));
  try {
    let object = null;
    let mixer = null;

    if (ext === 'glb' || ext === 'gltf') {
      const asset = await new GLTFLoader().loadAsync(url, onXhr);
      object = asset.scene;
      if (asset.animations.length) {
        mixer = new THREE.AnimationMixer(object);
        asset.animations.forEach((x) => mixer.clipAction(x).play());
      }
    } else if (ext === 'fbx') {
      object = await new FBXLoader().loadAsync(url, onXhr);
    } else if (ext === 'obj') {
      object = await new OBJLoader().loadAsync(url, onXhr);
    } else {
      throw new Error(`unsupported format: ${ext}`);
    }

    return { object, mixer, format: ext };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** 从模型库按名称加载（通过 window.factoryModelStorage） */
export async function loadModelByName(name) {
  const storage = window.factoryModelStorage;
  if (!storage?.getModel) throw new Error('model storage not available');
  const file = await storage.getModel(name);
  if (!file) throw new Error(`model not found: ${name}`);
  return loadModelFile(file);
}
