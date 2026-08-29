/**
 * stereo.js — 裸眼 3D / 立体渲染核心。
 *
 * 普通显示器无法像视差屏障/光场屏那样物理分光，Web 端“裸眼 3D”分两层实现：
 *   1) 运动视差（head-coupled / motion parallax，单目、无重影，裸眼即可感知出屏纵深）：
 *      指针位置 → 归一化坐标 → 帧率无关阻尼 → 相机沿自身 right/up 做离轴微偏移，
 *      近景相对远景移动更快，形成“屏幕是一扇窗”的立体感；也可由时间驱动自动微摆。
 *   2) 双目立体输出（需要对应呈现方式）：视差屏障 barrier（裸眼 3D 屏）、并排 sbs
 *      （光场/裸眼平板/平行眼/VR 盒子）、红蓝 anaglyph（红蓝眼镜）。
 *
 * 数学部分全部为纯函数，便于单元测试；StereoPipeline 只负责 three 效果器生命周期。
 */
import { AnaglyphEffect } from 'three/examples/jsm/effects/AnaglyphEffect.js';
import { StereoEffect } from 'three/examples/jsm/effects/StereoEffect.js';
import { ParallaxBarrierEffect } from 'three/examples/jsm/effects/ParallaxBarrierEffect.js';

/** 支持的立体模式（parallax 为单目运动视差，其余为双目输出，off 关闭） */
export const STEREO_MODES = Object.freeze(['off', 'parallax', 'barrier', 'sbs', 'anaglyph']);
export const DUAL_EYE_MODES = Object.freeze(['barrier', 'sbs', 'anaglyph']);

export function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

/**
 * 把指针客户端坐标归一化到 [-1, 1]：屏幕中心为 0，右/上为正。
 * @param {{left:number,top:number,width:number,height:number}} rect getBoundingClientRect 结果
 * @returns {{nx:number, ny:number}}
 */
export function normalizePointer(clientX, clientY, rect) {
  if (!rect || !rect.width || !rect.height) return { nx: 0, ny: 0 };
  const nx = clamp(((clientX - rect.left) / rect.width) * 2 - 1, -1, 1);
  // 屏幕 y 向下为正，而相机 up 向上为正，因此取反
  const ny = clamp(-((clientY - rect.top) / rect.height) * 2 + 1, -1, 1);
  return { nx, ny };
}

/**
 * 帧率无关的指数阻尼（frame-rate independent damping）。
 * lambda 越大跟随越快；返回插值后的当前值。
 */
export function damp(current, target, lambda, dt) {
  if (dt <= 0) return current;
  return current + (target - current) * (1 - Math.exp(-lambda * dt));
}

/**
 * 由归一化指针坐标计算视差方向系数（已乘强度），结果限定在 [-1,1]。
 * SceneRuntime 再用“相机到注视点距离 × 系数”换算成世界位移，保证不同缩放下视差幅度一致。
 * @returns {{fx:number, fy:number}}
 */
export function parallaxEyeOffset(nx, ny, strength = 0.4) {
  const s = clamp(strength, 0, 1);
  return { fx: clamp(nx, -1, 1) * s, fy: clamp(ny, -1, 1) * s };
}

/**
 * 自动微摆：用正弦/余弦合成缓慢的 Lissajous 轨迹，返回归一化坐标 [-1,1]。
 * @param {number} timeSec 秒
 * @param {{speed?:number, range?:number}} [opt]
 */
export function autoSway(timeSec, opt = {}) {
  const speed = opt.speed ?? 0.25;
  const range = clamp(opt.range ?? 0.6, 0, 1);
  return {
    nx: Math.sin(timeSec * speed) * range,
    ny: Math.cos(timeSec * speed * 0.7) * range * 0.6,
  };
}

/**
 * 管理 three 双目效果器：按需创建、同步尺寸、分发渲染、安全销毁。
 * off / parallax 模式下不创建效果器，走普通单目渲染。
 */
export class StereoPipeline {
  constructor(renderer) {
    this.renderer = renderer;
    this.mode = 'off';
    this.effect = null;
    this._w = 1;
    this._h = 1;
  }

  get isDualEye() {
    return DUAL_EYE_MODES.includes(this.mode);
  }

  setMode(mode) {
    const next = STEREO_MODES.includes(mode) ? mode : 'off';
    if (next === this.mode) return;
    this._disposeEffect();
    this.mode = next;
    const Ctor = { anaglyph: AnaglyphEffect, sbs: StereoEffect, barrier: ParallaxBarrierEffect }[next];
    if (Ctor) {
      this.effect = new Ctor(this.renderer);
      this.effect.setSize(this._w, this._h);
    }
  }

  setSize(w, h) {
    this._w = w;
    this._h = h;
    this.effect?.setSize(w, h);
  }

  /** 设置双目间距（仅支持该接口的效果器生效，如 StereoEffect） */
  setEyeSeparation(v) {
    if (this.effect && typeof this.effect.setEyeSeparation === 'function') {
      this.effect.setEyeSeparation(v);
    }
  }

  /** 按当前模式渲染：双目效果器或普通单目 */
  render(scene, camera) {
    if (this.effect) this.effect.render(scene, camera);
    else this.renderer.render(scene, camera);
  }

  /** 强制单目渲染（截图时使用，避免截到红蓝/分屏画面） */
  renderPlain(scene, camera) {
    this.renderer.render(scene, camera);
  }

  _disposeEffect() {
    if (this.effect) {
      this.effect.dispose?.();
      this.effect = null;
    }
  }

  dispose() {
    this._disposeEffect();
    this.mode = 'off';
  }
}
