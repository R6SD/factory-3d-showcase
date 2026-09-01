import { monthRecords, sumQty } from './selectors.js';

/** 构建近 N 个月月度计划编辑视图数据 */
export function buildPlanRows(records, monthlyPlans, months) {
  const plans = monthlyPlans || {};
  return months.map((ym) => {
    const actual = sumQty(monthRecords(records, ym));
    const plan = Number(plans[ym]) || 0;
    const attainment = plan > 0 ? Math.round((actual / plan) * 1000) / 10 : null;
    return { ym, actual, plan, attainment };
  });
}

/** 根据 draft 生成更新后的 monthlyPlans；无效/非正数视为删除该月计划 */
export function applyPlanUpdates(prevPlans, draft, months) {
  const next = { ...prevPlans };
  for (const ym of months) {
    const v = Number(draft[ym]);
    if (Number.isFinite(v) && v > 0) next[ym] = Math.round(v);
    else delete next[ym];
  }
  return next;
}

const MONTH_KEY = /^\d{4}-\d{2}$/;

/** 解析 Excel 导入行为 [{ym, plan}]，仅保留合法 yyyy-mm 月份与非负计划量 */
export function parsePlanImport(rows) {
  return (rows || [])
    .map((r) => {
      const ym = String((r && (r['月份'] ?? r.ym)) ?? '').trim();
      const plan = Number(r && (r['计划产量'] ?? r.plan));
      return { ym, plan };
    })
    .filter((r) => MONTH_KEY.test(r.ym) && Number.isFinite(r.plan) && r.plan >= 0);
}

/** 将导入行合并进 plans：正数覆盖，0/空视为删除该月计划 */
export function mergePlanImport(prevPlans, imported) {
  const next = { ...(prevPlans || {}) };
  for (const { ym, plan } of imported) {
    if (Number.isFinite(plan) && plan > 0) next[ym] = Math.round(plan);
    else delete next[ym];
  }
  return next;
}

/** 构建近 N 个月计划导出行（月份 / 计划产量 / 实际产出），供 downloadSheet 使用 */
export function buildPlanExportRows(records, monthlyPlans, months) {
  const plans = monthlyPlans || {};
  return months.map((ym) => ({
    月份: ym,
    计划产量: Number(plans[ym]) || 0,
    实际产出: sumQty(monthRecords(records, ym)),
  }));
}
