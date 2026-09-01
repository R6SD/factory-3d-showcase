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
