import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { budgetFooter, PERF_BUDGET } from '../src/scene/perf-budget.js';
import { viewerCopy, viewerCopyFor } from '../src/ui/viewer-strings.js';

const root = new URL('../', import.meta.url);

function read(rel) {
  return readFileSync(new URL(rel, root), 'utf8');
}

describe('viewerCopy', () => {
  it('中英文键成对且都有文案', () => {
    expect(Object.keys(viewerCopy.zh).sort()).toEqual(Object.keys(viewerCopy.en).sort());
    for (const lang of ['zh', 'en']) {
      for (const [key, value] of Object.entries(viewerCopy[lang])) {
        expect(value, `${lang}.${key}`).toEqual(expect.any(String));
        expect(value.trim(), `${lang}.${key}`).not.toBe('');
      }
    }
  });

  it('截图、层级、显示模式、拖放和加载文案与设计一致', () => {
    expect(viewerCopy.zh.screenshot).toBe('截图');
    expect(viewerCopy.en.screenshot).toBe('Screenshot');
    expect(viewerCopy.zh.hierarchy).toBe('层级');
    expect(viewerCopy.en.hierarchy).toBe('Hierarchy');
    expect(viewerCopy.zh.meshSolid).toBe('实体');
    expect(viewerCopy.zh.meshWire).toBe('线框');
    expect(viewerCopy.zh.meshPoints).toBe('点云');
    expect(viewerCopy.en.meshWire).toBe('Wireframe');
    expect(viewerCopy.zh.dropRelease).toBe('释放以导入模型');
    expect(viewerCopy.en.loadingModel).toBe('Parsing 3D model…');
    expect(viewerCopy.zh.perfBudget).toBe('性能预算');
    expect(viewerCopy.en.perfBudget).toBe('Performance budget');
  });

  it('未知语言回落到中文', () => {
    expect(viewerCopyFor('en')).toBe(viewerCopy.en);
    expect(viewerCopyFor('zh')).toBe(viewerCopy.zh);
    expect(viewerCopyFor(undefined)).toBe(viewerCopy.zh);
  });

  it('不覆盖 app.jsx 里已有的 strings 键', () => {
    const src = read('src/app.jsx');
    const literal = src.slice(src.indexOf('const strings = '), src.indexOf('Object.assign(strings'));
    expect(literal.length).toBeGreaterThan(100);
    for (const key of Object.keys(viewerCopy.zh)) {
      expect(literal.includes(`${key}:'`), key).toBe(false);
    }
  });

  it('截图用 Camera，全屏仍用 Maximize2，两者文案走 i18n', () => {
    const src = read('src/app.jsx');
    const actions = src.slice(src.indexOf('className="view-actions"'), src.indexOf('<ModelInfoBadge'));
    expect(actions).toContain('title={t.screenshot}><Camera size={15}/>{t.screenshot}');
    expect(actions).toContain('title={t.fullscreen}><Maximize2 size={15}/>{t.fullscreen}');
    expect(actions).not.toContain('/>截图');
    const shotAt = actions.indexOf('<Camera');
    const fullAt = actions.indexOf('title={t.fullscreen}');
    expect(actions.slice(shotAt, fullAt)).not.toContain('Maximize2');
  });
});

describe('字体回退', () => {
  it('根字族先保留网页字体，再落到系统中文栈', () => {
    const css = read('src/style.css');
    const html = read('index.html');
    expect(css).toContain('font-family:"Rajdhani","Noto Sans SC","PingFang SC","Microsoft YaHei",system-ui,-apple-system,"Segoe UI",sans-serif');
    expect(html).toContain('fonts.googleapis.com');
    expect(html).toContain('media="print"');
    expect(html).toContain("onload=\"this.media='all'\"");
  });

  it('等宽字体在网页字体之后有系统等宽回退', () => {
    const css = read('src/overrides.css');
    expect(css).toContain('"JetBrains Mono",ui-monospace,"Cascadia Code",Consolas,monospace');
    expect(css).not.toContain('"JetBrains Mono",monospace');
    expect(css).not.toContain('"JetBrains Mono","Noto Sans SC",monospace');
  });
});

describe('overrides.css 注释', () => {
  it('没有私用区乱码，能读到恢复后的分段注释', () => {
    const css = read('src/overrides.css');
    for (const ch of css) {
      const code = ch.codePointAt(0);
      expect(code < 0xE000 || code > 0xF8FF).toBe(true);
    }
    expect(css).not.toContain('鍏');
    expect(css).toContain('标签编辑面板');
    expect(css).toContain('模型层次结构面板');
    expect(css).toContain('显示模式切换按钮');
  });
});

describe('性能预算页脚与文案表一致', () => {
  it('中文缺省页脚不变，英文词来自 viewerCopy', () => {
    const en = viewerCopy.en;
    expect(budgetFooter()).toBe('预算 FPS≥50 · tris<200k 舒适 / <500k 上限 · calls<150/300');
    expect(budgetFooter(PERF_BUDGET, {
      prefix: en.perfFooterPrefix,
      comfort: en.perfComfort,
      cap: en.perfCap,
    })).toBe('Budget FPS≥50 · tris<200k comfort / <500k cap · calls<150/300');
  });
});
