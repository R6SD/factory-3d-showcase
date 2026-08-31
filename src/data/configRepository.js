/**
 * 工作台配置访问层（单例）。
 * - Electron 桌面端：/api/config 由本地后端落盘到 userData/config.json（后台 /admin 编辑，展示端只读消费）；
 * - 纯浏览器 dev：回落 localStorage（scene-config.loadConfig），保证 npm run dev 仍可使用。
 * 展示端启动时用 init() 拉取后端配置覆盖本地缓存；任何 setConfig 都经 push() 同步回后端。
 */
import { mergeConfig } from '../scene/scene-config.js';

const API = '/api/config';

class ConfigRepository {
  constructor() {
    this.source = 'local'; // 'backend' | 'local'
  }

  /** 首次加载：探测后端配置；无后端或空库返回 null（调用方沿用本地/默认） */
  async init() {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 2500);
    try {
      const r = await fetch(API, { headers: { Accept: 'application/json' }, signal: ctrl.signal });
      if (!r.ok) throw new Error(`status ${r.status}`);
      const txt = await r.text();
      const remote = txt ? JSON.parse(txt) : null;
      this.source = 'backend';
      return remote ? mergeConfig(remote) : null;
    } catch {
      this.source = 'local';
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  /** 配置变更同步后端；localStorage 缓存仍由 Provider 同步写入，作为离线回落 */
  async push(config) {
    if (this.source !== 'backend' || !config) return;
    try {
      const r = await fetch(API, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      if (!r.ok) throw new Error(`status ${r.status}`);
    } catch {
      /* 后端瞬时不可用时保留本地缓存，不阻塞界面 */
    }
  }
}

export const configRepository = new ConfigRepository();
