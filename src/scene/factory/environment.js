import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

/** 设置页预览与主场景一样强制纯黑，不让页面渐变从透明画布透出来。 */
export function applyPreviewBackground(scene, renderer) {
  scene.background = new THREE.Color(0x000000);
  renderer.setClearColor(0x000000, 1);
}

/**
 * RoomEnvironment 烘成 PMREM，供 scene.environment 做间接光。
 * 返回的 RenderTarget 由调用方在 dispose 和上下文恢复时释放。
 */
export function createEnvironmentMap(renderer) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const rt = pmrem.fromScene(room, 0.04);
  pmrem.dispose();
  room.traverse((obj) => {
    obj.geometry?.dispose();
    if (!obj.material) return;
    const list = Array.isArray(obj.material) ? obj.material : [obj.material];
    list.forEach((material) => material.dispose());
  });
  return rt;
}
