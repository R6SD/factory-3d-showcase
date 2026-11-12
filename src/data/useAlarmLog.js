import { useCallback, useEffect, useReducer, useRef } from 'react';
import { alarmReducer, diffAlarms, EMPTY_LOG } from './alarm-log.js';

function readNow(now) {
  return typeof now === 'function' ? now() : Date.now();
}

/**
 * 实时告警日志。devices 变化时用 diffAlarms 逐条 dispatch。
 * source 留给 #71：回放快照接管时跳过 diff，原样返回这份 log，
 * 不改内存里的实时记录。本模块不做回放。
 * @param {Array|undefined} devices
 * @param {{ now?: () => number, source?: { open: unknown[], history: unknown[] }|null }} [options]
 * @returns {{ log: { open: unknown[], history: unknown[] }, ack: (id: string) => void, clear: (id: string) => void, clearAll: (level?: string) => void }}
 */
export function useAlarmLog(devices, { now = Date.now, source = null } = {}) {
  const [log, dispatch] = useReducer(alarmReducer, EMPTY_LOG);
  const logRef = useRef(log);
  logRef.current = log;
  const nowRef = useRef(now);
  nowRef.current = now;
  const sourceRef = useRef(source);
  sourceRef.current = source;
  const live = source == null;

  useEffect(() => {
    if (!live) return undefined;
    const actions = diffAlarms(logRef.current, devices, readNow(nowRef.current));
    for (const action of actions) dispatch(action);
    return undefined;
  }, [devices, live]);

  const ack = useCallback((id) => {
    if (sourceRef.current != null) return;
    dispatch({ type: 'ack', id, at: readNow(nowRef.current) });
  }, []);

  const clear = useCallback((id) => {
    if (sourceRef.current != null) return;
    dispatch({ type: 'clear', id, at: readNow(nowRef.current) });
  }, []);

  const clearAll = useCallback((level) => {
    if (sourceRef.current != null) return;
    const at = readNow(nowRef.current);
    const open = logRef.current?.open || [];
    for (const record of open) {
      if (level != null && record.level !== level) continue;
      dispatch({ type: 'clear', id: record.id, at });
    }
  }, []);

  return {
    log: source != null ? source : log,
    ack,
    clear,
    clearAll,
  };
}
