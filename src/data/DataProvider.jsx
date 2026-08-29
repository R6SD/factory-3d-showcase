import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { businessRepository } from './repository.js';
import { stepCapacity } from './seed.js';

/**
 * DataProvider — 全应用业务数据上下文。
 * 启动时经 repository 加载（Electron 后端 / 浏览器 localStorage），并订阅其变更。
 */
const DataCtx = createContext(null);

export function DataProvider({ children }) {
  const [data, setData] = useState(businessRepository.data);
  const [loading, setLoading] = useState(!businessRepository.ready);
  const [source, setSource] = useState(businessRepository.source);

  useEffect(() => {
    let alive = true;
    businessRepository
      .init()
      .then((d) => { if (alive) { setData(d); setSource(businessRepository.getSource()); setLoading(false); } })
      .catch(() => { if (alive) setLoading(false); });
    const unsub = businessRepository.subscribe((d) => alive && setData({ ...d }));
    return () => { alive = false; unsub(); };
  }, []);

  const save = useCallback((mutator) => businessRepository.save(mutator), []);
  const reset = useCallback(() => businessRepository.reset(), []);
  const patchCollection = useCallback(
    (key, updater) => businessRepository.save((d) => ({
      ...d,
      [key]: typeof updater === 'function' ? updater(d[key]) : updater,
    })),
    [],
  );
  const refreshCapacity = useCallback(
    () => businessRepository.save((d) => ({ ...d, capacity: stepCapacity(d.capacity) })),
    [],
  );

  return (
    <DataCtx.Provider value={{ data, loading, source, save, reset, patchCollection, refreshCapacity }}>
      {children}
    </DataCtx.Provider>
  );
}

export function useBusiness() {
  const ctx = useContext(DataCtx);
  if (!ctx) throw new Error('useBusiness 必须在 <DataProvider> 内使用');
  return ctx;
}
