/**
 * @vitest-environment happy-dom
 *
 * useAdminModelSync 只在 RootRoutes 挂一次。Admin 页不再订阅 factory-import，
 * 避免和展示端重复把同一模型写进配置。
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

describe('useAdminModelSync 只挂载一次', () => {
  it('AdminApp 不再调用，RootRoutes 调用一次', () => {
    const admin = readFileSync(resolve('src/ui/admin/AdminApp.jsx'), 'utf8');
    const app = readFileSync(resolve('src/app.jsx'), 'utf8');
    expect(admin).not.toContain('useAdminModelSync');
    expect(app.match(/useAdminModelSync\(\)/g)).toEqual([
      'useAdminModelSync()',
      'useAdminModelSync()',
    ]);
    expect(app).toContain('function RootRoutes(){useAdminModelSync()');
  });

  it('打开 /admin 时 factory-import 只有 RootRoutes 一个监听', async () => {
    const added = [];
    const orig = window.addEventListener.bind(window);
    window.addEventListener = (type, handler, options) => {
      if (type === 'factory-import') added.push(handler);
      return orig(type, handler, options);
    };
    document.body.innerHTML = '<div id="app"></div>';
    window.history.replaceState({}, '', '/admin');
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('no backend'))));

    await import('../src/app.jsx');
    await vi.waitFor(() => {
      expect(document.body.textContent).toContain('后端数据管理');
      expect(added).toHaveLength(1);
    });
  });
});
