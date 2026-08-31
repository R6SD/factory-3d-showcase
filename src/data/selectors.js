/**
 * selectors.js — 从业务数据派生视图模型的纯函数集合（无副作用、便于单测）。
 * 页面只消费这里的结果，不自己写筛选/汇总逻辑，避免多处实现漂移。
 */
import { DEVICE_COLORS } from './seed.js';

/** 员工关键字筛选（姓名 / 工号 / 岗位 / 部门 / 工段），大小写与空格不敏感 */
export function filterPeople(people, keyword) {
  const q = (keyword || '').trim().toLowerCase();
  const list = Array.isArray(people) ? people : [];
  if (!q) return list;
  return list.filter((p) => [p.name, p.id, p.role, p.dept, p.section].join(' ').toLowerCase().includes(q));
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

/* ===================== 产出明细聚合（产能看板） ===================== */

const recordsOf = (records) => (Array.isArray(records) ? records : []);

/** 判断 YYYY-MM-DD 是否属于 yyyy-mm 月份 */
export function inMonth(date, ym) {
  return typeof date === 'string' && date.slice(0, 7) === ym;
}

/** 取某月份全部产出记录 */
export function monthRecords(records, ym) {
  return recordsOf(records).filter((r) => inMonth(r.date, ym));
}

/** 合计产量 */
export function sumQty(records) {
  return recordsOf(records).reduce((s, r) => s + (Number(r.qty) || 0), 0);
}

/**
 * 按指定字段分组汇总产量，返回降序数组 [{key,qty}]。
 * @param {string} field 'dept' | 'section' | 'line' | 'person'
 */
export function groupSum(records, field) {
  const map = new Map();
  for (const r of recordsOf(records)) {
    const key = (r[field] ?? '').toString().trim() || '未分配';
    map.set(key, (map.get(key) || 0) + (Number(r.qty) || 0));
  }
  return [...map.entries()]
    .map(([key, qty]) => ({ key, qty }))
    .sort((a, b) => b.qty - a.qty);
}

/** 整月各部门总产能（降序） */
export function deptMonthly(records, ym) {
  return groupSum(monthRecords(records, ym), 'dept');
}

/** 整月分工段产出（降序） */
export function sectionMonthly(records, ym) {
  return groupSum(monthRecords(records, ym), 'section').filter((x) => x.key !== '未分配');
}

/**
 * 个人产出月度排名（降序），合并花名册信息（部门/工段/照片字段）。
 * @returns {{name,dept,section,qty,person}[]}
 */
export function personRanking(records, ym, people = []) {
  const byName = new Map((Array.isArray(people) ? people : []).map((p) => [p.name, p]));
  return groupSum(monthRecords(records, ym), 'person')
    .map((x) => ({ name: x.key, qty: x.qty, person: byName.get(x.key) || null,
      dept: byName.get(x.key)?.dept || '', section: byName.get(x.key)?.section || '' }));
}

/**
 * 某线体在指定月份的逐日产能（补齐没有记录的日期为 0，跳过周末与月外日）。
 * @returns {{date,qty}[]}
 */
export function lineDaily(records, line, ym) {
  const [y, m] = ym.split('-').map(Number);
  const days = new Date(y, m, 0).getDate();
  const map = new Map();
  for (const r of monthRecords(records, ym)) {
    if (r.line !== line) continue;
    map.set(r.date, (map.get(r.date) || 0) + (Number(r.qty) || 0));
  }
  const out = [];
  for (let d = 1; d <= days; d++) {
    const date = `${ym}-${String(d).padStart(2, '0')}`;
    const wd = new Date(y, m - 1, d).getDay();
    if (wd === 0 || wd === 6) continue;
    out.push({ date, qty: map.get(date) || 0 });
  }
  return out;
}

/** 从记录中提取去重选项（如全部线体），按名称排序 */
export function distinctValues(records, field) {
  const set = new Set();
  for (const r of recordsOf(records)) {
    const v = (r[field] ?? '').toString().trim();
    if (v) set.add(v);
  }
  return [...set].sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));
}

/** 最近 N 个月份选项（yyyy-mm，含本月），索引 0 为本月 */
export function recentMonths(n = 6, now = new Date()) {
  const out = [];
  let y = now.getFullYear();
  let m = now.getMonth();
  for (let i = 0; i < n; i++) {
    out.push(`${y}-${String(m + 1).padStart(2, '0')}`);
    m -= 1;
    if (m < 0) { m = 11; y -= 1; }
  }
  return out;
}
