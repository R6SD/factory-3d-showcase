import React, { useState } from 'react';
import { EVENTS, dispatch } from '../../events.js';
import { ALARM_LEVEL_COLOR } from '../../data/selectors.js';

const LEVELS = ['critical', 'major', 'warning'];

function resolveRuntime(runtime) {
  if (runtime && typeof runtime.focusEquipment === 'function') return runtime;
  const exposed = typeof window !== 'undefined' ? window.__factorySceneRuntime : null;
  if (exposed && typeof exposed.focusEquipment === 'function') return exposed;
  return null;
}

function formatRaisedAt(ts, lang) {
  if (typeof ts !== 'number' || !Number.isFinite(ts)) return '';
  try {
    return new Date(ts).toLocaleTimeString(lang === 'en' ? 'en-GB' : 'zh-CN', { hour12: false });
  } catch {
    return '';
  }
}

function latestOpen(records) {
  let latest = null;
  for (const record of records) {
    if (!latest || record.raisedAt > latest.raisedAt) latest = record;
  }
  return latest;
}

/**
 * 底部告警事件条。点一条走 #41 的 EQUIPMENT_SELECT → focusEquipment，再 pulseEquipment。
 * 确认 / 清除要 stopPropagation，避免触发行点击。readOnly 时不能确认或清除。
 */
export function AlarmCenter({ log, onAck, onClear, runtime = null, t, lang = 'zh', readOnly = false }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState('open');
  const [levels, setLevels] = useState(() => new Set());
  const [missingId, setMissingId] = useState(null);
  const openRecords = Array.isArray(log?.open) ? log.open : [];
  const historyRecords = Array.isArray(log?.history) ? log.history : [];
  const latest = latestOpen(openRecords);
  const source = tab === 'history' ? historyRecords : openRecords;
  const rows = levels.size === 0 ? source : source.filter((record) => levels.has(record.level));
  const levelLabel = {
    critical: t.alarmCritical,
    major: t.alarmMajor,
    warning: t.alarmWarning,
  };

  function toggleLevel(level) {
    setLevels((current) => {
      const next = new Set(current);
      if (next.has(level)) next.delete(level);
      else next.add(level);
      return next;
    });
  }

  function selectAlarm(record) {
    dispatch(EVENTS.EQUIPMENT_SELECT, { id: record.deviceId });
    const resolved = resolveRuntime(runtime);
    const found = resolved?.focusEquipment?.(record.deviceId);
    resolved?.pulseEquipment?.(record.deviceId);
    setMissingId(found === false ? record.deviceId : null);
  }

  function onRowKeyDown(event, record) {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    selectAlarm(record);
  }

  return (
    <div className="alarm-center">
      {open && (
        <section className="alarm-panel" aria-label={t.alarmCenter}>
          <div className="alarm-panel-head">
            <div className="alarm-tabs" role="tablist">
              <button type="button" role="tab" className="alarm-tab" aria-selected={tab === 'open'} onClick={() => setTab('open')}>{t.alarmActive}</button>
              <button type="button" role="tab" className="alarm-tab" aria-selected={tab === 'history'} onClick={() => setTab('history')}>{t.alarmHistory}</button>
            </div>
            <div className="alarm-filters">
              <button type="button" className="alarm-filter" data-level="all" aria-pressed={levels.size === 0} onClick={() => setLevels(new Set())}>{t.alarmAll}</button>
              {LEVELS.map((level) => (
                <button
                  key={level}
                  type="button"
                  className="alarm-filter"
                  data-level={level}
                  aria-pressed={levels.has(level)}
                  onClick={() => toggleLevel(level)}
                >
                  <i style={{ background: ALARM_LEVEL_COLOR[level] }} />
                  {levelLabel[level]}
                </button>
              ))}
            </div>
          </div>
          <ul className="alarm-list">
            {rows.length === 0 && <li className="alarm-empty">{t.noAlarm}</li>}
            {rows.map((record) => {
              const color = ALARM_LEVEL_COLOR[record.level] || '#f59e0b';
              return (
                <li key={record.id}>
                  <div
                    className={`alarm-row${record.state === 'acked' ? ' is-acked' : ''}`}
                    role="button"
                    tabIndex={0}
                    data-alarm-id={record.id}
                    data-level={record.level}
                    data-state={record.state}
                    data-equipment-id={record.deviceId}
                    style={{ '--alarm-level': color }}
                    onClick={() => selectAlarm(record)}
                    onKeyDown={(event) => onRowKeyDown(event, record)}
                  >
                    <i className="alarm-level-dot" style={{ background: color }} />
                    <span className="alarm-main">
                      <span className="alarm-level-label">{levelLabel[record.level] || record.level}</span>
                      <span className="alarm-device">{record.deviceName}</span>
                      <span className="alarm-message">{record.message}</span>
                    </span>
                    <span className="alarm-meta">
                      <time className="alarm-time" dateTime={Number.isFinite(record.raisedAt) ? new Date(record.raisedAt).toISOString() : undefined}>{formatRaisedAt(record.raisedAt, lang)}</time>
                      {record.recoveredAt != null && <em className="alarm-recovered">{t.alarmRecovered}</em>}
                    </span>
                    {!readOnly && tab === 'open' && (
                      <span className="alarm-actions">
                        <button
                          type="button"
                          className="alarm-ack"
                          aria-disabled={record.state !== 'active'}
                          onClick={(event) => {
                            event.stopPropagation();
                            if (record.state !== 'active') return;
                            onAck?.(record.id);
                          }}
                        >
                          {t.alarmAck}
                        </button>
                        <button
                          type="button"
                          className="alarm-clear"
                          onClick={(event) => {
                            event.stopPropagation();
                            onClear?.(record.id);
                          }}
                        >
                          {t.alarmClear}
                        </button>
                      </span>
                    )}
                  </div>
                  {missingId === record.deviceId && <small className="device-list-missing">{t.notInModel}</small>}
                </li>
              );
            })}
          </ul>
        </section>
      )}
      <button type="button" className={`alarm-strip${open ? ' is-open' : ''}`} aria-expanded={open} aria-label={t.alarmCenter} onClick={() => setOpen((value) => !value)}>
        {latest ? (
          <>
            <i className="alarm-level-dot" style={{ background: ALARM_LEVEL_COLOR[latest.level] || '#f59e0b' }} />
            <span className="alarm-strip-text">
              <b>{latest.deviceName}</b>
              <span>{latest.message}</span>
            </span>
            <time className="alarm-strip-time" dateTime={new Date(latest.raisedAt).toISOString()}>{formatRaisedAt(latest.raisedAt, lang)}</time>
            <b className="alarm-strip-count">{openRecords.length}</b>
          </>
        ) : (
          <span className="alarm-strip-empty">{t.noAlarm}</span>
        )}
      </button>
    </div>
  );
}
