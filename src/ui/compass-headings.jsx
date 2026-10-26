import React from 'react';

/** View-box center of the compass rose. */
export const COMPASS_CENTER = 40;

/**
 * Cardinal ticks use radii 26 (inner) and 32 (outer); letters sit just inside them.
 * N and E are controls and share presets with the F and S toolbar buttons.
 * S and W are labels only: no preset and no hit disk, so they are not clickable.
 * hitRadius covers the letter and the cardinal tick beside it.
 */
export const COMPASS_HEADINGS = Object.freeze([
  Object.freeze({ key: 'N', preset: 'front', title: '前视图', x: 40, y: 18, hitRadius: 12, fontSize: 12, fill: '#ff7b6b' }),
  Object.freeze({ key: 'E', preset: 'side', title: '侧视图', x: 62, y: 40, hitRadius: 12, fontSize: 10, fill: 'rgba(205,225,255,.92)' }),
  Object.freeze({ key: 'S', preset: null, title: '', x: 40, y: 62, hitRadius: 0, fontSize: 10, fill: 'rgba(205,225,255,.92)' }),
  Object.freeze({ key: 'W', preset: null, title: '', x: 18, y: 40, hitRadius: 0, fontSize: 10, fill: 'rgba(205,225,255,.92)' }),
]);

const FONT = 'JetBrains Mono,monospace';

export function compassRimPoint(angleDeg, radius) {
  const rad = (angleDeg * Math.PI) / 180;
  return {
    x: COMPASS_CENTER + Math.sin(rad) * radius,
    y: COMPASS_CENTER - Math.cos(rad) * radius,
  };
}

/** Preset under a viewBox point, or null when that point is not a clickable heading. */
export function compassPresetAt(x, y) {
  let preset = null;
  for (const heading of COMPASS_HEADINGS) {
    if (!heading.preset || heading.hitRadius <= 0) continue;
    const dx = x - heading.x;
    const dy = y - heading.y;
    if (dx * dx + dy * dy <= heading.hitRadius * heading.hitRadius) preset = heading.preset;
  }
  return preset;
}

function HeadingText({ heading }) {
  return (
    <text
      x={heading.x}
      y={heading.y}
      dominantBaseline="central"
      textAnchor="middle"
      fill={heading.fill}
      fontSize={heading.fontSize}
      fontWeight="700"
      fontFamily={FONT}
    >
      {heading.key}
    </text>
  );
}

/**
 * layer="label" draws the letters (under the needle, same as before).
 * layer="hit" draws the invisible disks last, so the letter and its tick
 * stay clickable even when the needle passes over them. Text stays
 * pointer-events:none; the disk is the actual target.
 */
export function CompassHeadingMarks({ onPreset, layer = 'label' }) {
  if (layer === 'hit') {
    return COMPASS_HEADINGS.filter((heading) => heading.preset).map((heading) => (
      <circle
        key={heading.key}
        className="compass-hit"
        data-heading={heading.key}
        data-preset={heading.preset}
        cx={heading.x}
        cy={heading.y}
        r={heading.hitRadius}
        fill="none"
        pointerEvents="all"
        style={{ cursor: 'pointer' }}
        title={heading.title}
        onClick={() => onPreset?.(heading.preset)}
      />
    ));
  }
  return COMPASS_HEADINGS.map((heading) => (
    <g
      key={heading.key}
      className={heading.preset ? undefined : 'compass-idle'}
      data-heading={heading.key}
      pointerEvents="none"
    >
      <HeadingText heading={heading} />
    </g>
  ));
}
