/**
 * 工作台配置：默认值、加载与版本迁移。
 * 从 app.jsx 抽出为纯函数模块，供 React 层与单元测试共用，避免测试复制逻辑后与实现漂移。
 */

export const STORE_KEY = 'factory-workbench-v4';
export const LEGACY_STORE_KEY = 'factory-workbench-v3';

export const defaults = {
  version: 4,
  language: 'zh',
  theme: 'dark',
  branding: { title: '工厂智能可视化', icon: '' },
  viewer: { eyebrow: 'FACTORY DIGITAL TWIN', title: '场地总览', titleEn: 'Site Overview' },
  nav: 'mini',
  models: [],
  onlineScene: { url: 'https://my.spline.design/reactiveorb-0YMjzISSA6XeE4l5zIS0eyux/', enabled: false },
  scene: {
    environment: 'factory', display: 'standard', rotationSpeed: .3, exposure: 1,
    ambientIntensity: .6, sunIntensity: 1.4, shadowSoftness: .6, shadowQuality: 'high',
    fov: 35, dpr: 'auto', preset: 'balanced', grid: false, shadows: true,
    rotate: true, zoom: true, pan: true, sunCycle: false,
    sunAzimuth: 45, sunElevation: 60, sunManual: false,
    // 裸眼 3D：stereoMode=off 关闭 | parallax 运动视差(裸眼、单目无重影) | barrier 视差屏障 | sbs 并排立体 | anaglyph 红蓝立体
    stereoMode: 'parallax', parallaxStrength: .4, parallaxAuto: false,
  },
  carousel: { enabled: false, interval: 8, modelNames: [] },
};

/**
 * 读取本地配置并迁移到当前版本；任何损坏/不支持的数据都回退到默认值。
 * @param {Storage|undefined} storage 可注入的存储实现，默认全局 localStorage
 */
export function loadConfig(storage = (typeof localStorage !== 'undefined' ? localStorage : undefined)) {
  try {
    const raw = storage?.getItem(STORE_KEY) ?? storage?.getItem(LEGACY_STORE_KEY);
    const data = JSON.parse(raw);
    if (!data || ![3, 4].includes(data.version)) return defaults;
    const viewer = { ...defaults.viewer, ...data.viewer };
    // 旧版默认标题迁移为新标题
    if (viewer.title === '厂区三维工作台') viewer.title = defaults.viewer.title;
    if (viewer.titleEn === '3D Campus Workbench') viewer.titleEn = defaults.viewer.titleEn;
    return {
      ...defaults, ...data, version: 4,
      branding: { ...defaults.branding, ...data.branding },
      viewer,
      scene: { ...defaults.scene, ...data.scene },
    };
  } catch {
    return defaults;
  }
}
