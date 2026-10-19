/**
 * @vitest-environment happy-dom
 *
 * IndexedDB denied (privacy mode): the showcase shell still opens, shows a
 * fallback notice, and model sync does not surface an unhandled rejection.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const FALLBACK = '本地模型库不可用，已降级为本次会话';

function denyIndexedDb() {
  Object.defineProperty(window, 'indexedDB', {
    configurable: true,
    get() {
      throw new DOMException('indexedDB is unavailable', 'SecurityError');
    },
  });
}

function installStorage() {
  window.eval(readFileSync(resolve('public/model-library-storage.js'), 'utf8'));
}

describe('IndexedDB 不可用时展示页降级', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="app"></div>';
    localStorage.clear();
    delete window.__factoryStorageUnavailable;
    delete window.factoryModelStorage;
    window.history.replaceState({}, '', '/models');
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('no backend'))));
    vi.resetModules();
  });

  it('打开展示页就显示降级提示，导入模型不会变成未处理拒绝', async () => {
    const unhandled = [];
    const onUnhandled = (event) => {
      unhandled.push(event.reason);
      event.preventDefault();
    };
    window.addEventListener('unhandledrejection', onUnhandled);
    denyIndexedDb();
    installStorage();

    await import('../src/app.jsx');
    await vi.waitFor(() => {
      expect(document.body.textContent).toContain('模型库');
      expect(document.body.textContent).toContain(FALLBACK);
    });
    expect(document.querySelector('.storage-fallback')?.textContent).toBe(FALLBACK);
    expect(document.body.textContent).not.toContain('渲染异常');

    const file = new File([new Uint8Array([1, 2, 3, 4])], 'offline.glb', { type: 'model/gltf-binary' });
    window.dispatchEvent(new CustomEvent('factory-import', { detail: { file, silent: true } }));
    await window.factoryModelStorage.waitForSave('offline.glb');
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(unhandled).toEqual([]);
    expect(document.body.textContent).toContain(FALLBACK);

    window.factoryModelStorage.waitForSave = () => Promise.reject(new Error('idb down'));
    window.dispatchEvent(new CustomEvent('factory-import', { detail: { file, silent: true } }));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(unhandled).toEqual([]);
    expect(document.body.textContent).toContain(FALLBACK);
    window.removeEventListener('unhandledrejection', onUnhandled);
  });
});
