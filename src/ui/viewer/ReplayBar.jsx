import React, { useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { HISTORY_MS, STEP_MS } from '../../data/sim-history.js';

function formatClock(ms) {
  const total = Math.floor(Math.min(HISTORY_MS, Math.max(0, Number(ms) || 0)) / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/**
 * 工具栏「回放 / 回到实时」，以及回放时贴在事件条位置的时间轴。
 */
export function ReplayBar({
  active = false,
  playing = false,
  speed = 1,
  time = 0,
  marks = [],
  onEnter,
  onExit,
  onPlay,
  onPause,
  onSpeed,
  onSeek,
  copy,
}) {
  const [toolbar, setToolbar] = useState(null);

  useLayoutEffect(() => {
    setToolbar(document.querySelector('.viewer .view-actions'));
  }, []);

  const toggle = (
    <button
      type="button"
      className={`replay-toggle${active ? ' active' : ''}`}
      aria-pressed={active}
      onClick={active ? onExit : onEnter}
    >
      {active ? copy.replayLive : copy.replay}
    </button>
  );

  const clamped = Math.min(HISTORY_MS, Math.max(0, Number(time) || 0));

  return (
    <>
      {toolbar ? createPortal(toggle, toolbar) : toggle}
      {active && (
        <>
          <div className="replay-badge">{copy.replayBadge}</div>
          <div className="replay-bar">
            <button type="button" className="replay-play" onClick={playing ? onPause : onPlay}>
              {playing ? copy.replayPause : copy.replayPlay}
            </button>
            <select
              className="replay-speed"
              aria-label={copy.replaySpeed}
              value={String(speed)}
              onChange={(event) => onSpeed?.(Number(event.target.value))}
            >
              <option value="1">1×</option>
              <option value="2">2×</option>
              <option value="4">4×</option>
            </select>
            <label className="replay-track">
              <span className="replay-marks">
                {marks.map((mark) => (
                  <i
                    key={mark}
                    className="replay-mark"
                    style={{ left: `${(mark / HISTORY_MS) * 100}%` }}
                    data-at={mark}
                  />
                ))}
              </span>
              <input
                type="range"
                min={0}
                max={HISTORY_MS}
                step={STEP_MS}
                value={clamped}
                aria-label={copy.replayTimeline}
                onInput={(event) => onSeek?.(Number(event.target.value))}
              />
            </label>
            <span className="replay-time">{formatClock(clamped)} / {formatClock(HISTORY_MS)}</span>
            <button type="button" className="replay-live" onClick={onExit}>{copy.replayLive}</button>
          </div>
        </>
      )}
    </>
  );
}
