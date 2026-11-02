/**
 * @vitest-environment happy-dom
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { AppHeader } from '../src/ui/AppHeader.jsx';

const baseConfig = {
  theme: 'dark',
  language: 'zh',
  branding: { title: '工厂智能可视化', icon: '' },
};

describe('顶栏铭牌（#50）', () => {
  let root;
  let host;

  function mount(config = baseConfig, routeLabel = '场地总览') {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    const render = (nextConfig, nextRoute = routeLabel) => {
      act(() => {
        root.render(createElement(AppHeader, {
          config: nextConfig,
          setConfig: () => {},
          routeLabel: nextRoute,
        }));
      });
    };
    render(config, routeLabel);
    return { render };
  }

  afterEach(() => {
    if (root) act(() => root.unmount());
    root = null;
    host?.remove();
    host = null;
  });

  it('文档中没有 Lucide Factory，无图标时不渲染 custom-brand-icon', () => {
    mount();
    expect(document.querySelector('.lucide-factory')).toBeNull();
    expect(document.querySelector('svg.lucide-factory')).toBeNull();
    expect(host.querySelectorAll('svg').length).toBe(1);
    expect(host.querySelector('.custom-brand-icon')).toBeNull();
    expect(host.querySelector('.plaque-title').textContent).toBe('工厂智能可视化');
    expect(host.querySelector('.route-chip').textContent).toBe('场地总览');
  });

  it('有 branding.icon 时才渲染 custom-brand-icon', () => {
    mount({
      ...baseConfig,
      branding: { title: '甲公司', icon: 'data:image/svg+xml,logo' },
    });
    const img = host.querySelector('.custom-brand-icon');
    expect(img).not.toBeNull();
    expect(img.getAttribute('src')).toBe('data:image/svg+xml,logo');
    expect(img.closest('.plaque')).not.toBeNull();
    expect(host.querySelector('.lucide-factory')).toBeNull();
  });

  it('plaque-title 等于 branding.title，改配置后更新', () => {
    const { render } = mount();
    expect(host.querySelector('.plaque-title').textContent).toBe(baseConfig.branding.title);
    render({ ...baseConfig, branding: { title: '新铭牌', icon: '' } });
    expect(host.querySelector('.plaque-title').textContent).toBe('新铭牌');
    expect(host.querySelector('.custom-brand-icon')).toBeNull();
  });

  it('按操作区宽度写下 --actions-w，窄屏铭牌据此让出时钟', () => {
    const orig = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function getBoundingClientRect() {
      if (this.classList?.contains('actions')) return new DOMRect(0, 0, 128.2, 32);
      return new DOMRect();
    };
    try {
      mount();
      expect(host.querySelector('.app-header').style.getPropertyValue('--actions-w')).toBe('129px');
    } finally {
      Element.prototype.getBoundingClientRect = orig;
    }
  });

  it('route-chip 显示当前路由文案', () => {
    mount(baseConfig, '模型库');
    expect(host.querySelector('.route-chip').textContent).toBe('模型库');
    expect(host.querySelector('.viewer-clock').getAttribute('aria-label')).toBe('模型库');
  });

  it('壳层不再引用 Lucide Factory，品牌图标不再命令式写 DOM', () => {
    const app = readFileSync(resolve('src/app.jsx'), 'utf8');
    expect(app).not.toContain('<Factory');
    expect(app).not.toMatch(/import \{[^}]*\bFactory\b/);
    const script = readFileSync(resolve('public/viewer-title-editor.js'), 'utf8');
    expect(script).not.toContain('updateBrandIcon');
    expect(script).not.toContain('installBrandIconEditor');
    expect(script).not.toContain('.brand');
    const css = readFileSync(resolve('src/style.css'), 'utf8');
    expect(css).not.toContain('drop-shadow(0 0 7px var(--accent))');
    const overrides = readFileSync(resolve('src/overrides.css'), 'utf8');
    expect(overrides).toContain('background:#12161c');
    expect(overrides).toContain('background:#e8eaed');
    expect(overrides).toContain('height:72px');
    expect(overrides).toContain('z-index:20');
    expect(overrides).toContain('grid-template-columns:1fr auto 1fr');
  });
});
