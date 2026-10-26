/**
 * @vitest-environment happy-dom
 *
 * N/E used to miss: the letter groups had no shape, and text was
 * pointer-events:none, so the click fell through to the background circle.
 * S/W were never controls and stay that way.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  COMPASS_HEADINGS,
  CompassHeadingMarks,
  compassPresetAt,
  compassRimPoint,
} from '../src/ui/compass-headings.jsx';

const css = readFileSync(resolve('src/overrides.css'), 'utf8');
const appSource = readFileSync(resolve('src/app.jsx'), 'utf8');

function heading(key) {
  return COMPASS_HEADINGS.find((item) => item.key === key);
}

describe('罗盘方位热区', () => {
  it('N 字母和北侧刻度落在前视热区，E 落在侧视热区', () => {
    const n = heading('N');
    const e = heading('E');
    expect(compassPresetAt(n.x, n.y)).toBe('front');
    expect(compassPresetAt(e.x, e.y)).toBe('side');
    for (const radius of [26, 32]) {
      const nTick = compassRimPoint(0, radius);
      const eTick = compassRimPoint(90, radius);
      expect(compassPresetAt(nTick.x, nTick.y)).toBe('front');
      expect(compassPresetAt(eTick.x, eTick.y)).toBe('side');
    }
  });

  it('S/W 字母、南/西刻度和圆心都不是热区', () => {
    const s = heading('S');
    const w = heading('W');
    expect(s.preset).toBeNull();
    expect(w.preset).toBeNull();
    expect(s.hitRadius).toBe(0);
    expect(w.hitRadius).toBe(0);
    expect(compassPresetAt(s.x, s.y)).toBeNull();
    expect(compassPresetAt(w.x, w.y)).toBeNull();
    for (const radius of [26, 32]) {
      expect(compassPresetAt(compassRimPoint(180, radius).x, compassRimPoint(180, radius).y)).toBeNull();
      expect(compassPresetAt(compassRimPoint(270, radius).x, compassRimPoint(270, radius).y)).toBeNull();
    }
    expect(compassPresetAt(40, 40)).toBeNull();
    const n = heading('N');
    expect(compassPresetAt(n.x, n.y + n.hitRadius + 0.1)).toBeNull();
  });
});

describe('罗盘点击盘', () => {
  let root;
  let host;

  afterEach(() => {
    act(() => root?.unmount());
    host?.remove();
    document.head.querySelector('[data-compass-css]')?.remove();
  });

  function mount(onPreset) {
    const style = document.createElement('style');
    style.dataset.compassCss = '1';
    style.textContent = css;
    document.head.appendChild(style);
    host = document.createElement('div');
    host.className = 'compass-3d';
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => {
      root.render(createElement(
        'svg',
        { viewBox: '0 0 80 80' },
        createElement('circle', { className: 'compass-bg', cx: 40, cy: 40, r: 37, fill: '#123' }),
        createElement(CompassHeadingMarks, { layer: 'label' }),
        createElement('polygon', { points: '40,24 37,33 43,33', fill: '#f66' }),
        createElement(CompassHeadingMarks, { layer: 'hit', onPreset }),
      ));
    });
  }

  it('热区圆盘盖住字母，文字不接点击，S/W 没有热区', () => {
    mount(() => {});
    const hits = [...host.querySelectorAll('.compass-hit')];
    expect(hits.map((node) => node.dataset.heading)).toEqual(['N', 'E']);
    expect(hits.map((node) => node.dataset.preset)).toEqual(['front', 'side']);
    for (const node of hits) {
      const spec = heading(node.dataset.heading);
      expect(node.tagName.toLowerCase()).toBe('circle');
      expect(Number(node.getAttribute('r'))).toBe(spec.hitRadius);
      expect(node.getAttribute('fill')).toBe('none');
      expect(node.getAttribute('pointer-events')).toBe('all');
      expect(getComputedStyle(node).pointerEvents).toBe('all');
      expect(getComputedStyle(node).cursor).toBe('pointer');
    }
    for (const key of ['N', 'E', 'S', 'W']) {
      const spec = heading(key);
      const label = [...host.querySelectorAll('text')].find((node) => node.textContent === key);
      expect(Number(label.getAttribute('x'))).toBe(spec.x);
      expect(Number(label.getAttribute('y'))).toBe(spec.y);
      expect(getComputedStyle(label).pointerEvents).toBe('none');
    }
    const idle = [...host.querySelectorAll('.compass-idle')];
    expect(idle.map((node) => node.dataset.heading)).toEqual(['S', 'W']);
    for (const node of idle) {
      expect(node.querySelector('circle')).toBeNull();
      expect(getComputedStyle(node).pointerEvents).toBe('none');
      expect(getComputedStyle(node).cursor).toBe('default');
    }
    expect(host.querySelector('.compass-hit[data-heading="S"]')).toBeNull();
    expect(host.querySelector('.compass-hit[data-heading="W"]')).toBeNull();
    const rules = css.match(/\.compass-3d\{[^}]*\}/)[0];
    expect(rules).toContain('cursor:default');
    expect(rules).not.toContain('cursor:pointer');
  });

  it('点 N/E 热区切到前视和侧视，点 S 或底圆不切视角', () => {
    const calls = [];
    mount((preset) => calls.push(preset));
    const click = (node) => {
      act(() => {
        node.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      });
    };
    click(host.querySelector('.compass-hit[data-heading="N"]'));
    click(host.querySelector('.compass-hit[data-heading="E"]'));
    click([...host.querySelectorAll('text')].find((node) => node.textContent === 'S'));
    click(host.querySelector('.compass-bg'));
    expect(calls).toEqual(['front', 'side']);
  });

  it('三维页把字母画在指针下面，把热区圆盘画在最上层', () => {
    expect(appSource).toContain('<CompassHeadingMarks layer="label"/>');
    expect(appSource).toContain('<CompassHeadingMarks layer="hit" onPreset={setView}/>');
    const compass = appSource.slice(appSource.indexOf('function Compass3D'), appSource.indexOf('function DisplayModeToggle'));
    const labelAt = compass.indexOf('layer="label"');
    const needleAt = compass.indexOf('ref={gRef}');
    const hitAt = compass.indexOf('layer="hit"');
    expect(labelAt).toBeGreaterThan(-1);
    expect(needleAt).toBeGreaterThan(labelAt);
    expect(hitAt).toBeGreaterThan(needleAt);
    expect(compass).not.toContain("setView('front')");
    expect(compass).not.toContain("setView('side')");
  });
});
