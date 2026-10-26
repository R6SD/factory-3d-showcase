# 应用模块边界：先写清契约，只拆出 Admin

`src/app.jsx` 同时承担路由壳、三维页、产能、组织、模型库、设置和整块 Admin。本轮只写清分层与契约，并把 Admin 拆成独立模块。Capacity、Organization、Settings、Scene 控件留在 `src/app.jsx`。public 脚本继续由 `index.html` 注入，收编只记录顺序，本轮不落地。

原则与需求 [#2](https://github.com/R6SD/factory-3d-showcase/issues/2) 一致：SceneRuntime 是场景的单一真相源；Web 与桌面共用同一套前端；拆分是渐进的；UI 不直接改 Three 内部状态，只调用下面的公共 API 或事件。

## 分层

| 层 | 职责 | 目录 |
|----|------|------|
| 展示壳 | Router、Shell、Provider 组装 | `src/app.jsx`（本轮只移出 Admin） |
| UI / 业务页 | Capacity、Organization、Models、Settings、Admin | `src/ui/*`（Admin 已在 `src/ui/admin/`；其余页面仍在壳内，后续再迁） |
| Data | seed / selectors / repository / DataProvider；聚合只在 selectors | `src/data/*` |
| SceneRuntime | Three 场景、渲染循环、模型生命周期 | `src/scene/*` |
| Electron | 本地 HTTP + 模型 / 业务 API | `electron/*` |
| public 增强 | 标签、标题、模型库存储等，不进 React 树 | `public/*` |

## `window.__factorySceneRuntime` 公共 API

契约与 `src/scene/SceneRuntime.js` 文件头及 `_exposeRuntime()` 对齐。本轮只文档化，不改方法名、不改签名。

UI 控件（指南针、FPS、层级、截图等）只经此对象和事件通信，不 new 第二套 runtime。

挂到 `window.__factorySceneRuntime` 上的字段：

| 字段 | 含义 |
|------|------|
| `renderer` | WebGLRenderer |
| `scene` | Three.Scene |
| `camera` | 当前相机 |
| `control` | OrbitControls |
| `grid` | 参考网格 |
| `hemi` | 半球光 |
| `sun` | 主方向光 |
| `rim` | 轮廓点光 |
| `THREE` | 运行时使用的 three 命名空间 |

挂到同一对象上的方法：

| 方法 | 作用 |
|------|------|
| `getModel()` | 当前模型对象 |
| `fit()` | 按包围盒适配相机 |
| `setView(preset)` | 切换预设视角 |
| `screenshot()` | 导出当前画布 |
| `getModelInfo()` | 网格 / 三角面 / 材质计数 |
| `setDisplayMode(mode)` | `solid` / `wireframe` / `points` |
| `getFps()` | 当前帧率 |
| `getPerf()` | 渲染计数（实际渲染、跳帧、GL 调用、每帧提交三角面 `tris`、立体模式） |
| `getPerf().trisTotal` | 当前模型静态三角面，取最近一次 `getModelInfo()` 缓存；模型未加载时为 `null`。预算面板用它，避免和每帧提交的 `tris` 混用 |
| `getModelTree()` | 模型节点树 |
| `focusNode(uuid)` | 聚焦节点 |
| `toggleNodeVisible(uuid)` | 切换节点可见性 |
| `pressBounce(active)` | 按压回弹（窗口对象上已有，文件头未单列） |
| `setDeviceStatuses(map)` | 按 `userData.equipmentId` 着色。值为状态字符串，或 `{ status, name }`（外载模型可按 id / 中文名绑定）。改色前 clone 材质 |
| `clearDeviceStatuses()` | 恢复 `_statusOrig`、释放 clone，并清空状态表 |
| `setEquipmentPickEnabled(bool)` | 开关设备射线拾取，三维页默认开启 |
| `raycastVisible(clientX, clientY)` | 最近的可见交点。对象或任一祖先 `visible === false` 时跳过；设备拾取、长按和右键标注共用 |
| `isHierarchyVisible(object)` | 对象及祖先是否都可见。`raycastVisible` 与拾取使用同一判断 |

SceneRuntime 实例上的公共方法（React `Scene` 适配器调用，没有拷贝到 window 对象上）：

| 方法 | 作用 |
|------|------|
| `updateConfig(sceneConfig)` | 把场景配置应用到已有 runtime |
| `dispose()` | 卸监听、释放 WebGL 与模型 |

## 事件契约

ES 模块继续用 `src/events.js` 的 `EVENTS` / `dispatch` / `listen`。public 脚本继续用字符串字面量，原因见 [0002](0002-public-script-injection.md)。下表是当前全量对照；`factory-photos-changed` 原先已在照片库代码里使用，但没有常量，本轮补进 `EVENTS.PHOTOS_CHANGED`。

| 事件名 | `EVENTS` | 谁派发 | 谁监听 |
|--------|----------|--------|--------|
| `factory-import` | `IMPORT` | 壳内导入控件、SceneRuntime 拖放、`model-library-storage.js` | SceneRuntime、`model-library-storage.js`、`scene-persistence.js`、Admin 模型同步 |
| `factory-show-model` | `SHOW_MODEL` | 模型库、轮播、`scene-persistence.js` | `model-library-storage.js` |
| `factory-show-default` | `SHOW_DEFAULT` | 模型库、模型切换、轮播 | SceneRuntime、`scene-persistence.js` |
| `factory-scene-ready` | `SCENE_READY` | SceneRuntime | 壳内模型信息 / 层级、`model-label-editor.js`、`scene-persistence.js` |
| `factory-active-model-change` | `ACTIVE_MODEL_CHANGE` | SceneRuntime、模型切换、`scene-persistence.js` | 壳内标题 / 层级 / 设置预览、`model-label-editor.js` |
| `factory-model-missing` | `MODEL_MISSING` | `model-library-storage.js` | 壳内 Provider（把模型标为不可用） |
| `factory-model-delete` | `MODEL_DELETE` | 模型库删除 | 壳内 Provider（从配置移除登记） |
| `factory-model-delete-file` | `MODEL_DELETE_FILE` | 模型库删除 | `model-library-storage.js` |
| `factory-reset` | `RESET` | 场景「重置视角」按钮 | SceneRuntime |
| `factory-viewer-title-change` | `VIEWER_TITLE_CHANGE` | `viewer-title-editor.js` | 壳内 Provider |
| `factory-brand-icon-change` | `BRAND_ICON_CHANGE` | `viewer-title-editor.js` | 壳内 Provider |
| `factory-photos-changed` | `PHOTOS_CHANGED` | 照片列表刷新（`src/app.jsx`） | `usePhotoList` |
| `factory-equipment-select` | `EQUIPMENT_SELECT` | SceneRuntime 拾取（命中 `{ id }`，空白或换模型为 `null`）；详情侧栏关闭 | 三维页详情侧栏、SceneRuntime（同步选中高亮，不重复派发） |

外载 GLB 没有预先打标时，`setDeviceStatuses` 会在着色前按节点 `name` 模糊匹配设备 id 或中文名并写入 `userData.equipmentId`。对不上的节点保持原材质。默认工厂场景在 `createFactoryModel` 里已经打标，不依赖名称。状态色只做 `normal` / `alarm` / `down` 三种。

## Admin 拆分

Admin 与 SceneRuntime 耦合最弱、块最大，且 `/admin` 路由已经独立，所以本轮只拆它。

```text
src/ui/admin/AdminApp.jsx        原 AdminApp + tab 壳，仍渲染 Models / Settings
src/ui/admin/AdminBusiness.jsx   人员 / 产出 / 计划子 tab
src/ui/admin/AdminPeople.jsx
src/ui/admin/AdminRecords.jsx
src/ui/admin/AdminPlans.jsx
src/ui/admin/AdminPhotos.jsx
src/ui/admin/forms.jsx           Drawer、EmployeeForm、RecordForm、sval
```

`src/app.jsx` 只保留 `import { AdminApp } from './ui/admin/AdminApp.jsx'` 和 `<Route path="/admin" element={<AdminApp/>}/>`。`/admin` 的 tab、表格、Excel 导入导出和照片库行为不变。

为避免环：`useApp` / `Ctx` 在 `src/app-context.jsx`，`Card` 在 `src/ui/shared.jsx`。Admin 的模型库和设置页仍从 `src/app.jsx` 引入 `Models` 与 `Settings`（这两个页面本轮不拆）。照片列表和 `PersonPhoto` 仍由壳导出，产能看板和组织页继续使用。Excel 的 `readSheet` / `downloadSheet` 只放在 `src/data/sheet-io.js`，不在 Admin 里再复制一份。

## public 脚本：保留，收编只排期

本轮不把 `public/*.js` 收进 Vite 模块。这些脚本用 MutationObserver，或在 canvas 上层操作 DOM，适合留在 React 树外，并且可以在 React 挂载前就开始听事件。`index.html` 里的 `<script src>` 注入保持原样。

短期：继续由 `index.html` 注入，与 ES 模块只用 CustomEvent 和 `window.__factorySceneRuntime` 协作（[0002](0002-public-script-injection.md)）。

中期候选收编顺序：

1. `service-controls.js` — 往设置页补「退出并关闭服务」，DOM 补丁最独立。
2. `auto-dismiss-notices.js` — 只观察 `.notice`，没有场景状态。
3. 标题 / 标签编辑器（`viewer-title-editor.js`、`model-label-editor.js`）— 要改成 ES module，并确认不再在 React 写完标题后把 DOM 覆盖回去。

`model-library-storage.js` 与 `scene-persistence.js` 持有 IndexedDB 和当前模型持久化，排在上述三步之后，单独收编。

收编条件：改为 ES module、改为走 `src/events.js`，并且 `npm test` 与 `npm run build` 不回归。未满足条件前不改 `public/` 脚本。

## Consequences

- Admin 成为独立模块后，`/admin` 行为保持不变；壳仍包含产能、组织、场景控件和设置实现。
- `Card` 与 `useApp` 成为壳和 Admin 的最小共享导出。Admin 引用壳内的 `Models` / `Settings` 是有意留下的环，等这两页拆出后再断开。
- public 脚本与 ES 模块的事件名必须和上表一致；新增事件先写入 `EVENTS`，再在 ADR 补一行。
- 不引入 TypeScript，不引入新的状态库，不改 SceneRuntime 公开方法名。
