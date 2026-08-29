/**
 * selectors.js — 从业务数据派生视图模型的纯函数集合（无副作用、便于单测）。
 * 页面只消费这里的结果，不自己写筛选/汇总逻辑，避免多处实现漂移。
 */
import { DEVICE_COLORS } from './seed.js';

/** 员工关键字筛选（姓名 / 工号 / 岗位 / 部门），大小写与空格不敏感 */
export function filterPeople(people, keyword) {
  const q = (keyword || '').trim().toLowerCase();
  const list = Array.isArray(people) ? people : [];
  if (!q) return list;
  return list.filter((p) => [p.name, p.id, p.role, p.dept].join(' ').toLowerCase().includes(q));
}

/**
 * 依据 manager（上级姓名）推导汇报关系图。
 * manager 为 '—' / 空 / 指向不存在的人时视为根节点。
 * @returns {{graph:Record<string,string[]>, roots:string[], byName:Map}}
 */
export function buildManagerGraph(people) {
  const list = Array.isArray(people) ? people : [];
  const names = new Set(list.map((p) => p.name));
  const graph = {};
  list.forEach((p) => { graph[p.name] = []; });
  const roots = [];
  list.forEach((p) => {
    const m = p.manager;
    if (m && m !== '—' && m !== p.name && names.has(m)) graph[m].push(p.name);
    else roots.push(p.name);
  });
  const byName = new Map(list.map((p) => [p.name, p]));
  return { graph, roots, byName };
}

/** 计算某员工直属下属人数 */
export function directReportCount(graph, name) {
  return graph[name]?.length ?? 0;
}

/** 建议下一个员工工号（取现有最大数字编号 +1） */
export function suggestEmployeeId(people) {
  const max = (Array.isArray(people) ? people : []).reduce((acc, p) => {
    const n = Number(String(p.id || '').replace(/\D/g, ''));
    return Number.isFinite(n) && n > acc ? n : acc;
  }, 1000);
  return `E-${max + 1}`;
}

/** 计划达成率（%，保留 1 位小数） */
export function achievementRate(capacity) {
  if (!capacity || !capacity.planned) return 0;
  return Math.round((capacity.output / capacity.planned) * 1000) / 10;
}

/** 产能数据 → 设备状态环形图数据 */
export function deviceStatusList(capacity) {
  const c = capacity || {};
  return [
    { label: '运行', value: c.running ?? 0, color: DEVICE_COLORS.running },
    { label: '待机', value: c.idle ?? 0, color: DEVICE_COLORS.idle },
    { label: '故障', value: c.fault ?? 0, color: DEVICE_COLORS.fault },
    { label: '维护', value: c.maintain ?? 0, color: DEVICE_COLORS.maintain },
  ];
}

/**
 * 场地列表（带 parent）→ 深度优先、父在子前的有序序列，每项带 depth（用于左栏缩进树）。
 * 孤儿节点（parent 找不到）按根节点处理，保证不丢数据。
 */
export function orderSitesWithDepth(sites) {
  const list = Array.isArray(sites) ? sites : [];
  const byId = new Map(list.map((s) => [s.id, s]));
  const childrenOf = new Map();
  const roots = [];
  list.forEach((s) => {
    if (s.parent && byId.has(s.parent)) {
      if (!childrenOf.has(s.parent)) childrenOf.set(s.parent, []);
      childrenOf.get(s.parent).push(s.id);
    } else {
      roots.push(s.id);
    }
  });
  const out = [];
  const visited = new Set();
  const walk = (id, depth) => {
    if (visited.has(id)) return; // 环保护
    visited.add(id);
    const node = byId.get(id);
    if (!node) return;
    out.push({ ...node, depth });
    (childrenOf.get(id) || []).forEach((c) => walk(c, depth + 1));
  };
  roots.forEach((r) => walk(r, 0));
  // 兜底：父链最终成环、无正常根的“孤岛”节点也不丢失
  list.forEach((s) => { if (!visited.has(s.id)) walk(s.id, 0); });
  return out;
}

/** 取某场地的直接子节点列表 */
export function childSites(sites, parentId) {
  return (Array.isArray(sites) ? sites : []).filter((s) => s.parent === parentId);
}
