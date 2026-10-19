# 公共脚本通过 DOM 事件增强 React 应用

标签编辑器、标题编辑器、模型库存储、场景持久化等功能以独立的 vanilla JS 脚本放在 `public/` 目录，在 `index.html` 中通过 `<script>` 加载，与 React 应用通过 `window.dispatchEvent` / `CustomEvent` 通信。

原因：这些功能需要在 React 组件树之外操作 DOM（如 MutationObserver 监听设置面板渲染、在 Three.js canvas 上层叠加标签 DOM），且不依赖 React 状态。将它们作为独立脚本避免了将 Three.js 运行时和 DOM 操作耦合进 React 组件，也使得脚本可以在 React 挂载前就开始监听事件。

事件契约：`factory-import`（导入模型）、`factory-show-model`（从库加载模型）、`factory-scene-ready`（场景初始化完成）、`factory-active-model-change`（当前模型变更）、`factory-viewer-title-change`（标题变更）、`factory-brand-icon-change`（品牌图标变更）、`factory-model-delete-file`（删除模型文件）、`factory-model-missing`（模型未找到）。

## Consequences

- 脚本可独立开发和测试，不依赖 React 构建链
- 事件契约是隐式的，修改需同步所有监听方
- 脚本在 React 卸载后仍可能持有 DOM 引用，需注意清理
- 分层、`window.__factorySceneRuntime` 契约、与 `src/events.js` 对照的完整事件表，以及 public 脚本的保留与收编顺序，见 [0004 应用模块边界](0004-app-module-boundaries.md)。本决策（public 脚本经 DOM 事件增强、不进入 React 树）仍然有效。
