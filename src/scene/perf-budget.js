/**
 * 默认工厂场景的性能预算。数值的唯一来源；面板页脚与文档都引用这里，不要另写一套。
 *
 * 阈值来自 issue #8 的架构说明，没有按本地采样改写。
 * 一次 CPU 采样（与 getModelInfo 相同的网格遍历，无 WebGL）：
 * createFactoryModel() 为 178 网格、5404 三角面、30 材质，低于 trisWarn。
 * 没有采样 getPerf().calls。200k/500k 与 150/300 仍是更重模型的上限。
 *
 * 帧率只有下限：>= fpsMin 为 ok，低于为 bad。
 * 三角面与绘制调用是越低越好：< warn 为 ok，warn <= value < max 为 warn，>= max 为 bad。
 */

export const PERF_BUDGET = Object.freeze({
  fpsMin: 50,
  trisWarn: 200_000,
  trisMax: 500_000,
  drawCallsWarn: 150,
  drawCallsMax: 300,
});

const LOWER_IS_BETTER = {
  tris: ['trisWarn', 'trisMax'],
  drawCalls: ['drawCallsWarn', 'drawCallsMax'],
};

function lowerIsBetter(value, warn, max) {
  if (value < warn) return 'ok';
  if (value < max) return 'warn';
  return 'bad';
}

/**
 * @param {'fps'|'tris'|'drawCalls'} metric
 * @param {number} value
 * @param {typeof PERF_BUDGET} [budget]
 * @returns {'ok'|'warn'|'bad'}
 */
export function budgetLevel(metric, value, budget = PERF_BUDGET) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'bad';
  if (metric === 'fps') return value >= budget.fpsMin ? 'ok' : 'bad';
  const keys = LOWER_IS_BETTER[metric];
  if (!keys) throw new Error(`unknown perf metric: ${metric}`);
  return lowerIsBetter(value, budget[keys[0]], budget[keys[1]]);
}

/** 千的整数倍缩成 `200k`，其余保持原数字，避免 199999 被四舍五入成 200k。 */
export function formatBudgetCount(n) {
  if (typeof n === 'number' && Number.isFinite(n) && Math.abs(n) >= 1000 && n % 1000 === 0) {
    return `${n / 1000}k`;
  }
  return String(n);
}

/** 面板页脚。文案固定，数字只从 budget 来。 */
export function budgetFooter(budget = PERF_BUDGET) {
  return `预算 FPS≥${budget.fpsMin} · tris<${formatBudgetCount(budget.trisWarn)} 舒适 / <${formatBudgetCount(budget.trisMax)} 上限 · calls<${budget.drawCallsWarn}/${budget.drawCallsMax}`;
}
