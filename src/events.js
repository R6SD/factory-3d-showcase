/**
 * 事件契约 — 集中定义模块间通信的 CustomEvent 名称和类型化 dispatch/listen。
 * 仅 ES 模块代码（React、SceneRuntime）使用；公共脚本（public/*.js）继续用字符串字面量。
 * 事件契约详见 docs/adr/0002-public-script-injection.md。
 */

export const EVENTS = Object.freeze({
  // 模型生命周期
  IMPORT: 'factory-import',
  SHOW_MODEL: 'factory-show-model',
  SHOW_DEFAULT: 'factory-show-default',
  SCENE_READY: 'factory-scene-ready',
  ACTIVE_MODEL_CHANGE: 'factory-active-model-change',
  MODEL_MISSING: 'factory-model-missing',
  MODEL_DELETE: 'factory-model-delete',
  MODEL_DELETE_FILE: 'factory-model-delete-file',
  RESET: 'factory-reset',
  // 配置变更
  VIEWER_TITLE_CHANGE: 'factory-viewer-title-change',
  BRAND_ICON_CHANGE: 'factory-brand-icon-change',
});

/** 派发自定义事件 */
export function dispatch(name, detail) {
  window.dispatchEvent(new CustomEvent(name, detail !== undefined ? { detail } : {}));
}

/** 监听事件，返回 unsubscribe 函数 */
export function listen(name, handler) {
  window.addEventListener(name, handler);
  return () => window.removeEventListener(name, handler);
}
