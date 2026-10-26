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
