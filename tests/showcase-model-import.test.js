/**
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('展示端 /models 导入后写入 config.models', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="app"></div>';
    localStorage.clear();
    window.history.replaceState({}, '', '/models');
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('no backend'))));
  });

  it('导入文件落盘后，模型出现在模型库列表中', async () => {
    const saved = [];
    window.factoryModelStorage = {
      waitForSave: vi.fn(() => Promise.resolve()),
      listModels: vi.fn(() => Promise.resolve(saved.slice())),
    };

    await import('../src/app.jsx');

    await vi.waitFor(() => {
      expect(window.factoryModelStorage.listModels).toHaveBeenCalled();
      expect(document.body.textContent).toContain('还没有导入模型');
    });

    saved.push({ name: 'pump-line.glb', format: 'GLB', size: 2048, tag: '本地导入', updated: '2026/10/19' });
    window.dispatchEvent(new CustomEvent('factory-import', {
      detail: { file: { name: 'pump-line.glb' }, silent: false },
    }));

    await vi.waitFor(() => {
      expect(document.body.textContent).toContain('pump-line.glb');
    });
    expect(window.factoryModelStorage.waitForSave).toHaveBeenCalledWith('pump-line.glb');
  });
});
