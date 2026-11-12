import React from 'react';

function stopName(stop, t) {
  if (!stop) return '';
  if (stop.id === 'overview') return t.tourOverview;
  return stop.label || '';
}

/**
 * 工具栏上的巡检按钮。运行时在按钮旁放暂停/继续、停止和「i/N 视点名」。
 */
export function TourControls({
  phase = 'idle',
  index = 0,
  stops = [],
  onStart,
  onPause,
  onResume,
  onStop,
  t,
}) {
  const running = phase === 'flying' || phase === 'dwelling' || phase === 'paused';
  const stop = stops[index] || null;
  const total = stops.length;
  return (
    <>
      <button type="button" className="tour-toggle" aria-pressed={running} onClick={running ? undefined : onStart}>
        {t.tour}
      </button>
      {running && (
        <div className="tour-bar" role="group" aria-label={t.tour}>
          {phase === 'paused'
            ? <button type="button" onClick={onResume}>{t.tourResume}</button>
            : <button type="button" onClick={onPause}>{t.tourPause}</button>}
          <button type="button" onClick={onStop}>{t.tourStop}</button>
          <span className="tour-stop">{index + 1}/{total} {stopName(stop, t)}</span>
          {phase === 'paused' && <span className="tour-paused">{t.tourPaused}</span>}
        </div>
      )}
    </>
  );
}
