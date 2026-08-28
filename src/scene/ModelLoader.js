import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';

/**
 * ModelLoader — 纯函数模块，解析 GLTF/GLB/FBX/OBJ 文件。
 * 只做格式解析 + 动画设置，不做缩放归一化（由调用方的 fit() 负责）。
 *
 * @param {File} file - 模型文件
 * @returns {Promise<{object: THREE.Object3D, mixer: THREE.AnimationMixer|null, format: string}>}
 */
export async function loadModelFile(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  const url = URL.createObjectURL(file);
  try {
    let object = null;
    let mixer = null;

    if (ext === 'glb' || ext === 'gltf') {
      const asset = await new GLTFLoader().loadAsync(url);
      object = asset.scene;
      if (asset.animations.length) {
        mixer = new THREE.AnimationMixer(object);
        asset.animations.forEach((x) => mixer.clipAction(x).play());
      }
    } else if (ext === 'fbx') {
      object = await new FBXLoader().loadAsync(url);
    } else if (ext === 'obj') {
      object = await new OBJLoader().loadAsync(url);
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
