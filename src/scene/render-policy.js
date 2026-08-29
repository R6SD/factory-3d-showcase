/**
 * render-policy.js — 帧渲染 / 阴影更新的纯判定逻辑。
 *
 * 从 SceneRuntime 的帧循环中抽出，便于单元测试与回归守护。
 * 目标：画面真正会变时才提交 WebGL 渲染、模型真正在动时才重算阴影，
 * 让“静态查看 + 运动视差”场景在指针静止、视差收敛后回到空闲，避免 GPU 空转耗电。
 */

/** 视差阻尼收敛死区：当前偏移与目标偏移之差小于该值即视为已静止 */
export const PARALLAX_EPS = 1e-3;

/**
 * 运动视差是否已收敛静止。
 * 收敛 = 当前偏移已到达目标（鼠标静止时目标为 0 或某个固定值，阻尼不再产生位移）。
 * @param {number} curX 当前水平偏移
 * @param {number} curY 当前垂直偏移
 * @param {number} targetX 目标水平偏移
 * @param {number} targetY 目标垂直偏移
 * @param {number} [eps] 收敛死区
 * @returns {boolean} true 表示视差本帧不再产生可见位移
 */
export function parallaxSettled(curX, curY, targetX, targetY, eps = PARALLAX_EPS) {
  return Math.abs(curX - targetX) <= eps && Math.abs(curY - targetY) <= eps;
}

/**
 * 判定本帧是否需要提交一次 WebGL 渲染。
 *
 * 规则（任一成立即渲染）：
 *   1. needs        ：显式脏标记（交互、尺寸变化、模型切换、配置变更等离散事件）
 *   2. hasAnim      ：场景存在持续动画（骨骼/入场退出/昼夜/传送带等）
 *   3. dualEye      ：双目立体输出（视差屏障/并排/红蓝）维持连续渲染，避免分光闪烁
 *   4. 视差自动微摆 ：时间驱动的持续摆动，画面恒在变
 *   5. 视差未收敛    ：指针视差仍在阻尼运动中；收敛静止后不再因“视差开关开着”而空渲染
 *
 * @param {{needs?:boolean,hasAnim?:boolean,dualEye?:boolean,
 *          parallaxEnabled?:boolean,autoSway?:boolean,settled?:boolean}} s
 * @returns {boolean}
 */
export function shouldRenderFrame(s) {
  if (s.needs) return true;
  if (s.hasAnim) return true;
  if (s.dualEye) return true;
  if (s.parallaxEnabled && s.autoSway) return true;
  if (s.parallaxEnabled && !s.settled) return true;
  return false;
}

/**
 * 判定本帧是否需要重算阴影贴图。
 *
 * Three 的 shadowMap.autoUpdate=true 会每帧从光源视角把整个场景再渲染一遍；
 * 而阴影只取决于“模型几何 ↔ 光源”的相对关系，与相机轨道旋转、运动视差无关。
 * 因此仅在场景确有动画、或显式标记阴影脏（换模型/改光照阴影参数）时重算。
 *
 * @param {{hasAnim?:boolean,shadowDirty?:boolean}} s
 * @returns {boolean}
 */
export function shouldUpdateShadow(s) {
  return !!(s.hasAnim || s.shadowDirty);
}
