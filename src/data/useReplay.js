import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { alarmReducer, diffAlarms, EMPTY_LOG } from './alarm-log.js';
import { mergeDevicePatches } from './useLiveDevices.js';
import { HISTORY_MS, STEP_MS, frameAt, simulateHistory } from './sim-history.js';

function clampMs(ms) {
  const value = Number(ms);
  if (!Number.isFinite(value)) return 0;
  return Math.min(HISTORY_MS, Math.max(0, value));
}

function logAt(logs, stepMs, ms) {
  if (!logs.length) return EMPTY_LOG;
  let index = Math.floor(Number(ms) / stepMs);
  if (!Number.isFinite(index) || index < 0) index = 0;
  if (index >= logs.length) index = logs.length - 1;
  return logs[index];
}

function buildTimeline(baseDevices, history) {
  const logs = [];
  const marks = [];
  let log = EMPTY_LOG;
  const stepMs = history.stepMs || STEP_MS;
  for (let i = 0; i < history.frames.length; i += 1) {
    const devices = mergeDevicePatches(baseDevices, history.frames[i]);
    const at = i * stepMs;
    const actions = diffAlarms(log, devices, at);
    if (actions.some((action) => action.type === 'raise')) marks.push(at);
    for (const action of actions) log = alarmReducer(log, action);
    logs.push(log);
  }
  return { logs, marks };
}

/**
 * 回放状态。enabled 时按 baseDevices 生成一次历史；播放用 rAF，暂停不留回调。
 * 告警日志按帧预先算好，时间戳是模拟时间。
 */
export function useReplay(baseDevices, { enabled = false } = {}) {
  const built = useMemo(() => {
    if (!enabled) return { history: null, logs: [], marks: [] };
    const history = simulateHistory(baseDevices);
    const timeline = buildTimeline(baseDevices, history);
    return { history, logs: timeline.logs, marks: timeline.marks };
  }, [enabled, baseDevices]);

  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeedState] = useState(1);
  const tRef = useRef(0);
  const speedRef = useRef(1);

  useEffect(() => {
    if (enabled) return undefined;
    tRef.current = 0;
    setT(0);
    setPlaying(false);
    return undefined;
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !playing) return undefined;
    let alive = true;
    let raf = 0;
    let last = performance.now();
    const tick = (now) => {
      if (!alive) return;
      const dt = Math.max(0, now - last);
      last = now;
      const next = tRef.current + dt * speedRef.current;
      if (next >= HISTORY_MS) {
        tRef.current = HISTORY_MS;
        setT(HISTORY_MS);
        setPlaying(false);
        return;
      }
      tRef.current = next;
      setT(next);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
    };
  }, [enabled, playing]);

  const play = useCallback(() => {
    if (tRef.current >= HISTORY_MS) return;
    setPlaying(true);
  }, []);

  const pause = useCallback(() => {
    setPlaying(false);
  }, []);

  const setSpeed = useCallback((value) => {
    const next = Number(value);
    if (next !== 1 && next !== 2 && next !== 4) return;
    speedRef.current = next;
    setSpeedState(next);
  }, []);

  const seek = useCallback((ms) => {
    const next = clampMs(ms);
    tRef.current = next;
    setT(next);
    if (next >= HISTORY_MS) setPlaying(false);
  }, []);

  const devices = useMemo(() => {
    if (!enabled || !built.history) return mergeDevicePatches(baseDevices, {});
    return mergeDevicePatches(baseDevices, frameAt(built.history, t));
  }, [enabled, built, baseDevices, t]);

  const alarmsAt = useMemo(
    () => logAt(built.logs, built.history?.stepMs || STEP_MS, t),
    [built, t],
  );

  return {
    devices,
    t,
    playing,
    speed,
    play,
    pause,
    setSpeed,
    seek,
    alarmsAt,
    alarmMarks: built.marks,
  };
}
