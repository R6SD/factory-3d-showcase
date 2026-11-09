# 性能预算

默认工厂场景的建议预算只有一处定义：[`src/scene/perf-budget.js`](../src/scene/perf-budget.js) 里的 `PERF_BUDGET`。三维页「性能预算」面板用 `budgetLevel` 上色，页脚用 `budgetFooter` 生成。README 和面板都不要再写一套数字。

## 预算表

比较规则（`value` 为面板读到的数）：

| 指标 | 字段 | ok | warn | bad |
|------|------|----|------|-----|
| 帧率 | `fpsMin` | `value >= fpsMin` | 无中间带 | `value < fpsMin` |
| 三角面（模型总量） | `trisWarn` / `trisMax` | `value < trisWarn` | `trisWarn <= value < trisMax` | `value >= trisMax` |
| 绘制调用/帧 | `drawCallsWarn` / `drawCallsMax` | `value < drawCallsWarn` | `drawCallsWarn <= value < drawCallsMax` | `value >= drawCallsMax` |

非有限数值（缺测、`NaN`、无穷）按 bad。帧率预算只有下限，所以帧率行只有 ok / bad。

## 默认模型实测

阈值没有改。下面是默认厂房自己的读数，用来对照「绘制调用 ≤120、三角面 5–15 万」这个更紧的目标。网格、投射阴影网格、三角面区间和建模耗时由 `tests/factory-model.test.js` 守卫。

| 指标 | 实测 |
|------|------|
| Mesh | 56 |
| 投影 Mesh（`castShadow === true`） | 48 |
| 三角面（`getModelInfo().tris` / `getPerf().trisTotal`） | 86948 |
| 绘制调用/帧，标准展示，10 秒内最大 `getPerf().calls` | 57 |
| 绘制调用/帧，静态展示，10 秒内最大 `getPerf().calls` | 57 |
| 每帧提交三角面，上述两次 10 秒窗口的最大值 | 86948 |
| 建模耗时 | 66 ms（预热 1 次后 3 次：61 / 66 / 101 ms，取中位数） |
| 帧率 | 未测（无真 GPU） |

测量环境：Google Chrome 156.0.8078.47，无头，ANGLE SwiftShader（Vulkan 1.3.0 SwiftShader Device），视口 1920×1080，默认场景配置。标准展示是 `display: 'standard'`，静态展示是 `display: 'static'`。指针静止，运动视差没有离轴偏移。建模耗时是在同一浏览器里对 `createFactoryModel()` 用 `performance.now()` 打点。Electron 桌面端未测。

三角面行用的是模型静态三角面 `getPerf().trisTotal`（最近一次 `getModelInfo()` 的缓存），不是 `tris`。`tris` 仍是最近一帧提交给 WebGL 的三角面，阴影等会把它抬高，不能拿来对这张表。

## 面板怎么读

工具条「性能预算」一键打开。打开后每 500ms 调用 `getFps()` 和 `getPerf()`。不调用 `setView` / `updateConfig`，也不为了刷新读数把场景标脏。`shouldRenderFrame` 的语义不变：没有脏标记、没有动画、视差已收敛时不提交画面。静态展示会停掉传送带和粒子，空闲时因此不再画帧。

预算三行下面保留原来的四行，不按 `budgetLevel` 上色：

- **渲染/秒**、**跳过/秒**：`getPerf()` 的 `rfs` / `sfs`。有跳帧时「渲染/秒」沿用原来的 `good`，表示按需渲染在跳过空帧，不是预算达标。静态模式空闲时，跳过/秒应大于 0，渲染/秒接近 0。展示模式开着自动旋转时会持续渲染，这是预期行为，跳过/秒可以是 0。这是画面上能看出验收第 2 条的读数。
- **三角面（每帧提交）**：`tris`，显示成原来的 `x.xk`。这是最近一帧交给 WebGL 的三角面，不是上面的模型总量。
- **立体模式**：`mode`。

缺测时这四行显示「—」。

## 超预算时

先降负载，不要关掉按需渲染：

- 把「渲染质量」预设调低
- 关闭阴影
- 关闭流星氛围；静态展示会冻结场景粒子和传送带

不要为了让面板有连续读数而改 `render-policy`，或在轮询里强制每帧渲染。
