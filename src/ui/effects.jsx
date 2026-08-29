/**
 * 零第三方依赖的界面动效组件：
 * - useCountUp / NumberTicker：数值缓动滚动（KPI 数字）
 * - RingProgress：纯 SVG 环形进度（利用率/达成率）
 * - Meteors：纯 CSS 流星氛围背景（参考 Magic UI 思路自实现，不引入 framer-motion / Tailwind）
 * 缓动与几何计算放在 ./fx-utils，组件只负责渲染与 rAF 调度。
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { easeOutCubic, tweenValue, ringDash, prefersReducedMotion } from './fx-utils.js';

const intFmt = (n) => Math.round(n).toLocaleString('en-US');

/**
 * 数值补间 hook：target 变化时从“当前显示值”平滑过渡到新目标，切换数据不跳变。
 * @param {number} target 目标数值
 * @param {{duration?:number, format?:(n:number)=>string, ease?:(t:number)=>number}} opts
 */
export function useCountUp(target, { duration = 800, format = intFmt, ease = easeOutCubic } = {}) {
  const curRef = useRef(Number(target) || 0);
  const [display, setDisplay] = useState(Number(target) || 0);

  useEffect(() => {
    const to = Number(target);
    if (!Number.isFinite(to)) return;
    if (prefersReducedMotion() || !(duration > 0)) {
      curRef.current = to;
      setDisplay(to);
      return;
    }
    const from = curRef.current;
    const start = performance.now();
    let raf = 0;
    const step = (now) => {
      const elapsed = now - start;
      const v = tweenValue(from, to, elapsed, duration, ease);
      curRef.current = v;
      setDisplay(v);
      if (elapsed < duration) raf = requestAnimationFrame(step);
      else { curRef.current = to; setDisplay(to); }
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, duration]);

  return format(Number(display));
}

/** 数字滚动文本；format 决定千分位/小数/百分号等显示形态。 */
export function NumberTicker({ value, format, duration = 800, className = '' }) {
  const text = useCountUp(value, { duration, format });
  return <span className={className}>{text}</span>;
}

/**
 * 环形进度（纯 SVG）。
 * @param {number} value 0~100 的百分比
 * @param {[number,number]} size 直径、描边宽度
 */
export function RingProgress({
  value, size = 72, stroke = 6, color = '#6EA8FF',
  track = 'rgba(120,160,230,.16)', label, children, className = '',
}) {
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const { dash, filled } = ringDash((Number(value) || 0) / 100, circumference);
  return (
    <span className={`ring-progress ${className}`} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        <circle
          className="ring-progress-bar" cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={dash}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <span className="ring-center">{children ?? label ?? `${Math.round(filled * 100)}%`}</span>
    </span>
  );
}

// 稳定的 [0,1) 伪随机：同一 (index,salt) 永远得到同一值，避免重渲染时流星位置抖动
function seeded(i, salt) {
  const x = Math.sin((i + 1) * 127.1 + salt * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/** 流星氛围层：absolute 铺满父容器、不拦截指针；动态由 CSS keyframes 驱动。 */
export function Meteors({ count = 14, className = '' }) {
  const items = useMemo(() => Array.from({ length: count }, (_, i) => ({
    key: i,
    left: Math.round(seeded(i, 0) * 120 - 10) / 1,          // -10% ~ 110%
    delay: Math.round(seeded(i, 1) * 11 * 100) / 100,       // 0 ~ 11s
    duration: Math.round((4 + seeded(i, 2) * 6) * 100) / 100, // 4 ~ 10s
    px: 1 + Math.round(seeded(i, 3) * 2),                   // 1 ~ 3px
  })), [count]);

  return (
    <span className={`fx-meteors ${className}`} aria-hidden="true">
      {items.map((m) => (
        <span
          key={m.key}
          className="fx-meteor"
          style={{
            left: `${m.left}%`,
            width: m.px,
            height: m.px,
            animationDelay: `${m.delay}s`,
            animationDuration: `${m.duration}s`,
          }}
        />
      ))}
    </span>
  );
}
