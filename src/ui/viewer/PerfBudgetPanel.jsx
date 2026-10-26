import React, { useEffect, useState } from 'react';
import { PERF_BUDGET, budgetFooter, budgetLevel, formatBudgetCount } from '../../scene/perf-budget.js';

/** 只读轮询。短于 500ms 会让面板变成变相的常驻渲染驱动，这里保持与原 FPS 面板相同的间隔。 */
const POLL_MS = 500;

const LEVEL_CLASS = { ok: 'good', warn: 'warn', bad: 'bad' };

function readStats() {
  const runtime = window.__factorySceneRuntime;
  return {
    fps: runtime?.getFps?.() ?? 0,
    perf: runtime?.getPerf?.() ?? null,
  };
}

/**
 * 三维页性能预算。工具条一键开关。
 * 文案沿用查看器里原性能面板 / 层级面板的中文，不另建文案表。
 * 轮询只调用 getFps / getPerf，不调用 setView / updateConfig，避免把按需渲染打脏。
 */
export function PerfBudgetPanel() {
  const [show, setShow] = useState(false);
  const [fps, setFps] = useState(0);
  const [perf, setPerf] = useState(null);

  useEffect(() => {
    if (!show) return undefined;
    const tick = () => {
      const next = readStats();
      setFps(next.fps);
      setPerf(next.perf);
    };
    tick();
    const handle = setInterval(tick, POLL_MS);
    return () => clearInterval(handle);
  }, [show]);

  const trisTotal = perf && typeof perf.trisTotal === 'number' ? perf.trisTotal : null;
  const calls = perf && typeof perf.calls === 'number' ? perf.calls : null;

  return (
    <>
      <button
        type="button"
        onClick={() => setShow((open) => !open)}
        className={`perf-toggle${show ? ' active' : ''}`}
        title="性能预算"
      >
        性能预算
      </button>
      {show && (
        <div className="perf-overlay">
          <Metric
            metric="fps"
            label={`帧率 · ≥${PERF_BUDGET.fpsMin}`}
            text={`${fps} FPS`}
            level={budgetLevel('fps', fps)}
          />
          <Metric
            metric="tris"
            label={`三角面（模型总量） · <${formatBudgetCount(PERF_BUDGET.trisWarn)} / <${formatBudgetCount(PERF_BUDGET.trisMax)}`}
            text={trisTotal == null ? null : String(trisTotal)}
            level={trisTotal == null ? null : budgetLevel('tris', trisTotal)}
          />
          <Metric
            metric="drawCalls"
            label={`绘制调用/帧 · <${PERF_BUDGET.drawCallsWarn} / <${PERF_BUDGET.drawCallsMax}`}
            text={calls == null ? null : String(calls)}
            level={calls == null ? null : budgetLevel('drawCalls', calls)}
          />
          <DiagnosticRows perf={perf} />
          <div className="perf-row"><span>{budgetFooter()}</span></div>
        </div>
      )}
    </>
  );
}

function Metric({ metric, label, text, level }) {
  return (
    <div className="perf-row" data-metric={metric}>
      <span>{label}</span>
      <b className={level ? LEVEL_CLASS[level] || '' : ''}>{text == null ? '—' : text}</b>
    </div>
  );
}

/**
 * 原 FPS 面板的四行，放在预算行下面。数值和「渲染/秒」的 good 与 main 相同，不走 budgetLevel。
 * 有跳帧时 good 只表示按需渲染在跳过空帧。三角面标签改成「每帧提交」，避免和模型总量混读。
 */
function DiagnosticRows({ perf }) {
  const present = Boolean(perf);
  return (
    <>
      <div className="perf-row" data-metric="rfs">
        <span>渲染/秒</span>
        <b className={present && perf.sfs > 0 ? 'good' : ''}>{present ? perf.rfs : '—'}</b>
      </div>
      <div className="perf-row" data-metric="sfs">
        <span>跳过/秒</span>
        <b>{present ? perf.sfs : '—'}</b>
      </div>
      <div className="perf-row" data-metric="trisFrame">
        <span>三角面（每帧提交）</span>
        <b>{present ? `${(perf.tris / 1000).toFixed(1)}k` : '—'}</b>
      </div>
      <div className="perf-row" data-metric="stereo">
        <span>立体模式</span>
        <b>{present ? perf.mode : '—'}</b>
      </div>
    </>
  );
}
