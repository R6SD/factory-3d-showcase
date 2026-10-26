import React from 'react';
import { X } from 'lucide-react';
import { statusColor } from '../../data/selectors.js';

/**
 * 设备详情侧栏。数据来自 selectors，不读 Three 内部状态。
 * 关闭只清选择；状态着色由 SceneRuntime 保持，直到离开三维页或换模型。
 */
export function DeviceDetailPanel({ device, onClose, lang = 'zh' }) {
  if (!device) return null;
  const color = statusColor(device.status);
  const label = (lang === 'en' ? color?.labelEn : color?.label) || (lang === 'en' ? 'Unknown' : '未知');
  const kpi = device.kpi || {};
  const fmt = (value, suffix = '') => (value == null || value === '' ? '—' : `${value}${suffix}`);
  return (
    <div className="device-detail-panel" role="dialog" aria-label="设备详情" data-equipment-id={device.id || ''}>
      <div className="device-detail-head">
        <b>设备详情</b>
        <button type="button" onClick={onClose} aria-label="关闭设备详情"><X size={14} /></button>
      </div>
      <h3>{device.name || device.id}</h3>
      <p className="device-detail-line">{device.line || '—'}</p>
      <span className={`device-status-badge status-${device.status || 'unknown'}`} style={{ '--status': color?.emissive || '#93a8c8' }}>{label}</span>
      <dl className="device-kpis">
        <div><dt>OEE</dt><dd>{fmt(kpi.oee, '%')}</dd></div>
        <div><dt>产量</dt><dd>{fmt(kpi.throughput)}</dd></div>
        <div><dt>温度</dt><dd>{fmt(kpi.temp, '°C')}</dd></div>
      </dl>
      {device.alarm
        ? <p className="device-alarm"><b>{device.alarm.code}</b> {device.alarm.message}</p>
        : <p className="device-alarm quiet">无活动告警</p>}
    </div>
  );
}
