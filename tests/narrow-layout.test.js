/**
 * happy-dom 不算布局。这里只锁住根因：body 不再写死 1100px，
 * 窄屏证据靠无头截图。
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('窄屏布局回归（#37）', () => {
  it('style.css 的 body 规则不含 min-width:1100px', () => {
    const css = readFileSync(resolve('src/style.css'), 'utf8');
    const rule = css.match(/body\{[^}]*\}/);
    expect(rule).not.toBeNull();
    expect(rule[0]).not.toContain('min-width:1100px');
  });
});
