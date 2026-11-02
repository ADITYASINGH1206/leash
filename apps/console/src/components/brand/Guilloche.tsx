/**
 * Guilloché rosette: the engraved line pattern on banknotes and cheques.
 * Drawn from hypotrochoids, so every rosette is real geometry, not an image.
 */
import React from 'react';

export function rosettePath(opts: {
  R: number;
  r: number;
  d: number;
  scale?: number;
  steps?: number;
  phase?: number;
}): string {
  const { R, r, d, scale = 1, steps = 1400, phase = 0 } = opts;
  // A hypotrochoid closes after r / gcd(R, r) turns
  const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
  const turns = r / gcd(R, r);
  const pts: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * Math.PI * 2 * turns + phase;
    const x = ((R - r) * Math.cos(t) + d * Math.cos(((R - r) / r) * t)) * scale;
    const y = ((R - r) * Math.sin(t) - d * Math.sin(((R - r) / r) * t)) * scale;
    pts.push(`${i === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`);
  }
  return pts.join('') + 'Z';
}

export function Guilloche({
  size = 240,
  layers = 4,
  className,
  strokeWidth = 0.6,
  petals = 18,
}: {
  size?: number;
  layers?: number;
  className?: string;
  strokeWidth?: number;
  petals?: number;
}) {
  const half = size / 2;
  // R = petals·g and r = q·g with q coprime to petals: q interleaved bands, `petals` lobes
  const g = 6;
  const q = petals % 7 === 0 ? 5 : 7;
  const R = petals * g;
  const r = q * g;
  const maxD = r * 1.15;
  const paths = Array.from({ length: layers }, (_, i) =>
    rosettePath({
      R,
      r,
      d: r * (0.55 + (0.6 * i) / Math.max(layers - 1, 1)),
      scale: (half * 0.96) / (R - r + maxD),
      steps: 260 * q,
      phase: (i * Math.PI) / (petals * 2),
    }),
  );
  return (
    <svg
      viewBox={`${-half} ${-half} ${size} ${size}`}
      width={size}
      height={size}
      className={className}
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
    >
      {paths.map((d, i) => (
        <path key={i} d={d} opacity={1 - i * 0.14} />
      ))}
    </svg>
  );
}
