import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createSimulatedFeed } from './device-feed.js';

/**
 * 把内存里的实时 patch 叠到台账设备上。
 * 没有 patch 的设备保持原引用；不修改入参数组。
 */
export function mergeDevicePatches(devices, patches) {
  const list = Array.isArray(devices) ? devices : [];
  const map = patches && typeof patches === 'object' ? patches : {};
  return list.map((device) => {
    if (!device || device.id == null) return device;
    const patch = map[device.id];
    if (!patch || typeof patch !== 'object') return device;
    const hasStatus = Object.prototype.hasOwnProperty.call(patch, 'status');
    const hasKpi = !!patch.kpi && typeof patch.kpi === 'object';
    const hasAlarm = Object.prototype.hasOwnProperty.call(patch, 'alarm');
    if (!hasStatus && !hasKpi && !hasAlarm) return device;
    return {
      ...device,
      ...(hasStatus ? { status: patch.status } : null),
      ...(hasKpi ? { kpi: { ...device.kpi, ...patch.kpi } } : null),
      ...(hasAlarm ? { alarm: patch.alarm } : null),
    };
  });
}

/**
 * 模拟开关。enabled 变为 false 或卸载时 stop、取消订阅，并丢掉覆盖层，界面回到台账。
 * baseDevices 换成新数组时重建 feed。实时值只留在这份 state 里。
 */
export function useLiveDevices(baseDevices, { enabled = false, intervalMs = 2000 } = {}) {
  const [patches, setPatches] = useState({});
  const [faulted, setFaulted] = useState(() => new Set());
  const feedRef = useRef(null);
  const intervalRef = useRef(intervalMs || 2000);
  const skipIntervalReset = useRef(true);
  intervalRef.current = intervalMs || 2000;

  const devices = useMemo(
    () => mergeDevicePatches(baseDevices, enabled ? patches : {}),
    [baseDevices, patches, enabled],
  );

  useEffect(() => {
    if (!enabled) {
      setPatches({});
      setFaulted(new Set());
      return undefined;
    }
    setPatches({});
    setFaulted(new Set());
    let alive = true;
    const feed = createSimulatedFeed(baseDevices, { intervalMs: intervalRef.current });
    feedRef.current = feed;
    const unsubscribe = feed.subscribe((next) => {
      if (alive) setPatches(next);
    });
    feed.start();
    return () => {
      alive = false;
      feed.stop();
      unsubscribe();
      if (feedRef.current === feed) feedRef.current = null;
    };
  }, [enabled, baseDevices]);

  useEffect(() => {
    if (skipIntervalReset.current) {
      skipIntervalReset.current = false;
      return undefined;
    }
    feedRef.current?.setIntervalMs(intervalRef.current);
  }, [intervalMs]);

  const injectFault = useCallback((id) => {
    if (!feedRef.current || id == null || id === '') return;
    feedRef.current.injectFault(id);
    setFaulted((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);

  const clearFault = useCallback((id) => {
    if (!feedRef.current || id == null || id === '') return;
    feedRef.current.clearFault(id);
    setFaulted((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  return { devices, injectFault, clearFault, faulted };
}
