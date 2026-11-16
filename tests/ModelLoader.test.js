import { describe, expect, it } from 'vitest';
import { progressPercent } from '../src/scene/ModelLoader.js';

describe('progressPercent', () => {
  it('{loaded:50,total:200} 为 25', () => {
    expect(progressPercent({ loaded: 50, total: 200 })).toBe(25);
  });

  it('lengthComputable 为 false 时为 null', () => {
    expect(progressPercent({ loaded: 50, total: 200, lengthComputable: false })).toBeNull();
  });

  it('total 为 0 时为 null', () => {
    expect(progressPercent({ loaded: 0, total: 0, lengthComputable: true })).toBeNull();
  });

  it('超过 100 时钳到 100', () => {
    expect(progressPercent({ loaded: 250, total: 200 })).toBe(100);
  });
});
