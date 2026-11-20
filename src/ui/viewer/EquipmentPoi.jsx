import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useApp } from '../../app-context.jsx';
import { statusColor } from '../../data/selectors.js';
import { EVENTS, dispatch } from '../../events.js';

/**
 * 设备头顶铭牌。锚点由运行时投影到屏幕，直接写 DOM transform，不走 React 重渲染。
 * 挂在 .viewer 里，作为 .three 的兄弟节点。
 */
export function EquipmentPoi({ devices = [], runtime = null, visible = true, selectedId = null, lang = 'zh' }) {
  const nodes = useRef(new Map());

  useEffect(() => {
    if (!runtime || typeof runtime.subscribeFrame !== 'function') return undefined;
    const update = (rt) => {
      nodes.current.forEach((el, id) => {
        if (!el) return;
        const anchor = rt.equipmentAnchor(id);
        if (!anchor) {
          el.hidden = true;
          return;
        }
        const screen = rt.projectToScreen(anchor);
        if (!screen || screen.visible !== true) {
          el.hidden = true;
          return;
        }
        el.hidden = false;
        el.dataset.placed = '1';
        el.style.transform = `translate(${screen.x}px, ${screen.y}px) translate(-50%, -100%)`;
      });
    };
    return runtime.subscribeFrame(update);
  }, [runtime]);

  if (visible === false) return null;
  const list = Array.isArray(devices) ? devices : [];
  return (
    <div className="poi-layer">
      {list.map((device) => {
        const id = device?.id;
        if (!id) return null;
        const name = device.name || id;
        const color = statusColor(device.status);
        return (
          <button
            key={id}
            type="button"
            className={selectedId === id ? 'poi active' : 'poi'}
            data-equipment-id={id}
            title={name}
            aria-label={name}
            lang={lang === 'en' ? 'en' : 'zh'}
            ref={(el) => {
              if (el) {
                nodes.current.set(id, el);
                if (el.dataset.placed !== '1') el.hidden = true;
              } else {
                nodes.current.delete(id);
              }
            }}
            onClick={() => {
              dispatch(EVENTS.EQUIPMENT_SELECT, { id });
              runtime?.focusEquipment?.(id);
            }}
          >
            <i style={{ background: color?.emissive }} />
            <span>{name}</span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * 工具栏「铭牌」开关。portal 到 .view-actions，和零件标签开关互不影响。
 */
export function PoiToggle() {
  const { config, setConfig, t } = useApp();
  const [toolbar, setToolbar] = useState(null);
  const on = config.scene?.showPoi !== false;

  useLayoutEffect(() => {
    setToolbar(document.querySelector('.viewer .view-actions'));
  }, []);

  const toggle = () => setConfig((current) => ({
    ...current,
    scene: { ...current.scene, showPoi: current.scene?.showPoi === false },
  }));

  const control = (
    <button
      type="button"
      className={`poi-toggle${on ? ' active' : ''}`}
      aria-pressed={on}
      onClick={toggle}
    >
      {t.showPoi}
    </button>
  );

  return toolbar ? createPortal(control, toolbar) : control;
}
