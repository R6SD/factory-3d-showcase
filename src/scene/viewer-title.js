// 三维工作台“居中标题”显示决策（纯函数，便于单测）。
// 修复缺陷：加载/恢复活动模型后，居中标题应同步显示模型名，而不是停留在自定义标题。
// 注意：public/viewer-title-editor.js 会命令式写 h2，二者以本优先级为准——
// 存在真实活动模型时标题显示模型名，public 脚本不得覆盖（见该脚本内守卫）。

// 这些标识代表“内置/默认模型”，不作为模型名展示，回落到用户自定义标题
const DEFAULT_MODEL_MARKERS = ['__factory_default__', 'Factory Campus A.glb'];
const MODEL_EXT_RE = /\.(glb|gltf|fbx|obj|stl)$/i;

/**
 * 决定居中标题文本。
 * 优先级：真实活动模型的别名 alias > 去扩展名的模型文件名 > 用户自定义标题（按语言回退）。
 * @param {string} activeModel localStorage 中的活动模型名（可能为 null/空/默认标识）
 * @param {{title?:string,titleEn?:string}} [viewer] 用户自定义标题配置
 * @param {'zh'|'en'} [language] 语言
 * @param {string} [alias] 该模型在模型库中设置的别名（可选，设置后优先显示）
 * @returns {string}
 */
export function pickHomeTitle(activeModel, viewer = {}, language = 'zh', alias = '') {
  const name = (activeModel || '').trim();
  if (name && !DEFAULT_MODEL_MARKERS.includes(name)) {
    const displayAlias = (alias || '').trim();
    if (displayAlias) return displayAlias;
    return name.replace(MODEL_EXT_RE, '');
  }
  if (language === 'en') return viewer.titleEn || viewer.title || '';
  return viewer.title || viewer.titleEn || '';
}
