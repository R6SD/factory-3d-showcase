import React, { useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useApp } from '../../app-context.jsx';

const INTERVALS = [1000, 2000, 5000];

/**
 * 工具栏上的模拟开关和频率。单独挂到 .view-actions，避免和别的工具栏按钮挤在同一段 JSX 里。
 */
export function LiveSimControls() {
  const { config, setConfig, t } = useApp();
  const [toolbar, setToolbar] = useState(null);
  const simulate = config.scene?.simulate === true;
  const ms = INTERVALS.includes(config.scene?.simulateMs) ? config.scene.simulateMs : 2000;

  useLayoutEffect(() => {
    setToolbar(document.querySelector('.viewer .view-actions'));
  }, []);

  const toggle = () => setConfig((current) => ({
    ...current,
    scene: { ...current.scene, simulate: current.scene?.simulate !== true },
  }));

  const changeMs = (event) => {
    const next = Number(event.target.value);
    if (!INTERVALS.includes(next)) return;
    setConfig((current) => ({ ...current, scene: { ...current.scene, simulateMs: next } }));
  };

  const control = (
    <span className="live-sim">
      <button
        type="button"
        className={`live-sim-toggle${simulate ? ' active' : ''}`}
        aria-pressed={simulate}
        onClick={toggle}
      >
        {t.liveSim}
      </button>
      <select aria-label={t.liveSimInterval} value={String(ms)} onChange={changeMs}>
        <option value="1000">1s</option>
        <option value="2000">2s</option>
        <option value="5000">5s</option>
      </select>
    </span>
  );

  return toolbar ? createPortal(control, toolbar) : control;
}
