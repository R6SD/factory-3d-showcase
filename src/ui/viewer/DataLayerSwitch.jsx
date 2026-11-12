import React, { useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useApp } from '../../app-context.jsx';
import { statusColor } from '../../data/selectors.js';
import { LAYER_IDS, LAYERS, RAMP, layerRange, layerSpec } from '../../scene/data-layers.js';

const OPTIONS = [
  ['status', 'layerStatus'],
  ['temp', 'layerTemp'],
  ['vib', 'layerVib'],
  ['power', 'layerPower'],
];

function markLeft(value, range) {
  if (value == null || !(range.max > range.min)) return null;
  const t = (value - range.min) / (range.max - range.min);
  return `${Math.min(100, Math.max(0, t * 100))}%`;
}

/**
 * 工具栏上的数据图层分段按钮，portal 到 .view-actions。
 * 点当前项或点「状态」都回到状态色。非状态图层时在 viewer 左下角显示图例。
 */
export function DataLayerSwitch({ devices = [] }) {
  const { config, setConfig, t } = useApp();
  const [toolbar, setToolbar] = useState(null);
  const layer = LAYER_IDS.includes(config.scene?.dataLayer) ? config.scene.dataLayer : 'status';

  useLayoutEffect(() => {
    setToolbar(document.querySelector('.viewer .view-actions'));
  }, []);

  const choose = (id) => {
    const next = id === 'status' || id === layer ? 'status' : id;
    if (next === layer) return;
    setConfig((current) => ({
      ...current,
      scene: { ...current.scene, dataLayer: next },
    }));
  };

  const control = (
    <span className="data-layer-switch">
      <span className="data-layer-segments" role="group" aria-label={t.dataLayer}>
        {OPTIONS.map(([id, key]) => (
          <button
            key={id}
            type="button"
            className={layer === id ? 'active' : ''}
            aria-pressed={layer === id}
            onClick={() => choose(id)}
          >
            {t[key]}
          </button>
        ))}
      </span>
      <select className="data-layer-menu" aria-label={t.dataLayer} value={layer} onChange={(event) => choose(event.target.value)}>
        {OPTIONS.map(([id, key]) => <option key={id} value={id}>{t[key]}</option>)}
      </select>
    </span>
  );

  const spec = LAYERS[layer];
  let legend = null;
  if (spec) {
    const range = layerRange(devices, layer);
    const lo = markLeft(range.lo, range);
    const hi = markLeft(range.hi, range);
    const missing = devices.some((device) => layerSpec(device, layer)?.missing);
    const alarm = statusColor('alarm');
    const down = statusColor('down');
    legend = (
      <div className="layer-legend">
        <div className="layer-legend-meter">
          <div className="layer-legend-scale">
            <span>{range.min} {spec.unit}</span>
            <span>{range.max} {spec.unit}</span>
          </div>
          <div className="layer-legend-bar">
            <i className="layer-legend-ramp" style={{ background: `linear-gradient(90deg, ${RAMP.join(', ')})` }} />
            {lo != null && <i className="layer-legend-tick" style={{ left: lo }} data-tick="lo" />}
            {hi != null && <i className="layer-legend-tick" style={{ left: hi }} data-tick="hi" />}
          </div>
        </div>
        <p className="layer-legend-priority">
          <i style={{ background: alarm?.emissive }} />
          <i style={{ background: down?.emissive }} />
          <span>{t.layerPriority}</span>
        </p>
        {missing && (
          <p className="layer-legend-missing">
            <i />
            <span>{t.layerNoData}</span>
          </p>
        )}
      </div>
    );
  }

  return (
    <>
      {toolbar ? createPortal(control, toolbar) : control}
      {legend}
    </>
  );
}
