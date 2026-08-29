import { describe, it, expect } from 'vitest';
import { defaults, loadConfig, STORE_KEY } from '../src/scene/scene-config.js';

// 内存版 Storage，避免依赖全局 localStorage
function memoryStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    _throw() { throw new Error('storage unavailable'); },
  };
}

describe('scene-config 默认值契约', () => {
  it('锁定关键场景默认值，防止实现与文档/测试漂移', () => {
    // 这些值曾在“复制式测试”中与真实 defaults 漂移（sunCycle/softness/intensity）
    expect(defaults.scene.fov).toBe(35);
    expect(defaults.scene.environment).toBe('factory');
    expect(defaults.scene.grid).toBe(false); // 默认不显示参考网格线（地面保留承接阴影）
    expect(defaults.scene.sunCycle).toBe(false);
    expect(defaults.scene.shadowSoftness).toBeCloseTo(0.6, 5);
    // 阴影柔化滑块 step=0.2，默认值必须落在步进网格上，否则手柄会被浏览器量化到别的值
    expect(defaults.scene.shadowSoftness / 0.2).toBeCloseTo(Math.round(defaults.scene.shadowSoftness / 0.2), 5);
    expect(defaults.scene.ambientIntensity).toBeCloseTo(0.6, 5);
    expect(defaults.scene.sunIntensity).toBeCloseTo(1.4, 5);
    expect(defaults.version).toBe(4);
  });
});

describe('loadConfig', () => {
  it('无存储时返回默认值（node 环境无 localStorage 也不抛错）', () => {
    expect(loadConfig(undefined)).toEqual(defaults);
  });

  it('存储损坏（非法 JSON）时回退默认值', () => {
    const storage = memoryStorage({ [STORE_KEY]: '{not-json' });
    expect(loadConfig(storage)).toEqual(defaults);
  });

  it('存储读取抛异常时回退默认值', () => {
    const broken = { getItem() { throw new Error('blocked'); } };
    expect(loadConfig(broken)).toEqual(defaults);
  });

  it('不支持的版本号回退默认值，不与未知数据合并', () => {
    const storage = memoryStorage({ [STORE_KEY]: JSON.stringify({ version: 99, scene: { fov: 99 } }) });
    expect(loadConfig(storage)).toEqual(defaults);
  });

  it('v4 数据缺字段时用默认值补齐 scene 子项', () => {
    const storage = memoryStorage({ [STORE_KEY]: JSON.stringify({ version: 4, scene: { fov: 50 } }) });
    const cfg = loadConfig(storage);
    expect(cfg.scene.fov).toBe(50);                 // 用户值保留
    expect(cfg.scene.environment).toBe('factory');  // 缺失项补默认
    expect(cfg.scene.sunCycle).toBe(false);
  });

  it('迁移旧版默认标题为新标题（中/英）', () => {
    const storage = memoryStorage({
      [STORE_KEY]: JSON.stringify({
        version: 3,
        viewer: { title: '厂区三维工作台', titleEn: '3D Campus Workbench' },
      }),
    });
    const cfg = loadConfig(storage);
    expect(cfg.viewer.title).toBe(defaults.viewer.title);
    expect(cfg.viewer.titleEn).toBe(defaults.viewer.titleEn);
  });

  it('用户自定义标题不被迁移逻辑覆盖', () => {
    const storage = memoryStorage({
      [STORE_KEY]: JSON.stringify({ version: 4, viewer: { title: '我的厂区', titleEn: 'My Plant' } }),
    });
    const cfg = loadConfig(storage);
    expect(cfg.viewer.title).toBe('我的厂区');
    expect(cfg.viewer.titleEn).toBe('My Plant');
  });
});
