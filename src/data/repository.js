/**
 * repository.js — 业务数据访问层（单例）。
 * 同一套异步 API，两种可移植实现：
 *   - Electron 桌面端：本地 HTTP 后端 /api/data/business，落盘到 userData/business.json；
 *   - 纯浏览器 dev：回落 localStorage，保证 npm run dev 也能完整使用与持久化。
 * 页面/组件不直接感知数据从哪里来，后续接 MES/IoT/HR 只需替换本文件。
 */
import { createSeedBusiness, normalizeBusiness, BUSINESS_VERSION } from './seed.js';

const LOCAL_KEY = 'factory-business-v1';
const API = '/api/data/business';
const clone = (v) => JSON.parse(JSON.stringify(v));

class BusinessRepository {
  constructor() {
    this.data = null;
    this.source = 'local'; // 'backend' | 'local'
    this.listeners = new Set();
  }

  get ready() { return !!this.data; }
  getSource() { return this.source; }
  getData() { return this.data; }

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  _emit() {
    this.listeners.forEach((fn) => { try { fn(this.data); } catch { /* 监听异常不影响数据流 */ } });
  }

  async _httpGet() {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 2500);
    try {
      const r = await fetch(API, { headers: { Accept: 'application/json' }, signal: ctrl.signal });
      if (!r.ok) throw new Error(`status ${r.status}`);
      const txt = await r.text();
      return txt ? JSON.parse(txt) : null;
    } finally {
      clearTimeout(timer);
    }
  }

  _readLocal() {
    try { return JSON.parse(localStorage.getItem(LOCAL_KEY) || 'null'); } catch { return null; }
  }

  _writeLocal(d) {
    try { localStorage.setItem(LOCAL_KEY, JSON.stringify(d)); } catch { /* 配额/隐私模式忽略 */ }
  }

  /** 首次加载：探测后端，空库用种子初始化并回写一次 */
  async init() {
    if (this.data) return this.data;
    let remote = null;
    try {
      remote = await this._httpGet();
      this.source = 'backend';
    } catch {
      this.source = 'local';
      remote = this._readLocal();
    }
    const empty = !remote || !remote.capacity;
    this.data = normalizeBusiness(empty ? createSeedBusiness() : remote);
    if (empty) {
      if (this.source === 'backend') await this._persist(this.data).catch(() => {});
      else this._writeLocal(this.data);
    }
    return this.data;
  }

  async _persist(d) {
    if (this.source === 'backend') {
      const r = await fetch(API, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(d),
      });
      if (!r.ok) throw new Error(`persist status ${r.status}`);
    } else {
      this._writeLocal(d);
    }
  }

  /**
   * 保存。mutator 可为函数（基于当前数据返回新数据）或完整对象。
   * 统一规范化、打时间戳后持久化并通知订阅者。
   */
  async save(mutator) {
    const base = this.data || createSeedBusiness();
    const draft = typeof mutator === 'function' ? mutator(clone(base)) : mutator;
    const next = normalizeBusiness(draft);
    next.version = BUSINESS_VERSION;
    next.updatedAt = new Date().toISOString();
    await this._persist(next);
    this.data = next;
    this._emit();
    return next;
  }

  /** 重置为默认种子数据 */
  async reset() {
    return this.save(createSeedBusiness());
  }
}

export const businessRepository = new BusinessRepository();
