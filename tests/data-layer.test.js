import { describe, it, expect } from 'vitest';
import {
  createSeedBusiness, stepCapacity, normalizeBusiness, DEVICE_COLORS,
} from '../src/data/seed.js';
import {
  filterPeople, buildManagerGraph, directReportCount, suggestEmployeeId,
  achievementRate, deviceStatusList,
} from '../src/data/selectors.js';

describe('seed 种子数据', () => {
  it('每次返回独立深拷贝，互不污染', () => {
    const a = createSeedBusiness();
    const b = createSeedBusiness();
    expect(a).toEqual(b);
    a.people.pop();
    expect(b.people.length).toBeGreaterThan(4);
  });

  it('normalizeBusiness 对空输入补全、对部分输入补齐缺失集合', () => {
    expect(normalizeBusiness(null).capacity).toBeTruthy();
    const partial = normalizeBusiness({ capacity: { output: 1 } });
    expect(partial.capacity.output).toBe(1);
    expect(partial.capacity.planned).toBe(20500); // 缺失字段补齐
    expect(partial.people.length).toBeGreaterThan(4);
    expect(Array.isArray(partial.outputRecords)).toBe(true);
  });

  it('种子产出明细结构完整：日期/部门/工段/线体/姓名/产量，覆盖近 6 个月', () => {
    const biz = createSeedBusiness(new Date(2026, 8, 15));
    expect(biz.outputRecords.length).toBeGreaterThan(0);
    const r = biz.outputRecords.find((x) => x.date.startsWith('2026-09'));
    expect(r).toBeTruthy();
    expect(r.date).toMatch(/^2026-09-\d{2}$/);
    expect(typeof r.qty).toBe('number');
    expect(r.person).toBeTruthy();
    // 同一天同一人只有一条
    const key = `${r.date}|${r.person}`;
    expect(biz.outputRecords.filter((x) => `${x.date}|${x.person}` === key)).toHaveLength(1);
    // 近 6 个月（含当月）都有产出，支撑趋势与环比
    const months = new Set(biz.outputRecords.map((x) => x.date.slice(0, 7)));
    expect(months.has('2026-09')).toBe(true);
    expect(months.has('2026-05')).toBe(true);
    expect(months.size).toBe(6);
    // 当月只生成到今天（15 号），不含未来日期
    expect(biz.outputRecords.some((x) => x.date > '2026-09-15')).toBe(false);
  });

  it('monthlyPlans 覆盖近 6 个月、计划为正且与实际同量级，normalize 可合并覆盖', () => {
    const now = new Date(2026, 8, 15);
    const biz = createSeedBusiness(now);
    const keys = Object.keys(biz.monthlyPlans);
    expect(keys).toHaveLength(6);
    expect(keys).toContain('2026-09');
    expect(keys).toContain('2026-05');
    for (const k of keys) expect(biz.monthlyPlans[k]).toBeGreaterThan(0);
    // 计划与实际同量级（达成率应在 60%~115% 的合理区间）
    const actual = biz.outputRecords.filter((x) => x.date.startsWith('2026-08'))
      .reduce((s, x) => s + x.qty, 0);
    const rate = actual / biz.monthlyPlans['2026-08'];
    expect(rate).toBeGreaterThan(0.6);
    expect(rate).toBeLessThan(1.15);
    // normalize：用户数据可覆盖单月计划，其余月份保留种子（种子按真实当前日期生成，只验证结构）
    const merged = normalizeBusiness({ monthlyPlans: { '2026-08': 12345 } });
    expect(merged.monthlyPlans['2026-08']).toBe(12345);
    expect(Object.keys(merged.monthlyPlans).length).toBeGreaterThanOrEqual(6);
    for (const k of Object.keys(merged.monthlyPlans)) {
      expect(merged.monthlyPlans[k]).toBeGreaterThan(0);
    }
  });
});

describe('stepCapacity 实时推演', () => {
  it('产量递增、设备总数守恒、趋势保持 5 点、不修改入参', () => {
    const seed = createSeedBusiness();
    const before = JSON.stringify(seed.capacity);
    const total = seed.capacity.running + seed.capacity.idle + seed.capacity.fault + seed.capacity.maintain;
    const next = stepCapacity(seed.capacity, () => 0.5);
    expect(next.output).toBeGreaterThan(seed.capacity.output);
    expect(next.running + next.idle + next.fault + next.maintain).toBe(total);
    expect(next.trend).toHaveLength(5);
    expect(JSON.stringify(seed.capacity)).toBe(before); // 纯函数
  });
});

describe('selectors 人员与组织', () => {
  const people = createSeedBusiness().people;

  it('filterPeople 支持姓名/岗位/部门/工号且大小写不敏感', () => {
    expect(filterPeople(people, '').length).toBe(people.length);
    expect(filterPeople(people, '质量').map((p) => p.name)).toEqual(['李敏', '王芳']);
    expect(filterPeople(people, 'e-1012').map((p) => p.name)).toEqual(['张伟']);
    expect(filterPeople(people, '不存在的人')).toHaveLength(0);
    expect(filterPeople(null, 'x')).toHaveLength(0);
  });

  it('buildManagerGraph 按上级字段推导根与汇报关系', () => {
    const { graph, roots } = buildManagerGraph(people);
    expect(roots).toEqual(['王建国']);
    expect(graph['王建国'].sort()).toEqual(['张伟', '李敏', '陈浩', '马磊']);
    expect(graph['张伟'].sort()).toEqual(['周敏', '李强']);
    expect(directReportCount(graph, '王建国')).toBe(4);
  });

  it('上级指向不存在的人时作为根节点，不丢数据', () => {
    const orphan = [{ id: 'x', name: '甲', manager: '幽灵' }, { id: 'y', name: '乙', manager: '甲' }];
    const { roots, graph } = buildManagerGraph(orphan);
    expect(roots).toContain('甲');
    expect(graph['甲']).toEqual(['乙']);
  });

  it('suggestEmployeeId 取最大编号 +1，空列表从 E-1001 起', () => {
    expect(suggestEmployeeId(people)).toBe('E-1062');
    expect(suggestEmployeeId([])).toBe('E-1001');
  });
});

describe('selectors 产能', () => {
  const biz = createSeedBusiness();

  it('achievementRate 达成率计算与零保护', () => {
    expect(achievementRate(biz.capacity)).toBe(82.2);
    expect(achievementRate({ output: 1, planned: 0 })).toBe(0);
  });

  it('deviceStatusList 输出四类并带统一配色', () => {
    const list = deviceStatusList(biz.capacity);
    expect(list.map((d) => d.label)).toEqual(['运行', '待机', '故障', '维护']);
    expect(list[0].value).toBe(102);
    expect(list[0].color).toBe(DEVICE_COLORS.running);
  });
});
