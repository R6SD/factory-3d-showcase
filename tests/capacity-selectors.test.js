import { describe, it, expect } from 'vitest';
import {
  inMonth, monthRecords, sumQty, groupSum, deptMonthly, sectionMonthly,
  personRanking, lineDaily, distinctValues, recentMonths,
} from '../src/data/selectors.js';

const records = [
  { date: '2026-09-01', dept: '制造一部', section: '总装工段', line: '总装线 A', person: '赵磊', qty: 100 },
  { date: '2026-09-01', dept: '制造一部', section: '总装工段', line: '总装线 A', person: '孙丽', qty: 200 },
  { date: '2026-09-02', dept: '制造一部', section: '机加工段', line: '机加线 B', person: '郑爽', qty: 150 },
  { date: '2026-09-02', dept: '质量部', section: '质检工段', line: '质检线', person: '王芳', qty: 80 },
  { date: '2026-08-31', dept: '制造一部', section: '总装工段', line: '总装线 A', person: '赵磊', qty: 999 },
];
const people = [
  { id: '1', name: '赵磊', dept: '制造一部', section: '总装工段' },
  { id: '2', name: '孙丽', dept: '制造一部', section: '总装工段' },
];

describe('产出聚合', () => {
  it('inMonth / monthRecords 只取目标月份', () => {
    expect(inMonth('2026-09-01', '2026-09')).toBe(true);
    expect(inMonth('2026-08-31', '2026-09')).toBe(false);
    expect(monthRecords(records, '2026-09')).toHaveLength(4);
  });

  it('sumQty 合计且容忍脏输入', () => {
    expect(sumQty(records)).toBe(1529);
    expect(sumQty(null)).toBe(0);
  });

  it('groupSum 按字段汇总并降序', () => {
    const depts = groupSum(monthRecords(records, '2026-09'), 'dept');
    expect(depts).toEqual([
      { key: '制造一部', qty: 450 },
      { key: '质量部', qty: 80 },
    ]);
  });

  it('deptMonthly / sectionMonthly 等价便捷选择器，工段剔除空值', () => {
    expect(deptMonthly(records, '2026-09')[0]).toEqual({ key: '制造一部', qty: 450 });
    const secs = sectionMonthly(records, '2026-09');
    expect(secs.map((x) => x.key)).toEqual(['总装工段', '机加工段', '质检工段']);
  });

  it('personRanking 降序并合并花名册信息', () => {
    const rank = personRanking(records, '2026-09', people);
    expect(rank[0].name).toBe('孙丽');
    expect(rank[0].qty).toBe(200);
    expect(rank.find((x) => x.name === '赵磊').person.section).toBe('总装工段');
    // 花名册里没有的人也保留，person 为 null
    expect(rank.find((x) => x.name === '王芳').person).toBe(null);
  });

  it('lineDaily 补齐工作日为 0、跳过周末、只统计目标线体', () => {
    // 2026-09：1 号周二、5/6 周末
    const daily = lineDaily(records, '总装线 A', '2026-09');
    expect(daily[0]).toEqual({ date: '2026-09-01', qty: 300 });
    expect(daily.find((d) => d.date === '2026-09-05')).toBeUndefined();
    expect(daily.find((d) => d.date === '2026-09-03').qty).toBe(0);
    expect(daily).toHaveLength(22); // 2026 年 9 月共 22 个工作日
  });

  it('distinctValues 去重排序', () => {
    expect(distinctValues(records, 'line')).toEqual(['机加线 B', '质检线', '总装线 A']);
  });

  it('recentMonths 含本月并向过去递减、跨年', () => {
    const months = recentMonths(3, new Date(2026, 0, 15));
    expect(months).toEqual(['2026-01', '2025-12', '2025-11']);
  });
});
