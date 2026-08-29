import { describe, it, expect } from 'vitest';
import {
  createSeedBusiness, stepCapacity, normalizeBusiness, DEVICE_COLORS,
} from '../src/data/seed.js';
import {
  filterPeople, buildManagerGraph, directReportCount, suggestEmployeeId,
  achievementRate, deviceStatusList, orderSitesWithDepth,
} from '../src/data/selectors.js';

describe('seed 种子数据', () => {
  it('每次返回独立深拷贝，互不污染', () => {
    const a = createSeedBusiness();
    const b = createSeedBusiness();
    expect(a).toEqual(b);
    a.people.pop();
    expect(b.people).toHaveLength(4);
  });

  it('normalizeBusiness 对空输入补全、对部分输入补齐缺失集合', () => {
    expect(normalizeBusiness(null).capacity).toBeTruthy();
    const partial = normalizeBusiness({ capacity: { output: 1 } });
    expect(partial.capacity.output).toBe(1);
    expect(partial.capacity.planned).toBe(20500); // 缺失字段补齐
    expect(partial.people).toHaveLength(4);
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

  it('filterPeople 支持姓名/岗位/工号且大小写不敏感', () => {
    expect(filterPeople(people, '')).toHaveLength(4);
    expect(filterPeople(people, '质量').map((p) => p.name)).toEqual(['李敏']);
    expect(filterPeople(people, 'e-1012').map((p) => p.name)).toEqual(['张伟']);
    expect(filterPeople(people, '不存在的人')).toHaveLength(0);
    expect(filterPeople(null, 'x')).toHaveLength(0);
  });

  it('buildManagerGraph 按上级字段推导根与汇报关系', () => {
    const { graph, roots } = buildManagerGraph(people);
    expect(roots).toEqual(['王建国']);
    expect(graph['王建国'].sort()).toEqual(['张伟', '陈浩']);
    expect(graph['张伟']).toEqual(['李敏']);
    expect(directReportCount(graph, '王建国')).toBe(2);
  });

  it('上级指向不存在的人时作为根节点，不丢数据', () => {
    const orphan = [{ id: 'x', name: '甲', manager: '幽灵' }, { id: 'y', name: '乙', manager: '甲' }];
    const { roots, graph } = buildManagerGraph(orphan);
    expect(roots).toContain('甲');
    expect(graph['甲']).toEqual(['乙']);
  });

  it('suggestEmployeeId 取最大编号 +1，空列表从 E-1001 起', () => {
    expect(suggestEmployeeId(people)).toBe('E-1052');
    expect(suggestEmployeeId([])).toBe('E-1001');
  });
});

describe('selectors 产能与场地', () => {
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

  it('orderSitesWithDepth 父在子前并标注 depth', () => {
    const ordered = orderSitesWithDepth(biz.sites);
    expect(ordered).toHaveLength(8);
    expect(ordered[0].id).toBe('site-a');
    expect(ordered[0].depth).toBe(0);
    const lineB = ordered.find((s) => s.id === 'line-b-site');
    expect(lineB.depth).toBe(2); // site-a -> zone-mach -> line-b-site
    expect(ordered.findIndex((s) => s.id === 'zone-mach')).toBeLessThan(
      ordered.findIndex((s) => s.id === 'line-b-site'),
    );
    expect(ordered.filter((s) => s.depth === 0).map((s) => s.id)).toEqual(['site-a', 'site-b', 'warehouse']);
  });

  it('orderSitesWithDepth 对环引用安全终止', () => {
    const cyclic = [
      { id: 'a', parent: 'b' }, { id: 'b', parent: 'a' },
    ];
    expect(orderSitesWithDepth(cyclic)).toHaveLength(2);
  });
});
