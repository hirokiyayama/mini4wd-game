import React from 'react';

// These mirror the numbers used by the <svg viewBox="0 0 1600 900"> track
// drawn below (center 800,690; outer asphalt edge rx=740/ry=205; inner
// infield edge rx=430/ry=112) so the race loop can compute a car path that
// actually matches what's drawn, instead of an independent guess.
const TRACK_VIEWBOX_W = 1600;
const TRACK_VIEWBOX_H = 900;
const TRACK_CENTER_X = 800;
const TRACK_CENTER_Y = 690;
const TRACK_LANE_RX = (740 + 430) / 2;
const TRACK_LANE_RY = (205 + 112) / 2;

export interface TrackGeometry {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}

/**
 * Converts the track's fixed SVG-space ellipse (the asphalt lane midline)
 * into on-screen pixel coordinates for the current window size, replicating
 * the `preserveAspectRatio="xMidYMax slice"` scaling used by the <svg>
 * below (uniform scale to cover the viewport, centered horizontally,
 * bottom-aligned vertically).
 */
export function getTrackGeometry(viewportWidth: number, viewportHeight: number): TrackGeometry {
  const scale = Math.max(viewportWidth / TRACK_VIEWBOX_W, viewportHeight / TRACK_VIEWBOX_H);
  const offsetX = (viewportWidth - TRACK_VIEWBOX_W * scale) / 2;
  const offsetY = viewportHeight - TRACK_VIEWBOX_H * scale;
  return {
    cx: offsetX + TRACK_CENTER_X * scale,
    cy: offsetY + TRACK_CENTER_Y * scale,
    rx: TRACK_LANE_RX * scale,
    ry: TRACK_LANE_RY * scale,
  };
}

/**
 * Shared stadium/circuit backdrop used by both the Garage and Race screens.
 * Pure decorative SVG layers (sky, stands, banners, fence, track) so the two
 * screens share one consistent "mini 4WD racing venue" world.
 */
export const CircuitScene: React.FC = () => {
  const crowd = Array.from({ length: 60 }).map((_, i) => {
    const row = Math.floor(i / 20);
    const col = i % 20;
    const x = 40 + col * 78 + (row % 2 === 0 ? 0 : 20);
    const y = 118 + row * 16;
    const palette = ['#e6c26b', '#d1495b', '#3f7cac', '#eaeaea', '#4a7c59'];
    return { x, y, c: palette[(i * 7) % palette.length] };
  });

  const tireStack = (cx: number, cy: number, count: number, scale = 1) =>
    Array.from({ length: count }).map((_, i) => (
      <ellipse
        key={i}
        cx={cx}
        cy={cy - i * 13 * scale}
        rx={26 * scale}
        ry={13 * scale}
        fill="#1b1b1b"
        stroke="#3a3a3a"
        strokeWidth={2}
      />
    ));

  return (
    <svg
      viewBox="0 0 1600 900"
      preserveAspectRatio="xMidYMax slice"
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', zIndex: 0 }}
    >
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0d2f63" />
          <stop offset="45%" stopColor="#1c5c9e" />
          <stop offset="80%" stopColor="#6fa8d8" />
          <stop offset="100%" stopColor="#bcd9ef" />
        </linearGradient>
        <radialGradient id="sunGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#fff6d8" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#fff6d8" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="grass" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1f5c34" />
          <stop offset="100%" stopColor="#123a20" />
        </linearGradient>
        <radialGradient id="asphalt" cx="50%" cy="42%" r="65%">
          <stop offset="0%" stopColor="#3c3f45" />
          <stop offset="70%" stopColor="#232529" />
          <stop offset="100%" stopColor="#101114" />
        </radialGradient>
        <linearGradient id="standGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#31435e" />
          <stop offset="100%" stopColor="#1a2438" />
        </linearGradient>
        <linearGradient id="bannerBlue" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#1e40af" />
          <stop offset="100%" stopColor="#1d4ed8" />
        </linearGradient>
        <linearGradient id="bannerRed" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#dc2626" />
          <stop offset="100%" stopColor="#b91c1c" />
        </linearGradient>
        <linearGradient id="bannerGold" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#d97706" />
          <stop offset="100%" stopColor="#92400e" />
        </linearGradient>
        <linearGradient id="containerBlue" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3468b0" />
          <stop offset="100%" stopColor="#204a80" />
        </linearGradient>
        <filter id="soft" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="8" />
        </filter>
      </defs>

      {/* sky */}
      <rect x="0" y="0" width="1600" height="620" fill="url(#sky)" />
      <circle cx="1240" cy="120" r="140" fill="url(#sunGlow)" />
      {/* clouds */}
      {[[140, 90, 1], [430, 60, 0.8], [980, 70, 0.7], [1440, 140, 0.9]].map(([x, y, s], i) => (
        <g key={i} opacity={0.55} filter="url(#soft)">
          <ellipse cx={x} cy={y} rx={70 * (s as number)} ry={22 * (s as number)} fill="#ffffff" />
          <ellipse cx={(x as number) + 50 * (s as number)} cy={(y as number) + 8} rx={46 * (s as number)} ry={18 * (s as number)} fill="#ffffff" />
        </g>
      ))}
      {/* distant mountains */}
      <polygon points="0,420 180,300 340,400 520,270 720,410 900,320 1080,410 1260,290 1440,400 1600,330 1600,460 0,460" fill="#5578a8" opacity="0.45" />

      {/* grandstand structures */}
      <g>
        <path d="M0,300 L1600,300 L1600,420 L0,420 Z" fill="url(#standGrad)" opacity="0.92" />
        <path d="M0,300 L1600,300 L1600,320 L0,320 Z" fill="#111a2c" opacity="0.5" />
        {crowd.map((p, i) => (
          <rect key={i} x={p.x} y={p.y} width="10" height="12" rx="2" fill={p.c} opacity="0.85" />
        ))}
        <rect x="0" y="405" width="1600" height="18" fill="#0c1220" />
      </g>

      {/* floodlight towers — kept off-center so they never sit directly
          behind the car stage in the middle of the screen */}
      {[150, 1450].map((x, i) => (
        <g key={i}>
          <rect x={x - 4} y={170} width="8" height="150" fill="#39435a" />
          <rect x={x - 34} y={150} width="68" height="26" rx="4" fill="#20293b" stroke="#4a5878" strokeWidth="1.5" />
          {[0, 1, 2, 3].map((n) => (
            <circle key={n} cx={x - 26 + n * 18} cy={163} r="6" fill="#fff8dd" opacity="0.95" />
          ))}
          <ellipse cx={x} cy={190} rx="90" ry="34" fill="#fff6d8" opacity="0.12" filter="url(#soft)" />
        </g>
      ))}

      {/* sponsor banners along the back fence — kept to the far sides so the
          car stage in the middle of the screen never overlaps them */}
      {[
        { x: 100, w: 210, grad: 'url(#bannerBlue)', text: 'MINI 4WD', size: 19 },
        { x: 100, w: 210, y: 60, grad: 'url(#bannerGold)', text: 'SPEED BATTLE', size: 14 },
        { x: 1290, w: 210, grad: 'url(#bannerRed)', text: 'RACING', size: 19 },
        { x: 1290, w: 210, y: 60, grad: 'url(#bannerBlue)', text: 'CHAMPIONSHIP', size: 13 },
      ].map((b, i) => (
        <g key={i}>
          <rect x={b.x} y={310 + (b.y ?? 0)} width={b.w} height={44} rx="6" fill={b.grad} stroke="#0c1220" strokeWidth="2" />
          <text
            x={b.x + b.w / 2}
            y={310 + (b.y ?? 0) + 28}
            textAnchor="middle"
            fill="#ffffff"
            fontFamily="Rajdhani, sans-serif"
            fontWeight={800}
            fontSize={b.size}
            letterSpacing="1.5"
          >
            {b.text}
          </text>
        </g>
      ))}

      {/* shipping containers + tire stacks decorating the paddock corners */}
      <g>
        <rect x="60" y="440" width="150" height="90" rx="4" fill="url(#containerBlue)" stroke="#122447" strokeWidth="3" />
        {[0, 1, 2, 3, 4].map((n) => (
          <line key={n} x1={70} y1={452 + n * 15} x2={200} y2={452 + n * 15} stroke="#16346a" strokeWidth="2" opacity="0.6" />
        ))}
        <rect x="1400" y="440" width="150" height="90" rx="4" fill="url(#containerBlue)" stroke="#122447" strokeWidth="3" />
        {[0, 1, 2, 3, 4].map((n) => (
          <line key={n} x1={1410} y1={452 + n * 15} x2={1540} y2={452 + n * 15} stroke="#16346a" strokeWidth="2" opacity="0.6" />
        ))}
        {tireStack(240, 545, 4)}
        {tireStack(1370, 545, 4)}
        {tireStack(280, 552, 3, 0.85)}
      </g>

      {/* grass infield */}
      <rect x="0" y="500" width="1600" height="400" fill="url(#grass)" />
      {Array.from({ length: 14 }).map((_, i) => (
        <rect key={i} x={i * 120 - 40} y="500" width="60" height="400" fill="#ffffff" opacity={i % 2 === 0 ? 0.03 : 0} />
      ))}

      {/* track oval */}
      <g>
        <ellipse cx="800" cy="700" rx="760" ry="220" fill="#151719" opacity="0.55" filter="url(#soft)" />
        <ellipse cx="800" cy="690" rx="740" ry="205" fill="url(#asphalt)" />
        <ellipse cx="800" cy="690" rx="740" ry="205" fill="none" stroke="#e8ecef" strokeWidth="5" strokeDasharray="34,22" opacity="0.35" />
        <ellipse cx="800" cy="690" rx="430" ry="112" fill="url(#grass)" />
        <ellipse cx="800" cy="690" rx="430" ry="112" fill="none" stroke="#e8ecef" strokeWidth="3" strokeDasharray="24,16" opacity="0.3" />

        {/* red / white curb along both edges */}
        {Array.from({ length: 26 }).map((_, i) => {
          const a = (i / 26) * Math.PI * 2;
          const bx = 800 + 762 * Math.cos(a);
          const by = 690 + 214 * Math.sin(a);
          const angleDeg = (a * 180) / Math.PI;
          return (
            <rect
              key={`o${i}`}
              x={bx - 12}
              y={by - 7}
              width="24"
              height="14"
              rx="3"
              fill={i % 2 === 0 ? '#c81e1e' : '#f5f5f5'}
              opacity="0.92"
              transform={`rotate(${angleDeg + 90}, ${bx}, ${by})`}
            />
          );
        })}
        {Array.from({ length: 16 }).map((_, i) => {
          const a = (i / 16) * Math.PI * 2;
          const bx = 800 + 408 * Math.cos(a);
          const by = 690 + 100 * Math.sin(a);
          const angleDeg = (a * 180) / Math.PI;
          return (
            <rect
              key={`i${i}`}
              x={bx - 10}
              y={by - 6}
              width="20"
              height="12"
              rx="3"
              fill={i % 2 === 0 ? '#c81e1e' : '#f5f5f5'}
              opacity="0.9"
              transform={`rotate(${angleDeg + 90}, ${bx}, ${by})`}
            />
          );
        })}

        {/* start / finish checker line */}
        <g transform="translate(800,895) rotate(0)">
          {Array.from({ length: 10 }).map((_, i) => (
            <rect
              key={i}
              x={-45 + i * 10}
              y={-108}
              width="10"
              height="18"
              fill={i % 2 === 0 ? '#0c0c0c' : '#f4f4f4'}
            />
          ))}
        </g>

        {/* center logo watermark */}
        <text
          x="800"
          y="700"
          textAnchor="middle"
          fill="#ffffff"
          opacity="0.05"
          fontFamily="Rajdhani, sans-serif"
          fontWeight={900}
          fontSize="72"
        >
          MINI 4WD
        </text>
      </g>
    </svg>
  );
};
