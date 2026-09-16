import React from 'react';
import {
  TRACK_CENTER_X,
  TRACK_CENTER_Y,
  OVAL_ZOOM,
  JCUP_CENTER_X,
  JCUP_CENTER_Y,
  JCUP_TRACK_WIDTH,
  jcupSegments,
  jcupSegFractions,
  sampleJCupLocal,
  type CourseId,
} from './courses';

interface CircuitSceneProps {
  courseId?: CourseId;
  /** Drops the stadium decoration (crowd/stands/banners/lights/containers)
   * so the track itself gets the screen — used on the race screen. */
  minimal?: boolean;
  /** Shrinks the drawn track around its center — used for the Garage
   * preview so the whole course fits instead of being mostly hidden
   * behind the car-stage podium. Purely visual; gameplay always uses the
   * full-size geometry from courses.ts. */
  compact?: boolean;
}

function buildJCupPath(sStart: number, sEnd: number, steps: number): string {
  const parts: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const s = sStart + (sEnd - sStart) * (i / steps);
    const { x, y } = sampleJCupLocal(s * Math.PI * 2);
    parts.push(`${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`);
  }
  return parts.join(' ');
}

const JCUP_ROW_COLORS = ['#c81e1e', '#1d4ed8'];

function jcupTicks() {
  const nodes: React.ReactNode[] = [];
  let segStart = 0;
  const tickOffset = JCUP_TRACK_WIDTH / 2 + 8;
  jcupSegments.forEach((seg, i) => {
    const segEnd = jcupSegFractions[i];
    const color = JCUP_ROW_COLORS[Math.floor(i / 2) % 2];
    if (seg.type === 'straight') {
      const count = 8;
      for (let n = 0; n < count; n++) {
        const s = segStart + (segEnd - segStart) * (n / count);
        const { x, y, angle } = sampleJCupLocal(s * Math.PI * 2);
        const rad = (angle * Math.PI) / 180;
        const px = x - Math.sin(rad) * tickOffset;
        const py = y + Math.cos(rad) * tickOffset;
        nodes.push(
          <rect
            key={`s${i}-${n}`}
            x={px - 10}
            y={py - 6}
            width="20"
            height="12"
            rx="3"
            fill={n % 2 === 0 ? color : '#f5f5f5'}
            opacity="0.92"
            transform={`rotate(${angle + 90}, ${px}, ${py})`}
          />
        );
      }
    } else {
      const count = 7;
      const radius = seg.r + tickOffset;
      for (let n = 0; n < count; n++) {
        const theta = seg.thetaStart + (seg.thetaEnd - seg.thetaStart) * (n / count);
        const x = seg.hx + radius * Math.cos(theta);
        const y = seg.hy + radius * Math.sin(theta);
        const angleDeg = (theta * 180) / Math.PI;
        nodes.push(
          <rect
            key={`h${i}-${n}`}
            x={x - 10}
            y={y - 6}
            width="20"
            height="12"
            rx="3"
            fill={n % 2 === 0 ? color : '#f5f5f5'}
            opacity="0.92"
            transform={`rotate(${angleDeg + 90}, ${x}, ${y})`}
          />
        );
      }
    }
    segStart = segEnd;
  });
  return nodes;
}

/**
 * Shared stadium/circuit backdrop used by both the Garage and Race screens.
 * Pure decorative SVG layers (sky, stands, banners, fence, track) so the two
 * screens share one consistent "mini 4WD racing venue" world. The track
 * itself switches shape based on `courseId` (see courses.ts for the actual
 * car-path math, which mirrors this drawing).
 */
export const CircuitScene: React.FC<CircuitSceneProps> = ({ courseId = 'oval', minimal = false, compact = false }) => {
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

      {minimal ? (
        <>
          {/* flat dark backdrop — no stadium theatrics, all the room goes to the track */}
          <rect x="0" y="0" width="1600" height="900" fill="#0a1220" />
          <rect x="0" y="0" width="1600" height="900" fill="url(#grass)" opacity="0.35" />
        </>
      ) : (
        <>
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
        </>
      )}

      {/* both course groups shrink together around a shared anchor for the
          compact Garage preview, so the whole loop fits on screen */}
      <g transform={compact ? 'translate(800,560) scale(0.6) translate(-800,-560)' : undefined}>

      {/* track oval — scaled down (OVAL_ZOOM) to match the Jr. circuit's
          compact footprint; courses.ts applies the same factor to the car
          path so the two stay in sync. */}
      {courseId === 'oval' && (
      <g transform={`translate(${TRACK_CENTER_X},${TRACK_CENTER_Y}) scale(${OVAL_ZOOM}) translate(${-TRACK_CENTER_X},${-TRACK_CENTER_Y})`}>
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
      )}

      {/* track: ジャパンカップJr.サーキット — 4 wavy rows snaking back and
          forth, joined by hairpins that alternate sides (the row3→row0
          closing hairpin nests around the smaller row1→row2 one),
          matching the real set's dense ストレート＋ウェーブ＋カーブ layout. */}
      {courseId === 'figure8' && (
      <g>
        <path d={buildJCupPath(0, 1, 320)} fill="none" stroke="#000" strokeWidth={JCUP_TRACK_WIDTH + 32} strokeLinecap="round" opacity="0.45" filter="url(#soft)" />
        <path d={buildJCupPath(0, 1, 320)} fill="none" stroke="#3a3e46" strokeWidth={JCUP_TRACK_WIDTH} strokeLinecap="round" />
        <path d={buildJCupPath(0, 1, 320)} fill="none" stroke="#4d525c" strokeWidth={JCUP_TRACK_WIDTH - 14} strokeLinecap="round" />
        <path d={buildJCupPath(0, 1, 320)} fill="none" stroke="#e8ecef" strokeWidth="3" strokeDasharray="18,14" opacity="0.4" />

        {/* red/blue curb alternating by row, echoing the real set's lane colors */}
        {jcupTicks()}

        {/* start / finish checker line, placed at row 0's start */}
        {(() => {
          const start = sampleJCupLocal(0.001);
          return (
            <g transform={`translate(${start.x},${start.y}) rotate(${start.angle})`}>
              {Array.from({ length: 6 }).map((_, i) => (
                <rect key={i} x={-7} y={i * 8 - 24} width="14" height="8" fill={i % 2 === 0 ? '#0c0c0c' : '#f4f4f4'} />
              ))}
            </g>
          );
        })()}

        <text
          x={JCUP_CENTER_X}
          y={JCUP_CENTER_Y + 6}
          textAnchor="middle"
          fill="#ffffff"
          opacity="0.06"
          fontFamily="Rajdhani, sans-serif"
          fontWeight={900}
          fontSize="46"
        >
          JAPAN CUP Jr.
        </text>
      </g>
      )}
      </g>
    </svg>
  );
};
