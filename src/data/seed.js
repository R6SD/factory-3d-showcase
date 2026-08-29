/**
 * seed.js — 业务数据默认种子与“实时”推演纯函数。
 *
 * 产能 / 场地 / 人员 / 组织原本写死在 React 组件里，这里沉淀为可持久化、可替换的数据集：
 * Electron 下由本地后端落盘到 userData/business.json；纯浏览器 dev 下回落 localStorage。
 * 后续接入 MES / IoT / HR 时，只需替换 repository 的数据来源，页面与 selectors 不变。
 */

export const BUSINESS_VERSION = 1;

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

/**
 * 默认业务数据。每次调用返回全新副本，避免多处共享同一份引用。
 */
export function createSeedBusiness() {
  return {
    version: BUSINESS_VERSION,
    updatedAt: new Date(0).toISOString(),
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
    people: [
      { id: 'E-1001', name: '王建国', role: '工厂总监', dept: '运营中心', site: '厂区 A', manager: '—', status: '在岗' },
      { id: 'E-1012', name: '张伟', role: '生产经理', dept: '制造一部', site: '厂区 A', manager: '王建国', status: '在岗' },
      { id: 'E-1038', name: '李敏', role: '质量工程师', dept: '质量部', site: '厂区 A', manager: '张伟', status: '在岗' },
      { id: 'E-1051', name: '陈浩', role: '设备主管', dept: '设备动力部', site: '厂区 B', manager: '王建国', status: '休息' },
    ],
  };
}

/** 兼容旧调用：返回种子副本 */
export function defaultBusiness() {
  return createSeedBusiness();
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

/** 规范化业务数据：缺字段时用种子补齐，保证页面永远拿到完整结构 */
export function normalizeBusiness(input) {
  const seed = createSeedBusiness();
  if (!input || typeof input !== 'object') return seed;
  return {
    ...seed,
    ...input,
    capacity: { ...seed.capacity, ...(input.capacity || {}) },
    sites: Array.isArray(input.sites) && input.sites.length ? input.sites : seed.sites,
    people: Array.isArray(input.people) && input.people.length ? input.people : seed.people,
    version: BUSINESS_VERSION,
  };
}
