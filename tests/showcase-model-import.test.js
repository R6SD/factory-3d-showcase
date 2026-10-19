/**
 * @vitest-environment happy-dom
 *
 * Uses the real public/model-library-storage.js IndexedDB fallback (not a mocked listModels).
 * /api/models is absent, matching vite preview.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import 'fake-indexeddb/auto';

function installStorage() {
  const code = readFileSync(resolve('public/model-library-storage.js'), 'utf8');
  window.eval(code);
}

async function idbKeys() {
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open('factory-model-library', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('models');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return new Promise((resolve, reject) => {
    const request = db.transaction('models').objectStore('models').getAllKeys();
    request.onsuccess = () => resolve([...request.result]);
    request.onerror = () => reject(request.error);
  });
}

describe('展示端 /models 导入走真实 IndexedDB 模型库', () => {
  beforeEach(async () => {
    await new Promise((resolve) => {
      const request = indexedDB.deleteDatabase('factory-model-library');
      request.onsuccess = () => resolve();
      request.onerror = () => resolve();
      request.onblocked = () => resolve();
    });
    document.body.innerHTML = '<div id="app"></div>';
    localStorage.clear();
    window.history.replaceState({}, '', '/models');
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('no backend'))));
    installStorage();
  });

  it('导入后 listModels 读到该文件，并出现在模型库列表中', async () => {
    await import('../src/app.jsx');
    await vi.waitFor(() => {
      expect(document.body.textContent).toContain('还没有导入模型');
    });

    const file = new File([new Uint8Array([1, 2, 3, 4])], 'pump-line.glb', { type: 'model/gltf-binary' });
    window.dispatchEvent(new CustomEvent('factory-import', { detail: { file, silent: false } }));
    await window.factoryModelStorage.waitForSave('pump-line.glb');

    expect(await idbKeys()).toContain('pump-line.glb');
    const listed = await window.factoryModelStorage.listModels();
    expect(listed.map((item) => item.name)).toEqual(['pump-line.glb']);
    expect(listed[0].format).toBe('GLB');
    expect(listed[0].tag).toBe('本地导入');
    expect(listed[0].available).toBe(true);
    expect(typeof listed[0].size).toBe('number');

    await vi.waitFor(() => {
      expect(document.body.textContent).toContain('pump-line.glb');
    });
    const cards = [...document.querySelectorAll('.model-grid h3')].map((node) => node.textContent);
    expect(cards.filter((name) => name === 'pump-line.glb')).toHaveLength(1);
  });
});
