/**
 * @vitest-environment happy-dom
 */
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReplayBar } from '../src/ui/viewer/ReplayBar.jsx';
import { viewerCopy } from '../src/ui/viewer-strings.js';

const copy = viewerCopy.zh;

describe('ReplayBar', () => {
  let root;
  let host;

  afterEach(() => {
    if (root) act(() => root.unmount());
    root = null;
    host?.remove();
    host = null;
  });

  function mount(props) {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    document.body.innerHTML = '<div class="viewer"><div class="view-actions"></div><div id="replay-root"></div></div>';
    host = document.getElementById('replay-root');
    root = createRoot(host);
    act(() => {
      root.render(createElement(ReplayBar, { copy, ...props }));
    });
  }

  it('未回放时只在工具栏放「回放」', () => {
    const onEnter = vi.fn();
    mount({ active: false, onEnter });
    const toggle = document.querySelector('.view-actions .replay-toggle');
    expect(toggle.textContent).toBe('回放');
    expect(document.querySelector('.replay-bar')).toBeNull();
    expect(document.querySelector('.replay-badge')).toBeNull();
    act(() => {
      toggle.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onEnter).toHaveBeenCalledTimes(1);
  });

  it('回放中有播放、倍速、进度、时间和回到实时，刻度标在告警时刻', () => {
    const onSeek = vi.fn();
    const onSpeed = vi.fn();
    const onPause = vi.fn();
    const onExit = vi.fn();
    mount({
      active: true,
      playing: true,
      speed: 1,
      time: 65_000,
      marks: [0, 90_000],
      onSeek,
      onSpeed,
      onPause,
      onExit,
    });
    expect(document.querySelector('.replay-badge').textContent).toBe('回放中');
    expect(document.querySelector('.view-actions .replay-toggle').textContent).toBe('回到实时');
    expect(document.querySelector('.replay-play').textContent).toBe('暂停');
    expect(document.querySelector('.replay-time').textContent).toBe('01:05 / 10:00');
    expect(document.querySelectorAll('.replay-mark')).toHaveLength(2);
    expect(document.querySelector('.replay-mark[data-at="90000"]')).not.toBeNull();

    const range = document.querySelector('.replay-bar input[type="range"]');
    expect(range.max).toBe(String(10 * 60 * 1000));
    expect(range.step).toBe('2000');
    range.value = '90000';
    act(() => {
      range.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(onSeek).toHaveBeenCalledWith(90_000);

    const speed = document.querySelector('.replay-speed');
    speed.value = '4';
    act(() => {
      speed.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(onSpeed).toHaveBeenCalledWith(4);

    act(() => {
      document.querySelector('.replay-play').dispatchEvent(new MouseEvent('click', { bubbles: true }));
      document.querySelector('.replay-live').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onPause).toHaveBeenCalledTimes(1);
    expect(onExit).toHaveBeenCalledTimes(1);
  });
});
