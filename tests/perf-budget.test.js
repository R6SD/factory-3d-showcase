/**
 * @vitest-environment happy-dom
 */
import { createRoot } from 'react-dom/client';
import { act, createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Ctx } from '../src/app-context.jsx';
import { PERF_BUDGET, budgetFooter, budgetLevel, formatBudgetCount } from '../src/scene/perf-budget.js';
import { PerfBudgetPanel } from '../src/ui/viewer/PerfBudgetPanel.jsx';
import { viewerCopy } from '../src/ui/viewer-strings.js';

describe('PERF_BUDGET', () => {
  it('冻结架构师给出的默认工厂场景预算，避免面板和文档各写一套数字', () => {
    expect(PERF_BUDGET).toEqual({
      fpsMin: 50,
      trisWarn: 200_000,
      trisMax: 500_000,
      drawCallsWarn: 150,
      drawCallsMax: 300,
    });
    expect(Object.isFrozen(PERF_BUDGET)).toBe(true);
    expect(() => {
      PERF_BUDGET.fpsMin = 1;
    }).toThrow(TypeError);
  });
});

describe('budgetLevel 各指标边界', () => {
  const budget = PERF_BUDGET;

  it('fps：达到 fpsMin 为 ok，低于下限为 bad（预算只有一条下限，没有 warn 带）', () => {
    expect(budgetLevel('fps', budget.fpsMin - 1, budget)).toBe('bad');
    expect(budgetLevel('fps', budget.fpsMin, budget)).toBe('ok');
    expect(budgetLevel('fps', budget.fpsMin + 1, budget)).toBe('ok');
    expect(budgetLevel('fps', 0, budget)).toBe('bad');
  });

  it('tris：小于 trisWarn 为 ok，达到 warn 且小于 max 为 warn，达到 max 为 bad', () => {
    expect(budgetLevel('tris', budget.trisWarn - 1, budget)).toBe('ok');
    expect(budgetLevel('tris', budget.trisWarn, budget)).toBe('warn');
    expect(budgetLevel('tris', budget.trisMax - 1, budget)).toBe('warn');
    expect(budgetLevel('tris', budget.trisMax, budget)).toBe('bad');
    expect(budgetLevel('tris', budget.trisMax + 1, budget)).toBe('bad');
  });

  it('drawCalls：小于 drawCallsWarn 为 ok，达到 warn 且小于 max 为 warn，达到 max 为 bad', () => {
    expect(budgetLevel('drawCalls', budget.drawCallsWarn - 1, budget)).toBe('ok');
    expect(budgetLevel('drawCalls', budget.drawCallsWarn, budget)).toBe('warn');
    expect(budgetLevel('drawCalls', budget.drawCallsMax - 1, budget)).toBe('warn');
    expect(budgetLevel('drawCalls', budget.drawCallsMax, budget)).toBe('bad');
    expect(budgetLevel('drawCalls', budget.drawCallsMax + 1, budget)).toBe('bad');
  });

  it('比较使用传入的 budget，不把默认常量写死在判定里', () => {
    const custom = {
      fpsMin: 45,
      trisWarn: 1000,
      trisMax: 2000,
      drawCallsWarn: 10,
      drawCallsMax: 20,
    };
    expect(budgetLevel('fps', 45, custom)).toBe('ok');
    expect(budgetLevel('fps', 44, custom)).toBe('bad');
    expect(budgetLevel('tris', 999, custom)).toBe('ok');
    expect(budgetLevel('tris', 1000, custom)).toBe('warn');
    expect(budgetLevel('tris', 2000, custom)).toBe('bad');
    expect(budgetLevel('drawCalls', 9, custom)).toBe('ok');
    expect(budgetLevel('drawCalls', 10, custom)).toBe('warn');
    expect(budgetLevel('drawCalls', 20, custom)).toBe('bad');
  });

  it('缺省 budget 时使用 PERF_BUDGET；非有限数值为 bad；未知指标抛错', () => {
    expect(budgetLevel('fps', PERF_BUDGET.fpsMin)).toBe('ok');
    expect(budgetLevel('fps', Number.NaN)).toBe('bad');
    expect(budgetLevel('tris', Number.POSITIVE_INFINITY)).toBe('bad');
    expect(budgetLevel('drawCalls', undefined)).toBe('bad');
    expect(() => budgetLevel('gpu', 1)).toThrow(/unknown perf metric/);
  });
});

describe('budgetFooter', () => {
  it('默认页脚由 PERF_BUDGET 生成，与架构师示例一致', () => {
    expect(budgetFooter()).toBe('预算 FPS≥50 · tris<200k 舒适 / <500k 上限 · calls<150/300');
  });

  it('换一套预算时页脚跟着变，不保留默认魔法数', () => {
    expect(budgetFooter({
      fpsMin: 45,
      trisWarn: 100_000,
      trisMax: 400_000,
      drawCallsWarn: 10,
      drawCallsMax: 20,
    })).toBe('预算 FPS≥45 · tris<100k 舒适 / <400k 上限 · calls<10/20');
  });

  it('传入英文词时只替换文案，数字仍来自 budget', () => {
    expect(budgetFooter(PERF_BUDGET, { prefix: 'Budget', comfort: 'comfort', cap: 'cap' }))
      .toBe('Budget FPS≥50 · tris<200k comfort / <500k cap · calls<150/300');
  });
});

describe('PerfBudgetPanel', () => {
  let root;

  function mountRuntime(runtime) {
    window.__factorySceneRuntime = runtime;
    document.body.innerHTML = '<div class="viewer"><div class="view-actions"><div id="perf-root"></div></div></div>';
    root = createRoot(document.getElementById('perf-root'));
    act(() => {
      root.render(createElement(PerfBudgetPanel));
    });
  }

  function row(metric) {
    return document.querySelector(`.perf-overlay [data-metric="${metric}"]`);
  }

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
  });

  afterEach(() => {
    if (root) act(() => root.unmount());
    root = null;
    vi.useRealTimers();
    delete window.__factorySceneRuntime;
    document.body.innerHTML = '';
  });

  it('默认收起；点开后用 getFps/getPerf 画出三行预算色和固定页脚', () => {
    const runtime = {
      getFps: vi.fn(() => 49),
      getPerf: vi.fn(() => ({ calls: 150, tris: 9_999, trisTotal: 199_999, rfs: 0, sfs: 1, mode: 'off' })),
      setView: vi.fn(),
      updateConfig: vi.fn(),
    };
    mountRuntime(runtime);

    const button = document.querySelector('.perf-toggle');
    expect(button.textContent).toContain('性能预算');
    expect(button.getAttribute('title')).toBe('性能预算');
    expect(document.querySelector('.perf-overlay')).toBeNull();
    expect(runtime.getFps).not.toHaveBeenCalled();
    expect(runtime.getPerf).not.toHaveBeenCalled();

    act(() => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(button.className).toContain('active');
    expect(row('fps').textContent).toContain('帧率');
    expect(row('fps').textContent).toContain(String(PERF_BUDGET.fpsMin));
    expect(row('fps').textContent).toContain('49');
    expect(row('fps').querySelector('b').className).toBe('bad');

    expect(row('tris').textContent).toContain('模型总量');
    expect(row('tris').textContent).toContain(formatBudgetCount(PERF_BUDGET.trisWarn));
    expect(row('tris').textContent).toContain(formatBudgetCount(PERF_BUDGET.trisMax));
    expect(row('tris').textContent).toContain('199999');
    expect(row('tris').querySelector('b').className).toBe('good');

    expect(row('drawCalls').textContent).toContain('绘制调用');
    expect(row('drawCalls').textContent).toContain(String(PERF_BUDGET.drawCallsWarn));
    expect(row('drawCalls').textContent).toContain(String(PERF_BUDGET.drawCallsMax));
    expect(row('drawCalls').textContent).toContain('150');
    expect(row('drawCalls').querySelector('b').className).toBe('warn');

    expect(document.querySelector('.perf-overlay').textContent).toContain(budgetFooter());
    expect(runtime.getFps).toHaveBeenCalledTimes(1);
    expect(runtime.getPerf).toHaveBeenCalledTimes(1);
    expect(runtime.setView).not.toHaveBeenCalled();
    expect(runtime.updateConfig).not.toHaveBeenCalled();
  });

  it('另一组读数落在 ok / bad / ok，缺数时不涂色', () => {
    mountRuntime({
      getFps: () => 50,
      getPerf: () => ({ calls: 149, tris: 1, trisTotal: PERF_BUDGET.trisMax }),
    });
    act(() => {
      document.querySelector('.perf-toggle').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(row('fps').querySelector('b').className).toBe('good');
    expect(row('tris').querySelector('b').className).toBe('bad');
    expect(row('drawCalls').querySelector('b').className).toBe('good');

    act(() => root.unmount());
    mountRuntime({ getFps: () => 60, getPerf: () => null });
    act(() => {
      document.querySelector('.perf-toggle').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(row('tris').textContent).toContain('—');
    expect(row('tris').querySelector('b').className).toBe('');
    expect(row('drawCalls').textContent).toContain('—');
    expect(row('drawCalls').querySelector('b').className).toBe('');
  });

  it('预算三行下面仍渲染原来的四行，数值和着色与 main 的面板一致', () => {
    mountRuntime({
      getFps: () => 12,
      getPerf: () => ({ calls: 177, tris: 5356, trisTotal: 5404, rfs: 2, sfs: 58, mode: 'parallax' }),
    });
    act(() => {
      document.querySelector('.perf-toggle').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const overlay = document.querySelector('.perf-overlay');
    expect(overlay.parentElement.classList.contains('viewer')).toBe(true);
    expect(overlay.closest('.view-actions')).toBeNull();

    const rows = [...document.querySelectorAll('.perf-overlay .perf-row')];
    const labels = rows.map((node) => node.querySelector('span').textContent);
    const budgetEnd = labels.findIndex((label) => label.startsWith('绘制调用/帧'));
    const diagnostic = labels.slice(budgetEnd + 1, budgetEnd + 5);
    expect(diagnostic).toEqual(['渲染/秒', '跳过/秒', '三角面（每帧提交）', '立体模式']);
    expect(labels.at(-1)).toBe(budgetFooter());

    expect(row('rfs').querySelector('b').textContent).toBe('2');
    expect(row('rfs').querySelector('b').className).toBe('good');
    expect(row('sfs').querySelector('b').textContent).toBe('58');
    expect(row('sfs').querySelector('b').className).toBe('');
    expect(row('trisFrame').querySelector('b').textContent).toBe('5.4k');
    expect(row('trisFrame').querySelector('b').className).toBe('');
    expect(row('stereo').querySelector('b').textContent).toBe('parallax');
    expect(row('stereo').querySelector('b').className).toBe('');
    for (const metric of ['rfs', 'sfs', 'trisFrame', 'stereo']) {
      expect(row(metric).querySelector('b').className).not.toMatch(/warn|bad/);
    }

    act(() => root.unmount());
    mountRuntime({
      getFps: () => 60,
      getPerf: () => ({ calls: 10, tris: 0, trisTotal: 1, rfs: 60, sfs: 0, mode: 'off' }),
    });
    act(() => {
      document.querySelector('.perf-toggle').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(row('rfs').querySelector('b').textContent).toBe('60');
    expect(row('rfs').querySelector('b').className).toBe('');
    expect(row('sfs').querySelector('b').textContent).toBe('0');
    expect(row('trisFrame').querySelector('b').textContent).toBe('0.0k');
    expect(row('stereo').querySelector('b').textContent).toBe('off');

    act(() => root.unmount());
    mountRuntime({ getFps: () => 0, getPerf: () => null });
    act(() => {
      document.querySelector('.perf-toggle').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    for (const metric of ['rfs', 'sfs', 'trisFrame', 'stereo']) {
      expect(row(metric).querySelector('b').textContent).toBe('—');
      expect(row(metric).querySelector('b').className).toBe('');
    }
  });

  it('打开后面板至少每 500ms 只读 getFps/getPerf，关闭后不再读', () => {
    const runtime = {
      getFps: vi.fn(() => 60),
      getPerf: vi.fn(() => ({ calls: 10, tris: 20, trisTotal: 30 })),
      setView: vi.fn(),
      updateConfig: vi.fn(),
    };
    mountRuntime(runtime);
    act(() => {
      document.querySelector('.perf-toggle').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(runtime.getFps).toHaveBeenCalledTimes(1);

    act(() => {
      vi.advanceTimersByTime(499);
    });
    expect(runtime.getFps).toHaveBeenCalledTimes(1);
    expect(runtime.getPerf).toHaveBeenCalledTimes(1);

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(runtime.getFps).toHaveBeenCalledTimes(2);
    expect(runtime.getPerf).toHaveBeenCalledTimes(2);

    act(() => {
      document.querySelector('.perf-toggle').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(document.querySelector('.perf-overlay')).toBeNull();
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(runtime.getFps).toHaveBeenCalledTimes(2);
    expect(runtime.getPerf).toHaveBeenCalledTimes(2);
    expect(runtime.setView).not.toHaveBeenCalled();
    expect(runtime.updateConfig).not.toHaveBeenCalled();
  });

  it('语言为 en 时按钮、诊断行和页脚走英文文案', () => {
    mountRuntime({
      getFps: () => 60,
      getPerf: () => ({ calls: 10, tris: 1000, trisTotal: 1000, rfs: 30, sfs: 0, mode: 'off' }),
    });
    act(() => root.unmount());
    document.body.innerHTML = '<div class="viewer"><div id="perf-root"></div></div>';
    root = createRoot(document.getElementById('perf-root'));
    const copy = viewerCopy.en;
    act(() => {
      root.render(createElement(Ctx.Provider, { value: { config: { language: 'en' } } }, createElement(PerfBudgetPanel)));
    });
    const button = document.querySelector('.perf-toggle');
    expect(button.textContent).toBe(copy.perfBudget);
    expect(button.getAttribute('title')).toBe(copy.perfBudget);
    act(() => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(row('fps').textContent).toContain(copy.perfFps);
    expect(row('tris').textContent).toContain(copy.perfTrisTotal);
    expect(row('drawCalls').textContent).toContain('Draw calls/frame');
    expect(row('rfs').querySelector('span').textContent).toBe(copy.perfRender);
    expect(row('sfs').querySelector('span').textContent).toBe(copy.perfSkip);
    expect(row('trisFrame').querySelector('span').textContent).toBe(copy.perfTrisFrame);
    expect(row('stereo').querySelector('span').textContent).toBe(copy.perfStereo);
    expect(document.querySelector('.perf-overlay').textContent).toContain('Budget FPS≥50');
  });
});
