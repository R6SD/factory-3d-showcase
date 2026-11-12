import React from 'react';
import { NavLink } from 'react-router-dom';
import { useApp } from '../../app-context.jsx';

/** 无 WebGL 时替代三维视图。工具栏和面板依赖 runtime，这里不渲染。 */
export function WebGLFallback() {
  const { t } = useApp();
  return (
    <div className="webgl-fallback">
      <div>
        <b>{t.webglUnavailable}</b>
        <p>{t.webglHint}</p>
        <nav>
          <NavLink to="/capacity">{t.capacity}</NavLink>
          <NavLink to="/organization">{t.organization}</NavLink>
        </nav>
      </div>
    </div>
  );
}
