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

/**
 * 设备运行状态色。侧栏徽章、统计条与场景几何共用这一份，不要在 UI 里另写一套。
 * alarm 琥珀，down 红且压 albedo，idle 蓝，normal 翠绿低强度。维护态不在本映射里。
 */
const EQUIPMENT_STATUS_COLOR = Object.freeze({
  alarm: Object.freeze({ status: 'alarm', label: '异常', labelEn: 'Alarm', emissive: '#f59e0b', emissiveIntensity: 0.75, albedoScale: 1 }),
  down: Object.freeze({ status: 'down', label: '离线', labelEn: 'Offline', emissive: '#ef4444', emissiveIntensity: 0.55, albedoScale: 0.45 }),
  idle: Object.freeze({ status: 'idle', label: '待机', labelEn: 'Idle', emissive: '#60a5fa', emissiveIntensity: 0.3, albedoScale: 0.8 }),
  normal: Object.freeze({ status: 'normal', label: '运行', labelEn: 'Running', emissive: '#22c55e', emissiveIntensity: 0.28, albedoScale: 1 }),
});

/** 统计条和列表的固定顺序：异常优先。 */
export const STATUS_ORDER = ['alarm', 'down', 'idle', 'normal'];

/** @returns {{status,label,labelEn,emissive,emissiveIntensity,albedoScale}|null} */
export function statusColor(status) {
  return EQUIPMENT_STATUS_COLOR[status] || null;
}

/** 四态计数。未知状态不计。缺省返回全 0。 */
export function countByStatus(devices) {
  const counts = { alarm: 0, down: 0, idle: 0, normal: 0 };
  if (!Array.isArray(devices)) return counts;
  for (const device of devices) {
    const status = device?.status;
    if (Object.prototype.hasOwnProperty.call(counts, status)) counts[status] += 1;
  }
  return counts;
}

/** status 为 null 时返回原数组；否则只留该状态。 */
export function filterDevices(devices, status) {
  const list = Array.isArray(devices) ? devices : [];
  if (status == null) return list;
  return list.filter((device) => device?.status === status);
}

/** 不改原数组。status 按 STATUS_ORDER，相同再按名称；oee 从高到低。 */
export function sortDevices(devices, key = 'status') {
  const list = Array.isArray(devices) ? devices.slice() : [];
  const rank = (status) => {
    const index = STATUS_ORDER.indexOf(status);
    return index === -1 ? STATUS_ORDER.length : index;
  };
  const byName = (a, b) => String(a?.name || '').localeCompare(String(b?.name || ''), 'zh');
  list.sort((a, b) => {
    if (key === 'name') return byName(a, b);
    if (key === 'oee') return ((Number(b?.kpi?.oee) || 0) - (Number(a?.kpi?.oee) || 0)) || byName(a, b);
    return (rank(a?.status) - rank(b?.status)) || byName(a, b);
  });
  return list;
}

/** 设备台账。缺省或没有 devices 时返回空数组。数据可替换为 IoT 订阅。 */
export function listDevices(business) {
  const list = business?.devices;
  return Array.isArray(list) ? list : [];
}

/** 按 id 取一台设备；没有则 null。 */
export function getDevice(business, id) {
  if (id == null || id === '') return null;
  return listDevices(business).find((device) => device.id === id) || null;
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

/** 上一个月（yyyy-mm） */
export function prevMonth(ym) {  const [y, m] = String(ym || '').split('-').map(Number);
  if (!y || !m) return '';
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** 近 N 个月每月总产出，按时间升序返回 [{ym,qty}]，供趋势图使用 */
export function monthTrend(records, months) {
  const list = Array.isArray(months) ? months : [];
  return list
    .map((ym) => ({ ym, qty: sumQty(monthRecords(records, ym)) }))
    .reverse();
}

/** 某月份产出概览：总量 / 参与人数 / 有效工作日 / 日均 / 人均 */
export function monthStats(records, ym) {
  const recs = monthRecords(records, ym);
  const people = new Set(recs.map((r) => (r.person || '').trim()).filter(Boolean));
  const days = new Set(recs.map((r) => (r.date || '').trim()).filter(Boolean));
  const qty = sumQty(recs);
  return {
    qty,
    people: people.size,
    days: days.size,
    avgPerDay: days.size ? Math.round(qty / days.size) : 0,
    avgPerPerson: people.size ? Math.round(qty / people.size) : 0,
  };
}

/**
 * 计划达成率：实际产量 / 月计划（%，保留 1 位小数）。
 * @returns {number|null} 无计划或计划为 0 时返回 null。
 */
export function monthPlanAttainment(records, monthlyPlans, ym) {
  const plan = (monthlyPlans || {})[ym];
  if (!plan || plan <= 0) return null;
  const actual = sumQty(monthRecords(records, ym));
  return Math.round((actual / plan) * 1000) / 10;
}

/**
 * 分组汇总并附环比：与上一月同 key 对比。
 * @returns [{key,qty,prevQty,delta,pct}] pct 为环比百分比（上期为 0 时为 null），降序。
 */
export function groupSumWithDelta(records, field, ym) {
  const cur = groupSum(monthRecords(records, ym), field);
  const prev = new Map(groupSum(monthRecords(records, prevMonth(ym)), field).map((x) => [x.key, x.qty]));
  return cur.map((x) => {
    const prevQty = prev.get(x.key) || 0;
    const delta = x.qty - prevQty;
    const pct = prevQty ? Math.round((delta / prevQty) * 1000) / 10 : null;
    return { ...x, prevQty, delta, pct };
  });
}

/** 按部门筛选记录（部门→工段→个人下钻用）；dept 为空时返回原列表 */
export function recordsOfDept(records, dept) {
  const d = (dept || '').trim();
  if (!d) return recordsOf(records);
  return recordsOf(records).filter((r) => (r.dept ?? '').toString().trim() === d);
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
