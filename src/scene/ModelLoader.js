import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';

/**
 * XHR / 分片读取进度 → 0–100 的整数。不可计算或 total 为 0 时返回 null。
 * 未带 lengthComputable 的事件（只要 total > 0）仍按 loaded/total 计算。
 */
export function progressPercent(e) {
  if (!e || e.lengthComputable === false || !(e.total > 0)) return null;
  const n = Math.round((Number(e.loaded) / e.total) * 100);
  if (!Number.isFinite(n)) return null;
  return Math.min(100, Math.max(0, n));
}

/** 本地文件按此大小分片读取。blob: URL 的 XHR 会一次读完，报不出中间百分比。 */
export const MODEL_READ_CHUNK = 256 * 1024;

function yieldForPaint() {
  return new Promise((resolve) => {
    const hidden = typeof document !== 'undefined' && document.visibilityState === 'hidden';
    if (!hidden && typeof requestAnimationFrame === 'function') requestAnimationFrame(() => resolve());
    else setTimeout(resolve, 0);
  });
}

/**
 * 按 MODEL_READ_CHUNK 读取全部字节。百分比只来自已读字节 / file.size。
 * 读完整份文件之前不回报 100，调用方在解析前自行切到解析阶段。
 */
async function readModelBytes(file, onProgress) {
  const total = file.size;
  const out = new Uint8Array(total);
  let loaded = 0;
  let last = null;
  while (loaded < total) {
    const end = Math.min(loaded + MODEL_READ_CHUNK, total);
    const part = new Uint8Array(await file.slice(loaded, end).arrayBuffer());
    if (part.byteLength === 0) break;
    out.set(part, loaded);
    loaded += part.byteLength;
    if (!onProgress || loaded >= total) continue;
    const pct = progressPercent({ loaded, total, lengthComputable: true });
    if (pct == null || pct >= 100 || pct === last) continue;
    last = pct;
    onProgress(pct);
    await yieldForPaint();
  }
  return out.byteOffset === 0 && out.byteLength === out.buffer.byteLength
    ? out.buffer
    : out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength);
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
  const buffer = await readModelBytes(file, onProgress);
  // 字节已经读完。null 让遮罩从百分比换成「正在解析三维模型…」。
  // 先让出一帧，否则解析很快结束时这次文案会被和遮罩关闭批在同一次渲染里。
  onProgress?.(null);
  if (onProgress) await yieldForPaint();
  let object = null;
  let mixer = null;

  if (ext === 'glb' || ext === 'gltf') {
    const asset = await new GLTFLoader().parseAsync(buffer, '');
    object = asset.scene;
    if (asset.animations.length) {
      mixer = new THREE.AnimationMixer(object);
      asset.animations.forEach((x) => mixer.clipAction(x).play());
    }
  } else if (ext === 'fbx') {
    object = new FBXLoader().parse(buffer, '');
  } else if (ext === 'obj') {
    object = new OBJLoader().parse(new TextDecoder().decode(buffer));
  } else {
    throw new Error(`unsupported format: ${ext}`);
  }

  return { object, mixer, format: ext };
}

/** 从模型库按名称加载（通过 window.factoryModelStorage） */
export async function loadModelByName(name) {
  const storage = window.factoryModelStorage;
  if (!storage?.getModel) throw new Error('model storage not available');
  const file = await storage.getModel(name);
  if (!file) throw new Error(`model not found: ${name}`);
  return loadModelFile(file);
}
