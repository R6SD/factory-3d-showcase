/**
 * @vitest-environment happy-dom
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function mount(navClass) {
  document.head.replaceChildren();
  document.body.replaceChildren();
  const style = document.createElement('style');
  style.textContent = `${readFileSync('src/style.css', 'utf8')}\n${readFileSync('src/overrides.css', 'utf8')}`;
  document.head.append(style);
  document.body.innerHTML = `
    <div class="app ${navClass}">
      <aside>
        <a><span class="nav-label">场地总览</span></a>
      </aside>
      <div class="viewer-page"><div class="viewer">
        <aside class="device-list-panel">
          <ul class="device-list"><li><button type="button">
            <span class="device-list-name">原料仓 A</span>
            <span class="device-list-line">原料线</span>
          </button></li></ul>
        </aside>
      </div></div>
    </div>`;
}

describe('设备列表名称不被迷你导航藏住', () => {
  it('nav-mini 下名称和线体可见，导航文字仍是 display:none', () => {
    mount('nav-mini');
    expect(getComputedStyle(document.querySelector('.device-list-name')).display).not.toBe('none');
    expect(getComputedStyle(document.querySelector('.device-list-line')).display).not.toBe('none');
    expect(document.querySelector('.device-list-name').textContent).toBe('原料仓 A');
    expect(getComputedStyle(document.querySelector('.nav-label')).display).toBe('none');
  });

  it('导航收起（没有 nav-open）时名称同样可见', () => {
    mount('nav-overlay');
    expect(getComputedStyle(document.querySelector('.device-list-name')).display).not.toBe('none');
    expect(getComputedStyle(document.querySelector('.nav-label')).display).toBe('none');
  });
});
