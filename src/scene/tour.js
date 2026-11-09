/**
 * 预设视点巡检的纯状态机。不碰 Three，由 SceneRuntime 把阶段换成相机缓动。
 *
 * flying 满 flyMs → arrive，进入 dwelling；
 * dwelling 满 dwellMs → leave，index 加 1 取模，回到 flying。
 */

/** @typedef {{x:number,y:number,z:number}} Vec3 */
/** @typedef {{ id: string, label: string, position: Vec3, target: Vec3, equipmentId?: string }} TourStop */
/** @typedef {'idle'|'flying'|'dwelling'|'paused'} TourPhase */

import * as THREE from 'three';
import { sortDevices } from '../data/selectors.js';

/**
 * @param {TourStop[]} stops
 * @param {{ dwellMs?: number, flyMs?: number }} [options]
 */
export function createTour(stops, { dwellMs = 5000, flyMs = 1200 } = {}) {
  return {
    phase: 'idle',
    index: 0,
    stops: Array.isArray(stops) ? stops.slice() : [],
    dwellMs,
    flyMs,
    phaseStart: 0,
    pausedPhase: null,
    pausedElapsed: 0,
  };
}

/** idle → flying(0)。没有视点时原样返回。 */
export function tourStart(tour, now) {
  if (!tour?.stops?.length || tour.phase !== 'idle') return tour;
  return {
    ...tour,
    phase: 'flying',
    index: 0,
    phaseStart: now,
    pausedPhase: null,
    pausedElapsed: 0,
  };
}

/** @returns {{ tour: object, event: 'arrive'|'leave'|null }} */
export function tourTick(tour, now) {
  if (!tour || (tour.phase !== 'flying' && tour.phase !== 'dwelling')) {
    return { tour, event: null };
  }
  const limit = tour.phase === 'flying' ? tour.flyMs : tour.dwellMs;
  if (now - tour.phaseStart < limit) return { tour, event: null };
  if (tour.phase === 'flying') {
    return {
      tour: { ...tour, phase: 'dwelling', phaseStart: now, pausedPhase: null, pausedElapsed: 0 },
      event: 'arrive',
    };
  }
  const index = (tour.index + 1) % tour.stops.length;
  return {
    tour: { ...tour, phase: 'flying', index, phaseStart: now, pausedPhase: null, pausedElapsed: 0 },
    event: 'leave',
  };
}

/** 记下当前阶段已经过的时间，停在 paused。 */
export function tourPause(tour, now) {
  if (!tour || (tour.phase !== 'flying' && tour.phase !== 'dwelling')) return tour;
  return {
    ...tour,
    phase: 'paused',
    pausedPhase: tour.phase,
    pausedElapsed: Math.max(0, now - tour.phaseStart),
  };
}

/** 回到暂停前的阶段，已过时间从时限里扣掉。 */
export function tourResume(tour, now) {
  if (!tour || tour.phase !== 'paused' || !tour.pausedPhase) return tour;
  return {
    ...tour,
    phase: tour.pausedPhase,
    phaseStart: now - tour.pausedElapsed,
    pausedPhase: null,
    pausedElapsed: 0,
  };
}

export function tourStop(tour) {
  if (!tour) return createTour([]);
  return {
    ...tour,
    phase: 'idle',
    index: 0,
    phaseStart: 0,
    pausedPhase: null,
    pausedElapsed: 0,
  };
}

function vec3(value) {
  if (!value) return null;
  const x = Number(value.x);
  const y = Number(value.y);
  const z = Number(value.z);
  if (![x, y, z].every(Number.isFinite)) return null;
  return { x, y, z };
}

/** 包围盒四个 45° 方位。对不上设备时用来补齐到至少 4 个视点。 */
function cornerStops(model) {
  if (!model || typeof model.traverse !== 'function') return [];
  const box = new THREE.Box3().setFromObject(model);
  if (box.isEmpty()) return [];
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);
  if (!(maxDim > 0)) return [];
  const dist = maxDim * 2.5;
  const aim = new THREE.Vector3(0.72, 0.52, 0.78);
  const elev = Math.asin(aim.y / aim.length());
  const hy = Math.sin(elev);
  const hh = Math.cos(elev);
  return [45, 135, 225, 315].map((deg) => {
    const rad = THREE.MathUtils.degToRad(deg);
    return {
      id: `corner-${deg}`,
      label: `${deg}°`,
      position: {
        x: center.x + Math.sin(rad) * hh * dist,
        y: center.y + hy * dist,
        z: center.z + Math.cos(rad) * hh * dist,
      },
      target: { x: center.x, y: center.y, z: center.z },
    };
  });
}

/**
 * 第 0 个是总览。其后最多 5 台设备，告警优先；对不上模型的跳过。
 * 不足 4 个时用包围盒的 45° 方位补齐。
 */
export function buildDefaultStops(runtime, devices) {
  const stops = [];
  const home = runtime?.getHomeView?.();
  const homePos = vec3(home?.position);
  const homeTarget = vec3(home?.target);
  if (homePos && homeTarget) {
    stops.push({ id: 'overview', label: '总览', position: homePos, target: homeTarget });
  }
  let added = 0;
  for (const device of sortDevices(devices, 'status')) {
    if (added >= 5) break;
    const frame = runtime?.equipmentFrame?.(device?.id);
    const position = vec3(frame?.position);
    const target = vec3(frame?.target);
    if (!position || !target || device?.id == null || device.id === '') continue;
    stops.push({
      id: String(device.id),
      label: device.name || String(device.id),
      position,
      target,
      equipmentId: device.id,
    });
    added += 1;
  }
  if (stops.length < 4) {
    for (const corner of cornerStops(runtime?.model)) {
      if (stops.length >= 4) break;
      stops.push(corner);
    }
  }
  return stops;
}
