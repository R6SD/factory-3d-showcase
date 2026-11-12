import { describe, expect, it } from 'vitest';
import { hasWebGL } from '../src/scene/webgl-support.js';

describe('hasWebGL', () => {
  it('桩 canvas 的 getContext 返回 null 时为 false', () => {
    const canvas = { getContext: () => null };
    expect(hasWebGL(() => canvas)).toBe(false);
  });

  it('getContext 返回对象时为 true', () => {
    const canvas = { getContext: () => ({}) };
    expect(hasWebGL(() => canvas)).toBe(true);
  });

  it('getContext 抛异常时为 false', () => {
    const canvas = {
      getContext() {
        throw new Error('webgl unavailable');
      },
    };
    expect(hasWebGL(() => canvas)).toBe(false);
  });
});
