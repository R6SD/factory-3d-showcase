/**
 * @vitest-environment happy-dom
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { Ctx } from '../src/app-context.jsx';
import {
  BRAND_DB,
  BRAND_MAX_BYTES,
  BRAND_UNAVAILABLE,
  assertBrandImage,
  deleteBrandAsset,
  getBrandAsset,
  putBrandAsset,
} from '../src/data/brand-assets.js';
import { AppHeader } from '../src/ui/AppHeader.jsx';
import { BrandFields } from '../src/ui/BrandIconField.jsx';
import { themeBgShell, useBrandUrls } from '../src/ui/useBrandUrls.js';

const t = {
  appTitle: '大标题',
  appTitleHint: '顶栏居中铭牌主标题；留空不推荐。',
  brandLogo: '公司 Logo（可选）',
  brandLogoHint: '有图贴在大标题左侧',
  titleBg: '标题背景',
  titleBgHint: '仅顶栏',
  themeBg: '主题背景',
  themeBgHint: '壳层',
  clearImage: '清除图片',
  brandAssetTooLarge: '图片超过 2MB，请压缩后重试',
  brandAssetBadType: '仅支持 PNG / JPG / WEBP',
  brandAssetMissing: '本机无此图片，请重新上传',
  theme: '主题',
  themeDark: '深色',
  themeLight: '浅色',
};

function resetDb() {
  return new Promise((resolve) => {
    const request = indexedDB.deleteDatabase(BRAND_DB);
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
    request.onblocked = () => resolve();
  });
}

describe('assertBrandImage', () => {
  it('拒绝超过 2MB 和非 PNG/JPG/WEBP', () => {
    expect(assertBrandImage({ name: 'a.png', type: 'image/png', size: BRAND_MAX_BYTES })).toEqual({ ok: true });
    expect(assertBrandImage({ name: 'a.jpg', type: 'image/jpeg', size: 10 })).toEqual({ ok: true });
    expect(assertBrandImage({ name: 'a.webp', type: 'image/webp', size: 10 })).toEqual({ ok: true });
    expect(assertBrandImage({ name: 'big.png', type: 'image/png', size: BRAND_MAX_BYTES + 1 }).code).toBe('tooLarge');
    expect(assertBrandImage({ name: 'a.svg', type: 'image/svg+xml', size: 10 }).code).toBe('badType');
    expect(assertBrandImage({ name: 'a.gif', type: 'image/gif', size: 10 }).code).toBe('badType');
  });
});

describe('brand-assets IndexedDB', () => {
  beforeEach(async () => {
    delete window.__factoryBrandStorageUnavailable;
    await resetDb();
  });

  it('put 与 get 字节一致，delete 后为 null，两个槽互不影响', async () => {
    const title = new Uint8Array([1, 2, 3, 4, 5]);
    const theme = new Uint8Array([9, 8, 7]);
    await putBrandAsset('titleBg', new Blob([title], { type: 'image/png' }));
    await putBrandAsset('themeBg', new Blob([theme], { type: 'image/webp' }));
    expect(new Uint8Array(await (await getBrandAsset('titleBg')).arrayBuffer())).toEqual(title);
    await deleteBrandAsset('titleBg');
    expect(await getBrandAsset('titleBg')).toBeNull();
    expect(new Uint8Array(await (await getBrandAsset('themeBg')).arrayBuffer())).toEqual(theme);
  });

  it('两个槽同时写入后都能读回', async () => {
    const title = new Uint8Array([1, 2, 3]);
    const theme = new Uint8Array([4, 5, 6]);
    await Promise.all([
      putBrandAsset('titleBg', new Blob([title], { type: 'image/png' })),
      putBrandAsset('themeBg', new Blob([theme], { type: 'image/webp' })),
    ]);
    expect(new Uint8Array(await (await getBrandAsset('titleBg')).arrayBuffer())).toEqual(title);
    expect(new Uint8Array(await (await getBrandAsset('themeBg')).arrayBuffer())).toEqual(theme);
  });

  it('IndexedDB 打不开时提示本地素材库不可用', async () => {
    const seen = [];
    const onEvent = (event) => seen.push(event.detail);
    window.addEventListener('factory-brand-storage-unavailable', onEvent);
    vi.stubGlobal('indexedDB', {
      open() {
        throw new DOMException('indexedDB is unavailable', 'SecurityError');
      },
    });
    try {
      await expect(putBrandAsset('themeBg', new Blob(['x']))).rejects.toBeTruthy();
      expect(seen).toContain(BRAND_UNAVAILABLE);
      expect(window.__factoryBrandStorageUnavailable).toBe(BRAND_UNAVAILABLE);
    } finally {
      window.removeEventListener('factory-brand-storage-unavailable', onEvent);
      vi.unstubAllGlobals();
    }
  });
});

describe('标题背景与主题背景挂到壳层', () => {
  let root;
  let host;

  beforeEach(async () => {
    delete window.__factoryBrandStorageUnavailable;
    await resetDb();
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(() => {
    if (root) act(() => root.unmount());
    host?.remove();
  });

  function render(node) {
    act(() => { root.render(node); });
  }

  it('titleBg 从 IndexedDB 解析后 header 带变量，清空后移除', async () => {
    await putBrandAsset('titleBg', new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }));
    const base = {
      theme: 'dark',
      language: 'zh',
      branding: {
        title: '甲',
        icon: '',
        titleBg: { store: 'idb', key: 'titleBg', name: 't.png', type: 'image/png', size: 3 },
        themeBg: null,
      },
    };
    const draw = (config) => render(createElement(AppHeader, { config, setConfig: () => {}, routeLabel: '场地总览' }));
    draw(base);
    await vi.waitFor(() => {
      const header = host.querySelector('.app-header');
      expect(header.classList.contains('has-title-bg')).toBe(true);
      expect(header.style.getPropertyValue('--title-bg')).toContain('blob:');
    });
    draw({ ...base, branding: { ...base.branding, titleBg: null } });
    await vi.waitFor(() => {
      const header = host.querySelector('.app-header');
      expect(header.classList.contains('has-title-bg')).toBe(false);
      expect(header.style.getPropertyValue('--title-bg')).toBe('');
    });
  });

  it('themeBg 写在 .app 上，不写到 .three 的 background', async () => {
    await putBrandAsset('themeBg', new Blob([new Uint8Array([4, 5, 6])], { type: 'image/jpeg' }));
    function Probe({ branding }) {
      const urls = useBrandUrls(branding);
      const shell = themeBgShell(urls.themeBgUrl);
      return createElement('div', { className: `app${shell.className}`, style: shell.style },
        createElement('div', { className: 'viewer' },
          createElement('div', { className: 'three' })));
    }
    render(createElement(Probe, {
      branding: {
        icon: '',
        titleBg: null,
        themeBg: { store: 'idb', key: 'themeBg', name: 'm.jpg', type: 'image/jpeg', size: 3 },
      },
    }));
    await vi.waitFor(() => {
      const app = host.querySelector('.app');
      expect(app.classList.contains('has-theme-bg')).toBe(true);
      expect(app.style.getPropertyValue('--theme-bg')).toContain('blob:');
    });
    const three = host.querySelector('.three');
    expect(three.getAttribute('style')).toBeNull();
    expect(three.style.background).toBe('');
    expect(three.style.backgroundImage).toBe('');
    const css = readFileSync(resolve('src/overrides.css'), 'utf8');
    expect(css).not.toMatch(/\.three[^{]*\{[^}]*var\(--theme-bg\)/);
    expect(css).not.toMatch(/\.viewer \.three\{[^}]*var\(--theme-bg\)/);
  });
});

describe('品牌设置槽位', () => {
  let root;
  let host;
  let config;

  beforeEach(async () => {
    delete window.__factoryBrandStorageUnavailable;
    await resetDb();
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    config = {
      theme: 'dark',
      language: 'zh',
      branding: { title: '工厂智能可视化', icon: '', titleBg: null, themeBg: null },
    };
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(() => {
    if (root) act(() => root.unmount());
    host?.remove();
  });

  function draw(setConfig) {
    act(() => {
      root.render(createElement(Ctx.Provider, { value: { config, setConfig, t } }, createElement(BrandFields)));
    });
  }

  it('超过 2MB 的标题背景不写入配置', async () => {
    const setConfig = vi.fn();
    draw(setConfig);
    const input = host.querySelector('input[data-slot="titleBg"]');
    const file = new File([new Uint8Array([1, 2, 3, 4])], 'big.png', { type: 'image/png' });
    Object.defineProperty(file, 'size', { value: BRAND_MAX_BYTES + 1 });
    await act(async () => {
      Object.defineProperty(input, 'files', { configurable: true, value: [file] });
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(host.textContent).toContain(t.brandAssetTooLarge);
    expect(setConfig).not.toHaveBeenCalled();
    expect(await getBrandAsset('titleBg')).toBeNull();
  });

  it('本机没有对应 blob 时显示缺失，且不崩溃', async () => {
    config = {
      ...config,
      branding: {
        title: '甲',
        icon: '',
        titleBg: { store: 'idb', key: 'titleBg', name: 'gone.png', type: 'image/png', size: 4 },
        themeBg: { store: 'idb', key: 'themeBg', name: 'gone.jpg', type: 'image/jpeg', size: 4 },
      },
    };
    draw(() => {});
    await vi.waitFor(() => {
      expect(host.textContent).toContain(t.brandAssetMissing);
    });
    expect(host.textContent.match(new RegExp(t.brandAssetMissing, 'g'))).toHaveLength(2);
  });
});

describe('品牌文案', () => {
  it('中英文键齐全，README 不再用旧的品牌图标说法', () => {
    const src = readFileSync(resolve('src/app.jsx'), 'utf8');
    const keys = [
      'appTitle', 'appTitleHint', 'brandLogo', 'brandLogoHint', 'titleBg', 'titleBgHint',
      'themeBg', 'themeBgHint', 'clearImage', 'brandAssetTooLarge', 'brandAssetBadType',
      'brandAssetMissing', 'themeDark', 'themeLight', 'exportHint',
    ];
    for (const key of keys) {
      const found = src.match(new RegExp(`${key}:'`, 'g')) || [];
      expect(found.length, key).toBeGreaterThanOrEqual(2);
    }
    expect(src).toContain('标题背景与主题背景保存在本机 IndexedDB，导出 JSON 不含图片像素；换浏览器需重新上传。');
    expect(src).toContain('Title/theme backgrounds live in IndexedDB; export JSON has metadata only—re-upload after switching browsers.');
    const readme = readFileSync(resolve('README.md'), 'utf8');
    expect(readme).toContain('品牌与外观（大标题 / 可选 Logo / 标题背景 / 主题背景）');
    expect(readme).toContain('背景图存本机 IndexedDB；导出配置不含像素。');
    expect(readme).not.toContain('品牌图标上传');
    expect(readme).not.toContain('顶部 Factory');
    expect(readme).not.toContain('仅品牌图标');
  });
});
