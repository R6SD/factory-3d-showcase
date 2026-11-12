/**
 * @vitest-environment happy-dom
 */
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TourControls } from '../src/ui/viewer/TourControls.jsx';
import { viewerCopy } from '../src/ui/viewer-strings.js';

const stops = [
  { id: 'overview', label: '总览' },
  { id: 'eq-silo-a', label: '原料仓 A', equipmentId: 'eq-silo-a' },
];

function mount(props) {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement('div');
  host.className = 'view-actions';
  document.body.append(host);
  const root = createRoot(host);
  act(() => {
    root.render(createElement(TourControls, props));
  });
  return {
    host,
    unmount() {
      act(() => root.unmount());
      host.remove();
    },
  };
}

describe('巡检控制条', () => {
  let view;

  afterEach(() => {
    view?.unmount();
    view = null;
  });

  it('空闲时只有巡检按钮，点击开始', () => {
    const onStart = vi.fn();
    view = mount({
      phase: 'idle', index: 0, stops: [], t: viewerCopy.zh, onStart,
    });
    const button = document.querySelector('.tour-toggle');
    expect(button.textContent).toBe('巡检');
    expect(document.querySelector('.tour-bar')).toBeNull();
    act(() => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onStart).toHaveBeenCalledOnce();
  });

  it('运行中在按钮旁显示暂停、停止和视点名', () => {
    const onPause = vi.fn();
    const onStop = vi.fn();
    view = mount({
      phase: 'flying', index: 0, stops, t: viewerCopy.zh, onPause, onStop,
    });
    expect(document.querySelector('.tour-toggle').textContent).toBe('巡检');
    const bar = document.querySelector('.tour-bar');
    expect(bar.textContent).toContain('暂停');
    expect(bar.textContent).toContain('停止');
    expect(bar.textContent).toContain('1/2');
    expect(bar.textContent).toContain('总览');
    expect(bar.textContent).not.toContain('已暂停');
    act(() => {
      [...bar.querySelectorAll('button')].find((button) => button.textContent === '暂停')
        .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onPause).toHaveBeenCalledOnce();
  });

  it('暂停后显示已暂停和继续，点继续才恢复', () => {
    const onResume = vi.fn();
    view = mount({
      phase: 'paused', index: 1, stops, t: viewerCopy.zh, onResume,
    });
    const bar = document.querySelector('.tour-bar');
    const labels = [...bar.querySelectorAll('button')].map((button) => button.textContent);
    expect(bar.querySelector('.tour-paused').textContent).toBe('已暂停');
    expect(labels).toContain('继续');
    expect(labels).not.toContain('暂停');
    expect(bar.textContent).toContain('2/2 原料仓 A');
    act(() => {
      [...bar.querySelectorAll('button')].find((button) => button.textContent === '继续')
        .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onResume).toHaveBeenCalledOnce();
  });

  it('英文按钮是 Tour / Pause / Stop', () => {
    view = mount({
      phase: 'dwelling', index: 0, stops, t: viewerCopy.en, onPause() {}, onStop() {},
    });
    expect(document.querySelector('.tour-toggle').textContent).toBe('Tour');
    expect(document.querySelector('.tour-bar').textContent).toContain('Pause');
    expect(document.querySelector('.tour-bar').textContent).toContain('Stop');
    expect(document.querySelector('.tour-bar').textContent).toContain('Overview');
  });
});

describe('巡检文案', () => {
  it('工具栏和设置里的中英文案与设计一致', () => {
    expect(viewerCopy.zh.tour).toBe('巡检');
    expect(viewerCopy.en.tour).toBe('Tour');
    expect(viewerCopy.zh.tourPause).toBe('暂停');
    expect(viewerCopy.en.tourPause).toBe('Pause');
    expect(viewerCopy.zh.tourResume).toBe('继续');
    expect(viewerCopy.en.tourResume).toBe('Resume');
    expect(viewerCopy.zh.tourStop).toBe('停止');
    expect(viewerCopy.en.tourStop).toBe('Stop');
    expect(viewerCopy.zh.tourPaused).toBe('已暂停');
    expect(viewerCopy.en.tourPaused).toBe('Paused');
    expect(viewerCopy.zh.tourOverview).toBe('总览');
    expect(viewerCopy.en.tourOverview).toBe('Overview');
  });
});
