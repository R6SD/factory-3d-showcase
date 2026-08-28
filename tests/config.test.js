import { describe, it, expect, beforeEach } from 'vitest';

// 模拟 localStorage
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => store.has(k) ? store.get(k) : null,
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear(),
};

const defaults = { version: 4, language: 'zh', theme: 'dark', branding: { title: '工厂智能可视化', icon: '' }, viewer: { eyebrow: 'FACTORY DIGITAL TWIN', title: '场地总览', titleEn: 'Site Overview' }, nav: 'mini', models: [], onlineScene: { url: '', enabled: false }, scene: { environment: 'factory', display: 'standard', rotationSpeed: .3, exposure: 1, ambientIntensity: 1, sunIntensity: 1, shadowSoftness: 2, shadowQuality: 'high', fov: 35, dpr: 'auto', preset: 'balanced', grid: true, shadows: true, rotate: true, zoom: true, pan: true, sunCycle: true, sunAzimuth: 45, sunElevation: 60, sunManual: false }, carousel: { enabled: false, interval: 8, modelNames: [] } };

function load() {
  try {
    const data = JSON.parse(localStorage.getItem('factory-workbench-v4')) || JSON.parse(localStorage.getItem('factory-workbench-v3'));
    if (!data || ![3, 4].includes(data.version)) return defaults;
    const viewer = { ...defaults.viewer, ...data.viewer };
    if (viewer.title === '厂区三维工作台') viewer.title = defaults.viewer.title;
    if (viewer.titleEn === '3D Campus Workbench') viewer.titleEn = defaults.viewer.titleEn;
    return { ...defaults, ...data, version: 4, branding: { ...defaults.branding, ...data.branding }, viewer, scene: { ...defaults.scene, ...data.scene } };
  } catch { return defaults; }
}

describe('配置加载与迁移', () => {
  beforeEach(() => { store.clear(); });

  it('无存储时返回默认值', () => {
    const cfg = load();
    expect(cfg.version).toBe(4);
    expect(cfg.language).toBe('zh');
    expect(cfg.scene.fov).toBe(35);
  });

  it('加载 v4 配置', () => {
    store.set('factory-workbench-v4', JSON.stringify({ version: 4, language: 'en', scene: { fov: 50 } }));
    const cfg = load();
    expect(cfg.language).toBe('en');
    expect(cfg.scene.fov).toBe(50);
    expect(cfg.version).toBe(4);
  });

  it('v3 配置迁移到 v4', () => {
    store.set('factory-workbench-v3', JSON.stringify({ version: 3, language: 'en' }));
    const cfg = load();
    expect(cfg.version).toBe(4);
    expect(cfg.language).toBe('en');
  });

  it('旧标题自动迁移', () => {
    store.set('factory-workbench-v4', JSON.stringify({ version: 4, viewer: { title: '厂区三维工作台', titleEn: '3D Campus Workbench' } }));
    const cfg = load();
    expect(cfg.viewer.title).toBe('场地总览');
    expect(cfg.viewer.titleEn).toBe('Site Overview');
  });

  it('损坏的 JSON 返回默认值', () => {
    store.set('factory-workbench-v4', '{invalid json');
    const cfg = load();
    expect(cfg.version).toBe(4);
  });

  it('不支持的版本号返回默认值', () => {
    store.set('factory-workbench-v4', JSON.stringify({ version: 1 }));
    const cfg = load();
    expect(cfg.version).toBe(4);
  });

  it('scene 字段合并默认值', () => {
    store.set('factory-workbench-v4', JSON.stringify({ version: 4, scene: { fov: 60 } }));
    const cfg = load();
    expect(cfg.scene.fov).toBe(60);
    expect(cfg.scene.environment).toBe('factory'); // 保留默认
    expect(cfg.scene.grid).toBe(true);
  });
});
