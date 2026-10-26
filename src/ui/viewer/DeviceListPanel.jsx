import React, { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { EVENTS, dispatch, listen } from '../../events.js';
import { STATUS_ORDER, countByStatus, filterDevices, sortDevices, statusColor } from '../../data/selectors.js';

function resolveRuntime(runtime) {
  if (runtime && typeof runtime.setStatusFilter === 'function' && typeof runtime.focusEquipment === 'function') {
    return runtime;
  }
  const exposed = typeof window !== 'undefined' ? window.__factorySceneRuntime : null;
  if (exposed?.setStatusFilter && exposed?.focusEquipment) return exposed;
  return null;
}

/**
 * 设备统计条常驻，列表面板由工具栏开关。
 * 入参只收 devices 数组；点行仍走 EQUIPMENT_SELECT，再 focusEquipment。
 */
export function DeviceListPanel({ devices = [], selectedId = null, runtime = null, t, lang = 'zh' }) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState(null);
  const [sortKey, setSortKey] = useState('status');
  const [missingId, setMissingId] = useState(null);
  const [toolbar, setToolbar] = useState(null);
  const counts = useMemo(() => countByStatus(devices), [devices]);
  const rows = useMemo(() => sortDevices(filterDevices(devices, filter), sortKey), [devices, filter, sortKey]);

  useLayoutEffect(() => {
    setToolbar(document.querySelector('.viewer .view-actions'));
  }, []);

  useEffect(() => {
    const unsub = listen(EVENTS.ACTIVE_MODEL_CHANGE, () => {
      setFilter(null);
      setMissingId(null);
      resolveRuntime(runtime)?.setStatusFilter(null);
    });
    return () => {
      unsub();
      resolveRuntime(runtime)?.setStatusFilter(null);
    };
  }, [runtime]);

  useEffect(() => {
    if (!open || !selectedId) return;
    document.querySelector('.device-list-panel .device-list button.active')?.scrollIntoView?.({ block: 'nearest' });
  }, [open, selectedId, filter, sortKey, rows]);

  function applyFilter(status) {
    setFilter(status);
    resolveRuntime(runtime)?.setStatusFilter(status);
  }

  function toggleList() {
    if (!open) {
      setOpen(true);
      return;
    }
    setOpen(false);
    if (filter != null) applyFilter(null);
  }

  function selectDevice(id) {
    dispatch(EVENTS.EQUIPMENT_SELECT, { id });
    const found = resolveRuntime(runtime)?.focusEquipment(id);
    setMissingId(found === false ? id : null);
  }

  const labelOf = (status) => {
    const color = statusColor(status);
    if (!color) return status;
    return lang === 'en' ? color.labelEn : color.label;
  };

  const toggle = (
    <button
      type="button"
      className={`device-list-toggle${open ? ' active' : ''}`}
      aria-pressed={open}
      onClick={toggleList}
    >
      {t.deviceList}
    </button>
  );

  return (
    <>
      {toolbar ? createPortal(toggle, toolbar) : toggle}
      <div className={`device-status-bar${filter ? ' is-filtering' : ''}`}>
        <button
          type="button"
          className="device-status-all"
          aria-pressed={filter == null}
          onClick={() => applyFilter(null)}
        >
          {t.allStatus}
        </button>
        {STATUS_ORDER.map((status) => {
          const color = statusColor(status);
          const pressed = filter === status;
          return (
            <button
              key={status}
              type="button"
              className="device-status-pill"
              data-status={status}
              aria-pressed={pressed}
              onClick={() => applyFilter(pressed ? null : status)}
            >
              <i style={{ background: color.emissive }} />
              <span>{labelOf(status)}</span>
              <b>{counts[status]}</b>
            </button>
          );
        })}
      </div>
      {open && (
        <aside className="device-list-panel" aria-label={t.deviceList}>
          <label className="device-list-sort">
            {t.sortBy}
            <select aria-label={t.sortBy} value={sortKey} onChange={(event) => setSortKey(event.target.value)}>
              <option value="status">{t.sortStatus}</option>
              <option value="name">{t.sortName}</option>
              <option value="oee">{t.sortOee}</option>
            </select>
          </label>
          <ul className="device-list">
            {rows.map((device) => {
              const color = statusColor(device.status);
              const active = device.id === selectedId;
              return (
                <li key={device.id}>
                  <button
                    type="button"
                    className={active ? 'active' : ''}
                    data-equipment-id={device.id}
                    style={{ '--status': color?.emissive || '#93a8c8' }}
                    onClick={() => selectDevice(device.id)}
                  >
                    <i style={{ background: color?.emissive || '#93a8c8' }} />
                    <span className="device-list-name">{device.name}</span>
                    <span className="device-list-line">{device.line}</span>
                    <b className="device-list-oee">{device.kpi?.oee ?? '—'}</b>
                  </button>
                  {missingId === device.id && <small className="device-list-missing">{t.notInModel}</small>}
                </li>
              );
            })}
          </ul>
        </aside>
      )}
    </>
  );
}
