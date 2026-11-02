import React, { useContext, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Ctx } from '../../app-context.jsx';
import { PERF_BUDGET, budgetFooter, budgetLevel, formatBudgetCount } from '../../scene/perf-budget.js';
import { viewerCopyFor } from '../viewer-strings.js';

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
 * 文案走 viewerCopy（zh/en），不引入 i18n 框架。无上下文时用中文，方便单测直接挂载。
 * 轮询只调用 getFps / getPerf，不调用 setView / updateConfig，避免把按需渲染打脏。
 */
export function PerfBudgetPanel() {
  const app = useContext(Ctx);
  const copy = viewerCopyFor(app?.config?.language);
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
  // 按钮留在工具条里。工具条有 transform，会变成 absolute 的包含块，
  // 面板若留在里面，top:82px 会落到视口下面并被 .viewer-page 裁掉。
  // 挂到 .viewer 上，这条定位才是相对三维区域的左上角。
  const host = typeof document !== 'undefined' ? document.querySelector('.viewer') : null;
  const overlay = (
    <div className="perf-overlay">
      <Metric
        metric="fps"
        label={`${copy.perfFps} · ≥${PERF_BUDGET.fpsMin}`}
        text={`${fps} FPS`}
        level={budgetLevel('fps', fps)}
      />
      <Metric
        metric="tris"
        label={`${copy.perfTrisTotal} · <${formatBudgetCount(PERF_BUDGET.trisWarn)} / <${formatBudgetCount(PERF_BUDGET.trisMax)}`}
        text={trisTotal == null ? null : String(trisTotal)}
        level={trisTotal == null ? null : budgetLevel('tris', trisTotal)}
      />
      <Metric
        metric="drawCalls"
        label={`${copy.perfCalls} · <${PERF_BUDGET.drawCallsWarn} / <${PERF_BUDGET.drawCallsMax}`}
        text={calls == null ? null : String(calls)}
        level={calls == null ? null : budgetLevel('drawCalls', calls)}
      />
      <DiagnosticRows perf={perf} copy={copy} />
      <div className="perf-row"><span>{budgetFooter(PERF_BUDGET, { prefix: copy.perfFooterPrefix, comfort: copy.perfComfort, cap: copy.perfCap })}</span></div>
    </div>
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setShow((open) => !open)}
        className={`perf-toggle${show ? ' active' : ''}`}
        title={copy.perfBudget}
      >
        {copy.perfBudget}
      </button>
      {show && (host ? createPortal(overlay, host) : overlay)}
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
function DiagnosticRows({ perf, copy }) {
  const present = Boolean(perf);
  return (
    <>
      <div className="perf-row" data-metric="rfs">
        <span>{copy.perfRender}</span>
        <b className={present && perf.sfs > 0 ? 'good' : ''}>{present ? perf.rfs : '—'}</b>
      </div>
      <div className="perf-row" data-metric="sfs">
        <span>{copy.perfSkip}</span>
        <b>{present ? perf.sfs : '—'}</b>
      </div>
      <div className="perf-row" data-metric="trisFrame">
        <span>{copy.perfTrisFrame}</span>
        <b>{present ? `${(perf.tris / 1000).toFixed(1)}k` : '—'}</b>
      </div>
      <div className="perf-row" data-metric="stereo">
        <span>{copy.perfStereo}</span>
        <b>{present ? perf.mode : '—'}</b>
      </div>
    </>
  );
}
