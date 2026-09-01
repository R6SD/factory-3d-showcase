import { describe, it, expect } from 'vitest';
import { buildPlanRows, applyPlanUpdates, parsePlanImport, mergePlanImport, buildPlanExportRows } from '../src/data/admin-plans.js';

const records = [
  { date: '2026-09-01', dept: '制造一部', section: '总装工段', line: '总装线 A', person: '赵磊', qty: 100 },
  { date: '2026-09-02', dept: '制造一部', section: '机加工段', line: '机加线 B', person: '郑爽', qty: 200 },
  { date: '2026-08-31', dept: '制造一部', section: '总装工段', line: '总装线 A', person: '赵磊', qty: 400 },
];

const months = ['2026-09', '2026-08'];

describe('admin-plans 纯函数', () => {
  it('buildPlanRows 按月份返回实际/计划/达成率，无计划时 attainment 为 null', () => {
    const rows = buildPlanRows(records, { '2026-09': 300, '2026-08': 0 }, months);
    expect(rows).toEqual([
      { ym: '2026-09', actual: 300, plan: 300, attainment: 100 },
      { ym: '2026-08', actual: 400, plan: 0, attainment: null },
    ]);
  });

  it('buildPlanRows 达成率保留 1 位小数', () => {
    const rows = buildPlanRows(records, { '2026-09': 600 }, ['2026-09']);
    expect(rows[0].attainment).toBe(50); // 300/600 = 0.5
  });

  it('buildPlanRows 容忍脏输入', () => {
    const rows = buildPlanRows(null, null, months);
    expect(rows.every((r) => r.actual === 0 && r.plan === 0 && r.attainment === null)).toBe(true);
  });

  it('applyPlanUpdates 保存有效正数并删除无效/非正数计划', () => {
    const draft = { '2026-09': '550', '2026-08': '0', '2026-07': 'abc' };
    const next = applyPlanUpdates({ '2026-08': 999, '2026-07': 200 }, draft, ['2026-09', '2026-08', '2026-07']);
    expect(next).toEqual({ '2026-09': 550 });
  });

  it('applyPlanUpdates 不修改未涉及的月份', () => {
    const next = applyPlanUpdates({ '2026-06': 1000 }, { '2026-09': '300' }, ['2026-09']);
    expect(next).toEqual({ '2026-09': 300, '2026-06': 1000 });
  });

  it('parsePlanImport 解析合法月份与计划量，过滤非法行', () => {
    const rows = [
      { '月份': '2026-09', '计划产量': 550 },
      { '月份': '2026-10', '计划产量': '800' },
      { '月份': '2026/09', '计划产量': 100 },
      { '月份': '2026-11', '计划产量': 'abc' },
      { '月份': '2026-12', '计划产量': 0 },
    ];
    expect(parsePlanImport(rows)).toEqual([
      { ym: '2026-09', plan: 550 },
      { ym: '2026-10', plan: 800 },
      { ym: '2026-12', plan: 0 },
    ]);
  });

  it('parsePlanImport 兼容英文字段名与空输入', () => {
    expect(parsePlanImport([{ ym: '2026-09', plan: 100 }])).toEqual([{ ym: '2026-09', plan: 100 }]);
    expect(parsePlanImport(null)).toEqual([]);
    expect(parsePlanImport([])).toEqual([]);
  });

  it('mergePlanImport 正数覆盖、0/空删除，保留未涉及月份', () => {
    const next = mergePlanImport({ '2026-06': 1000, '2026-09': 100 }, [
      { ym: '2026-09', plan: 550 },
      { ym: '2026-08', plan: 0 },
      { ym: '2026-07', plan: 300.6 },
    ]);
    expect(next).toEqual({ '2026-06': 1000, '2026-09': 550, '2026-07': 301 });
  });

  it('buildPlanExportRows 输出中文表头与计划/实际产出', () => {
    const rows = buildPlanExportRows(records, { '2026-09': 300 }, ['2026-09', '2026-08']);
    expect(rows).toEqual([
      { 月份: '2026-09', 计划产量: 300, 实际产出: 300 },
      { 月份: '2026-08', 计划产量: 0, 实际产出: 400 },
    ]);
  });
});
