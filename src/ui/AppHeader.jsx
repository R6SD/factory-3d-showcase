import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Globe2 } from 'lucide-react';
import { cssImageUrl, useBrandUrls } from './useBrandUrls.js';

/** 窄屏用操作区实际宽度给居中铭牌让位，避免 Logo 把标题推进时钟。 */
export function reserveActionsWidth(header, actions) {
  const width = actions.getBoundingClientRect().width;
  if (width > 0) header.style.setProperty('--actions-w', `${Math.ceil(width)}px`);
}

/**
 * 壳层顶栏铭牌。Logo 只由 React 按 branding.icon 渲染，不与命令式脚本双写。
 */
export function AppHeader({ config, setConfig, routeLabel }) {
  const headerRef = useRef(null);
  const actionsRef = useRef(null);
  const { logoUrl, titleBgUrl } = useBrandUrls(config.branding);
  useLayoutEffect(() => {
    const header = headerRef.current;
    const actions = actionsRef.current;
    if (!header || !actions) return undefined;
    const apply = () => reserveActionsWidth(header, actions);
    apply();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(apply);
    observer.observe(actions);
    return () => observer.disconnect();
  }, []);
  return (
    <header
      ref={headerRef}
      className={`app-header${titleBgUrl ? ' has-title-bg' : ''}`}
      style={titleBgUrl ? { '--title-bg': cssImageUrl(titleBgUrl) } : undefined}
    >
      <div className="header-left" aria-hidden="true" />
      <div className="plaque">
        {logoUrl ? <img className="custom-brand-icon" src={logoUrl} alt="" /> : null}
        <div className="plaque-text">
          <b className="plaque-title">{config.branding?.title}</b>
        </div>
      </div>
      <div className="actions" ref={actionsRef}>
        <span className="route-chip">{routeLabel}</span>
        <ViewerClock routeLabel={routeLabel} />
        <button
          className="lang-toggle"
          onClick={() => setConfig((x) => ({ ...x, language: x.language === 'zh' ? 'en' : 'zh' }))}
          title={config.language === 'zh' ? 'Switch to English' : '切换到中文'}
        >
          <Globe2 size={18} />
          <span>{config.language === 'zh' ? 'EN' : '中'}</span>
        </button>
      </div>
    </header>
  );
}

function ViewerClock({ routeLabel }) {
  const [time, setTime] = useState('');
  useEffect(() => {
    const update = () => {
      const d = new Date();
      setTime(d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    };
    update();
    const h = setInterval(update, 1000);
    return () => clearInterval(h);
  }, []);
  return (
    <div className="viewer-clock" aria-label={routeLabel}>
      {time}
    </div>
  );
}
