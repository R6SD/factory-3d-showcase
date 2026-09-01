/**
 * seed.js — 业务数据默认种子与“实时”推演纯函数。
 *
 * 产能 / 场地 / 人员 / 组织沉淀为可持久化、可替换的数据集：
 * Electron 下由本地后端落盘到 userData/business.json；纯浏览器 dev 下回落 localStorage。
 * outputRecords 为逐日、逐人、逐线体的产出明细，是产能看板（月部门总产能/分工段/个人/线体日产能）的唯一数据源，
 * 后台 /admin 可手工编辑或由 Excel 导入。
 */

export const BUSINESS_VERSION = 2;

/** 设备状态配色（与界面一致，集中维护） */
export const DEVICE_COLORS = Object.freeze({
  running: '#34d399',
  idle: '#f6b957',
  fault: '#ff6b6b',
  maintain: '#6B9FFF',
});

/** 深拷贝工具（结构化数据，无函数/Date） */
function clone(v) {
  return JSON.parse(JSON.stringify(v));
}

/** 人员花名册：dept 部门 / section 工段 / line 线体 / manager 直属上级（姓名） */
function seedPeople() {
  return [
    { id: 'E-1001', name: '王建国', role: '工厂总监', dept: '运营中心', section: '', line: '', site: '厂区 A', manager: '—', status: '在岗' },
    { id: 'E-1012', name: '张伟', role: '生产经理', dept: '制造一部', section: '', line: '', site: '厂区 A', manager: '王建国', status: '在岗' },
    { id: 'E-1021', name: '周敏', role: '总装工段长', dept: '制造一部', section: '总装工段', line: '', site: '厂区 A', manager: '张伟', status: '在岗' },
    { id: 'E-1022', name: '赵磊', role: '总装工', dept: '制造一部', section: '总装工段', line: '总装线 A', site: '厂区 A', manager: '周敏', status: '在岗' },
    { id: 'E-1023', name: '孙丽', role: '总装工', dept: '制造一部', section: '总装工段', line: '总装线 A', site: '厂区 A', manager: '周敏', status: '在岗' },
    { id: 'E-1024', name: '钱进', role: '总装工', dept: '制造一部', section: '总装工段', line: '总装线 B', site: '厂区 A', manager: '周敏', status: '休息' },
    { id: 'E-1025', name: '吴昊', role: '总装工', dept: '制造一部', section: '总装工段', line: '总装线 B', site: '厂区 A', manager: '周敏', status: '在岗' },
    { id: 'E-1031', name: '李强', role: '机加工段长', dept: '制造一部', section: '机加工段', line: '', site: '厂区 A', manager: '张伟', status: '在岗' },
    { id: 'E-1032', name: '郑爽', role: '机加工', dept: '制造一部', section: '机加工段', line: '机加线 B', site: '厂区 A', manager: '李强', status: '在岗' },
    { id: 'E-1033', name: '冯涛', role: '机加工', dept: '制造一部', section: '机加工段', line: '机加线 B', site: '厂区 B', manager: '李强', status: '在岗' },
    { id: 'E-1038', name: '李敏', role: '质量工程师', dept: '质量部', section: '质检工段', line: '', site: '厂区 A', manager: '王建国', status: '在岗' },
    { id: 'E-1039', name: '王芳', role: '质检工', dept: '质量部', section: '质检工段', line: '质检线', site: '厂区 A', manager: '李敏', status: '在岗' },
    { id: 'E-1051', name: '陈浩', role: '设备主管', dept: '设备动力部', section: '设备维保', line: '', site: '厂区 B', manager: '王建国', status: '休息' },
    { id: 'E-1052', name: '许强', role: '维修工', dept: '设备动力部', section: '设备维保', line: '', site: '厂区 B', manager: '陈浩', status: '在岗' },
    { id: 'E-1061', name: '马磊', role: '仓管员', dept: '仓储中心', section: '仓储工段', line: '', site: '厂区 A', manager: '王建国', status: '在岗' },
  ];
}

/** 确定性字符串哈希 + 伪随机源（同一 日期+工号 永远得到同一产量，避免每次渲染跳动） */
function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function pad2(n) { return String(n).padStart(2, '0'); }

/** 个人日产出基准（件/天，按岗位） */
const DAILY_BASE = { 总装工: 285, 机加工: 240, 质检工: 340, 总装工段长: 70, 机加工段长: 60 };

/**
 * 生成近 N 个月（默认 6，含当月）逐日逐人产出明细，跳过周末。
 * 当月只生成到今天；往月整月生成，使趋势图与环比分析有数据支撑。
 * 每人每月有一个确定性的“月度状态系数”（0.92~1.06），保证环比有可解释的波动。
 */
function seedOutputRecords(people, now = new Date(), monthsBack = 5) {
  const records = [];
  for (let back = monthsBack; back >= 0; back--) {
    const monthStart = new Date(now.getFullYear(), now.getMonth() - back, 1);
    const year = monthStart.getFullYear();
    const month = monthStart.getMonth();
    const lastDay = back === 0 ? now.getDate() : new Date(year, month + 1, 0).getDate();
    for (let day = 1; day <= lastDay; day++) {
      const d = new Date(year, month, day);
      const wd = d.getDay();
      if (wd === 0 || wd === 6) continue;
      const date = `${year}-${pad2(month + 1)}-${pad2(day)}`;
      for (const p of people) {
        const base = DAILY_BASE[p.role];
        if (!base) continue;
        const monthRng = mulberry32(hashStr(date.slice(0, 7) + p.id));
        const monthFactor = 0.92 + monthRng() * 0.14;
        const rng = mulberry32(hashStr(date + p.id));
        const qty = Math.round(base * monthFactor * (0.85 + rng() * 0.3));
        records.push({ date, dept: p.dept, section: p.section || '', line: p.line || '', person: p.name, qty });
      }
    }
  }
  return records;
}

/**
 * 按月生成产量计划：每个工作日、每位有产出基准人员的基准量之和，再上浮一个确定性的目标系数（1.0~1.12）。
 * 计划略高于实际均值，使达成率呈现 90%~105% 的合理分布。
 */
function seedMonthlyPlans(people, now = new Date(), monthsBack = 5) {
  const plans = {};
  for (let back = monthsBack; back >= 0; back--) {
    const monthStart = new Date(now.getFullYear(), now.getMonth() - back, 1);
    const year = monthStart.getFullYear();
    const month = monthStart.getMonth();
    const lastDay = back === 0 ? now.getDate() : new Date(year, month + 1, 0).getDate();
    const ym = `${year}-${pad2(month + 1)}`;
    let workdays = 0;
    for (let day = 1; day <= lastDay; day++) {
      const wd = new Date(year, month, day).getDay();
      if (wd !== 0 && wd !== 6) workdays += 1;
    }
    const baseTotal = people.reduce((s, p) => s + (DAILY_BASE[p.role] || 0), 0);
    const rng = mulberry32(hashStr(ym + 'plan'));
    const targetFactor = 1.0 + rng() * 0.12;
    plans[ym] = Math.round(workdays * baseTotal * targetFactor);
  }
  return plans;
}

/**
 * 默认业务数据。每次调用返回全新副本，避免多处共享同一份引用。
 */
export function createSeedBusiness(now = new Date()) {
  const people = seedPeople();
  return {
    version: BUSINESS_VERSION,
    updatedAt: new Date(0).toISOString(),
    monthlyPlans: seedMonthlyPlans(people, now),
    capacity: {
      output: 16842,
      planned: 20500,
      oee: 78.4,
      availability: 85,
      performance: 92,
      online: 127,
      running: 102,
      idle: 18,
      fault: 4,
      maintain: 3,
      trend: [
        { t: '08:00', v: 62 }, { t: '10:00', v: 71 }, { t: '12:00', v: 68 },
        { t: '14:00', v: 82 }, { t: 'NOW', v: 86 },
      ],
      lines: [
        { id: 'line-a', name: '总装线 A', rate: 93, color: '#6EA8FF' },
        { id: 'line-b', name: '机加线 B', rate: 88, color: '#5b8cff' },
        { id: 'line-c', name: '总装线 C', rate: 61, color: '#f6b957' },
      ],
      anomalies: [
        { id: 'an-1', line: '总装线 C', kind: '停机', amount: '43 min', reason: '设备校准延迟' },
        { id: 'an-2', line: '机加线 B', kind: '质量', amount: '17 pcs', reason: '尺寸超差' },
      ],
    },
    sites: [
      { id: 'site-a', name: '厂区 A', parent: null, devices: 48, online: 46, people: 83, onDuty: 79, rate: 82 },
      { id: 'zone-mfg1', name: '制造一区', parent: 'site-a', devices: 22, online: 21, people: 40, onDuty: 38, rate: 84 },
      { id: 'line-a-site', name: '总装线 A', parent: 'site-a', devices: 12, online: 12, people: 21, onDuty: 21, rate: 93 },
      { id: 'line-c-site', name: '总装线 C', parent: 'site-a', devices: 10, online: 8, people: 19, onDuty: 17, rate: 61 },
      { id: 'zone-mach', name: '机加工区', parent: 'site-a', devices: 16, online: 15, people: 24, onDuty: 23, rate: 88 },
      { id: 'line-b-site', name: '机加线 B', parent: 'zone-mach', devices: 9, online: 9, people: 14, onDuty: 14, rate: 88 },
      { id: 'site-b', name: '厂区 B', parent: null, devices: 36, online: 33, people: 61, onDuty: 57, rate: 79 },
      { id: 'warehouse', name: '仓储中心', parent: null, devices: 14, online: 14, people: 22, onDuty: 20, rate: 96 },
    ],
    people,
    outputRecords: seedOutputRecords(people, now),
  };
}

const clampNum = (v, min, max) => Math.min(max, Math.max(min, v));
const jitter = (rng, v, pct, min, max, digits = 0) => {
  const next = v * (1 + (rng() - 0.5) * 2 * pct);
  const factor = 10 ** digits;
  return clampNum(Math.round(next * factor) / factor, min, max);
};

/**
 * 基于上一帧产能数据推演一帧“实时”数据（纯函数）。
 * @param {object} prev 上一帧 business.capacity
 * @param {() => number} [rng] 可注入随机源（测试用），默认 Math.random
 */
export function stepCapacity(prev, rng = Math.random) {
  const c = clone(prev);
  // 产量累积
  c.output = c.output + Math.round(40 + rng() * 90);
  delete c.rate; // 达成率由 selectors 按 output/planned 现算，避免冗余真值
  c.oee = jitter(rng, c.oee, 0.02, 60, 99, 1);
  c.availability = jitter(rng, c.availability, 0.015, 70, 100, 1);
  c.performance = jitter(rng, c.performance, 0.015, 70, 100, 1);
  // 设备状态在总数守恒下做小幅迁移
  const total = c.running + c.idle + c.fault + c.maintain;
  c.running = clampNum(c.running + (rng() > 0.5 ? 1 : -1), 0, total);
  c.idle = clampNum(total - c.running - c.fault - c.maintain, 0, total);
  c.online = total - c.fault;
  // 产线达成率小幅波动
  c.lines = c.lines.map((l) => ({ ...l, rate: jitter(rng, l.rate, 0.03, 40, 99, 0) }));
  // 分时趋势滚动：保留前四点，末点更新为当前节拍
  const beat = jitter(rng, c.trend[c.trend.length - 1]?.v ?? 80, 0.08, 45, 99, 0);
  const hhmm = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
  c.trend = [...c.trend.slice(-4), { t: hhmm, v: beat }];
  return c;
}

const PERSON_DEFAULTS = { role: '员工', dept: '未分配', section: '', line: '', site: '', manager: '—', status: '在岗', photo: '', photoHalf: '' };

function normalizePerson(p) {
  return { ...PERSON_DEFAULTS, ...p };
}

function normalizeRecord(r) {
  return {
    date: String(r.date ?? ''),
    dept: String(r.dept ?? ''),
    section: String(r.section ?? ''),
    line: String(r.line ?? ''),
    person: String(r.person ?? ''),
    qty: Number(r.qty) || 0,
  };
}

/** 规范化业务数据：缺字段时用种子补齐，保证页面永远拿到完整结构 */
export function normalizeBusiness(input) {
  const seed = createSeedBusiness();
  if (!input || typeof input !== 'object') return seed;
  return {
    ...seed,
    ...input,
    capacity: { ...seed.capacity, ...(input.capacity || {}) },
    sites: Array.isArray(input.sites) && input.sites.length ? input.sites : seed.sites,
    monthlyPlans: { ...seed.monthlyPlans, ...(input.monthlyPlans || {}) },
    people: (Array.isArray(input.people) && input.people.length ? input.people : seed.people).map(normalizePerson),
    outputRecords: Array.isArray(input.outputRecords) ? input.outputRecords.map(normalizeRecord) : seed.outputRecords,
    version: BUSINESS_VERSION,
  };
}
