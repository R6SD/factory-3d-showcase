import React from 'react';
import { useApp } from '../app-context.jsx';

const MAX_ICON_BYTES = 1024 * 1024;

/** 设置页品牌图标。写入 branding.icon，顶栏只读该字段渲染。 */
export function BrandIconField() {
  const { config, setConfig } = useApp();
  const icon = config.branding?.icon || '';
  const setIcon = (next) => setConfig((x) => ({ ...x, branding: { ...x.branding, icon: next } }));
  const onFile = (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (file.size > MAX_ICON_BYTES) {
      alert('图标文件不能超过 1 MB');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setIcon(typeof reader.result === 'string' ? reader.result : '');
    reader.readAsDataURL(file);
  };
  return (
    <section className="brand-icon-settings">
      <h3>品牌图标</h3>
      <p>支持 PNG、JPG、WEBP 或 SVG；建议使用正方形图片，最大 1 MB。有图时显示在顶栏标题左侧。</p>
      <div className="brand-icon-preview">
        {icon ? <img alt="图标预览" src={icon} /> : null}
      </div>
      <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={onFile} />
      <button type="button" onClick={() => setIcon('')}>恢复默认图标</button>
    </section>
  );
}
