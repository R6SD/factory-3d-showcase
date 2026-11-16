/**
 * @vitest-environment happy-dom
 */
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Ctx } from '../src/app-context.jsx';
import { DataProvider } from '../src/data/DataProvider.jsx';
import { defaults } from '../src/scene/scene-config.js';
import { viewerCopy } from '../src/ui/viewer-strings.js';

vi.mock('../src/scene/webgl-support.js', () => ({
  hasWebGL: vi.fn(() => false),
}));

vi.mock('../src/scene/SceneRuntime.js', () => ({
  SceneRuntime: vi.fn(function SceneRuntime() {
    this.dispose = vi.fn();
    this.updateConfig = vi.fn();
  }),
  createFactoryModel: vi.fn(),
}));

const { SceneRuntime } = await import('../src/scene/SceneRuntime.js');
const { Scene } = await import('../src/app.jsx');

describe('Scene 无 WebGL 降级', () => {
  let root;
  let host;

  afterEach(() => {
    if (root) act(() => root.unmount());
    root = null;
    host?.remove();
    host = null;
  });

  it('hasWebGL 为 false 时只渲染降级文案和两个入口，且不构造 SceneRuntime', () => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('no backend'))));
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    const t = {
      ...viewerCopy.zh,
      capacity: '产能看板',
      organization: '组织关系',
    };
    act(() => {
      root.render(createElement(
        DataProvider,
        null,
        createElement(
          Ctx.Provider,
          { value: { config: defaults, setConfig: () => {}, t } },
          createElement(MemoryRouter, null, createElement(Scene)),
        ),
      ));
    });

    expect(host.textContent).toContain('当前浏览器或显卡不支持 WebGL，三维视图不可用。');
    expect(host.textContent).toContain('开启硬件加速、更新显卡驱动，或换用最新版 Chrome / Edge');
    const links = [...host.querySelectorAll('a')].map((a) => ({
      href: a.getAttribute('href'),
      text: a.textContent,
    }));
    expect(links).toEqual([
      { href: '/capacity', text: '产能看板' },
      { href: '/organization', text: '组织关系' },
    ]);
    expect(host.querySelector('.view-actions')).toBeNull();
    expect(SceneRuntime).toHaveBeenCalledTimes(0);
  });
});
