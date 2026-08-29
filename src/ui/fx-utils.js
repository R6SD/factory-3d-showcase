/**
 * 界面动效纯函数：缓动、数值补间、环形进度几何。
 * 零第三方依赖，供 React 动效组件（src/ui/effects.jsx）与单元测试共用，
 * 避免把缓动/几何逻辑散落在组件里导致测试只能复制实现。
 */

/** 将输入夹在 [0,1]；非数值按 0 处理，避免 NaN 进入渲染。 */
export function clamp01(t) {
  const n = Number(t);
  if (!Number.isFinite(n)) return 0;
  return n <= 0 ? 0 : n >= 1 ? 1 : n;
}

/** 三次方缓出：起步快、收尾稳，适合数字跳动与进度变化。 */
export function easeOutCubic(t) {
  const x = clamp01(t);
  return 1 - Math.pow(1 - x, 3);
}

/** 指数缓出：更快进入平台期，用于需要“迅速到位”的数值。 */
export function easeOutExpo(t) {
  const x = clamp01(t);
  return x >= 1 ? 1 : 1 - Math.pow(2, -10 * x);
}

/**
 * 从 from 到 to 的补间值。
 * @param {number} from 起始值
 * @param {number} to 目标值
 * @param {number} elapsed 已进行时长（毫秒）
 * @param {number} duration 总时长（毫秒）；<=0 时直接返回目标值
 * @param {(t:number)=>number} ease 缓动函数，默认三次缓出
 */
export function tweenValue(from, to, elapsed, duration = 800, ease = easeOutCubic) {
  const a = Number(from);
  const b = Number(to);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return Number.isFinite(b) ? b : 0;
  if (!(duration > 0)) return b;
  const p = clamp01(elapsed / duration);
  return a + (b - a) * ease(p);
}

/**
 * 环形进度的描边参数。
 * @param {number} value 0~1 的完成比例（越界自动夹取）
 * @param {number} circumference 圆环周长 2πr
 * @returns {{dash:string, filled:number}} SVG stroke-dasharray 与夹取后的比例
 */
export function ringDash(value, circumference) {
  const filled = clamp01(value);
  const c = Number(circumference) > 0 ? Number(circumference) : 0;
  return { dash: `${(filled * c).toFixed(3)} ${c.toFixed(3)}`, filled };
}

/** 当前系统是否偏好“减少动态效果”；SSR/测试环境无 matchMedia 时返回 false。 */
export function prefersReducedMotion() {
  return typeof matchMedia !== 'undefined' &&
    typeof matchMedia === 'function' &&
    matchMedia('(prefers-reduced-motion: reduce)')?.matches === true;
}
