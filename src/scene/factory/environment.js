import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

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
