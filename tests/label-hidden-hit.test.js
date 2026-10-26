/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import * as THREE from 'three';
import { firstVisibleHit } from '../src/scene/device-status.js';

const LABEL_STORE = 'factory-model-floating-labels-v4';
const script = fs.readFileSync(path.join(process.cwd(), 'public/model-label-editor.js'), 'utf8');

function mountScene() {
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
  camera.position.set(0, 1, 6);
  camera.lookAt(0, 1, 0);
  camera.updateMatrixWorld(true);

  const model = new THREE.Group();
  const outer = new THREE.Group();
  const inner = new THREE.Group();
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshBasicMaterial());
  mesh.position.set(0, 1, 0);
  inner.add(mesh);
  outer.add(inner);
  model.add(outer);
  model.updateMatrixWorld(true);

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const rect = { left: 0, top: 0, width: 200, height: 200 };
  window.__factorySceneRuntime = {
    THREE,
    camera,
    getModel: () => model,
    raycastVisible(clientX, clientY) {
      pointer.set(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(pointer, camera);
      return firstVisibleHit(raycaster.intersectObject(model, true));
    },
  };
  document.body.innerHTML = '<div class="viewer"></div>';
  localStorage.removeItem(LABEL_STORE);
  localStorage.removeItem('factory-active-model');
  window.fetch = () => Promise.resolve({ ok: false, headers: { get: () => null }, json: async () => [] });
  new Function(script)();
  return { mesh, outer, viewer: document.querySelector('.viewer') };
}

function rightClick(viewer) {
  viewer.dispatchEvent(new MouseEvent('contextmenu', {
    bubbles: true,
    cancelable: true,
    clientX: 100,
    clientY: 100,
    button: 2,
  }));
}

function savedCount() {
  return JSON.parse(localStorage.getItem(LABEL_STORE) || '[]').length;
}

afterEach(() => {
  document.body.innerHTML = '';
  delete window.__factorySceneRuntime;
  localStorage.removeItem(LABEL_STORE);
});

describe('右键标注与可见命中', () => {
  it('可见表面右键仍会生成标签', () => {
    const { viewer } = mountScene();
    rightClick(viewer);
    expect(document.querySelectorAll('.model-map-pin')).toHaveLength(1);
    expect(savedCount()).toBe(1);
  });

  it('直接隐藏部件之后，在原来的位置右键不生成标签', () => {
    const { mesh, viewer } = mountScene();
    mesh.visible = false;
    rightClick(viewer);
    expect(document.querySelectorAll('.model-map-pin')).toHaveLength(0);
    expect(savedCount()).toBe(0);
  });

  it('隐藏祖先组之后，在原来的位置右键不生成标签', () => {
    const { outer, viewer } = mountScene();
    outer.visible = false;
    rightClick(viewer);
    expect(document.querySelectorAll('.model-map-pin')).toHaveLength(0);
    expect(savedCount()).toBe(0);
  });
});
