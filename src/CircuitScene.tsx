import React from 'react';
import {
  TRACK_CENTER_X,
  TRACK_CENTER_Y,
  OVAL_ZOOM,
  OVAL_TRACK_WIDTH,
  ovalSegFractions,
  sampleOvalHexLocal,
  JCUP_CENTER_X,
  JCUP_CENTER_Y,
  JCUP_TRACK_WIDTH,
  jcupSegments,
  jcupSegFractions,
  sampleJCupLocal,
  HILL_ZOOM,
  HILL_CENTER_Y,
  HILL_TRACK_WIDTH,
  HILL_HALF_LEN,
  hillSegments,
  hillSegFractions,
  sampleHillLocal,
  type CourseId,
} from './courses';

function buildOvalPath(tStart: number, tEnd: number, steps: number): string {
  const parts: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = tStart + (tEnd - tStart) * (i / steps);
    const { x, y } = sampleOvalHexLocal(t);
    parts.push(`${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`);
  }
  return parts.join(' ');
}

function ovalTicks(tStart: number, tEnd: number, count: number, color: string, key: string) {
  const nodes: React.ReactNode[] = [];
  const tickOffset = OVAL_TRACK_WIDTH / 2 + 9;
  for (let n = 0; n < count; n++) {
    const t = tStart + (tEnd - tStart) * (n / count);
    const { x, y, angleDeg } = sampleOvalHexLocal(t);
    const rad = (angleDeg * Math.PI) / 180;
    const px = x - Math.sin(rad) * tickOffset;
    const py = y + Math.cos(rad) * tickOffset;
    nodes.push(
      <rect
        key={`${key}${n}`}
        x={px - 9}
        y={py - 6}
        width="18"
        height="12"
        rx="3"
        fill={n % 2 === 0 ? color : '#f5f5f5'}
        opacity="0.92"
        transform={`rotate(${angleDeg + 90}, ${px}, ${py})`}
      />
    );
  }
  return nodes;
}

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

function buildHillPath(tStart: number, tEnd: number, steps: number): string {
  const parts: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = tStart + (tEnd - tStart) * (i / steps);
    const { x, y } = sampleHillLocal(t);
    parts.push(`${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`);
  }
  return parts.join(' ');
}

// 上り＝アンバー、下り＝シアン、ヘアピンはニュートラルなグレーの縁石で、
// パワーが効く区間が一目でわかるように色分けする。
const HILL_UP_COLOR = '#f59e0b';
const HILL_UP_DARK = '#92400e';
const HILL_DOWN_COLOR = '#22d3ee';
const HILL_DOWN_DARK = '#155e75';
const HILL_NEUTRAL_COLOR = '#cbd5e1';

function hillTicks() {
  const nodes: React.ReactNode[] = [];
  let segStart = 0;
  const tickOffset = HILL_TRACK_WIDTH / 2 + 8;
  hillSegments.forEach((seg, i) => {
    const segEnd = hillSegFractions[i];
    if (seg.type === 'straight') {
      const color = seg.slope === 1 ? HILL_UP_COLOR : HILL_DOWN_COLOR;
      const count = 12;
      for (let n = 0; n < count; n++) {
        const s = segStart + (segEnd - segStart) * (n / count);
        const { x, y, angleDeg } = sampleHillLocal(s * Math.PI * 2);
        const rad = (angleDeg * Math.PI) / 180;
        const px = x - Math.sin(rad) * tickOffset;
        const py = y + Math.cos(rad) * tickOffset;
        nodes.push(
          <rect
            key={`ht${i}-${n}`}
            x={px - 10}
            y={py - 6}
            width="20"
            height="12"
            rx="3"
            fill={n % 2 === 0 ? color : '#f5f5f5'}
            opacity="0.92"
            transform={`rotate(${angleDeg + 90}, ${px}, ${py})`}
          />
        );
      }
      // 進行方向＆傾斜を示すシェブロン矢印
      const chevCount = 5;
      for (let n = 1; n < chevCount; n++) {
        const s = segStart + (segEnd - segStart) * (n / chevCount);
        const { x, y } = sampleHillLocal(s * Math.PI * 2);
        const pointDy = seg.dir === -1 ? -16 : 16;
        const baseDy = seg.dir === -1 ? 10 : -10;
        nodes.push(
          <polygon
            key={`hc${i}-${n}`}
            points={`${x - 15},${y + baseDy} ${x + 15},${y + baseDy} ${x},${y + baseDy + pointDy}`}
            fill={color}
            opacity="0.5"
          />
        );
      }
    } else {
      const count = 8;
      const radius = seg.r + tickOffset;
      for (let n = 0; n < count; n++) {
        const theta = seg.thetaStart + (seg.thetaEnd - seg.thetaStart) * (n / count);
        const x = seg.hx + radius * Math.cos(theta);
        const y = seg.hy + radius * Math.sin(theta);
        const angleDeg = (theta * 180) / Math.PI;
        nodes.push(
          <rect
            key={`hh${i}-${n}`}
            x={x - 10}
            y={y - 6}
            width="20"
            height="12"
            rx="3"
            fill={n % 2 === 0 ? HILL_NEUTRAL_COLOR : '#f5f5f5'}
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
        <linearGradient id="bridgeGrad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#7a1010" />
          <stop offset="50%" stopColor="#d43030" />
          <stop offset="100%" stopColor="#7a1010" />
        </linearGradient>
        <linearGradient id="hillUpGrad" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor="#3a3e46" />
          <stop offset="100%" stopColor={HILL_UP_DARK} />
        </linearGradient>
        <linearGradient id="hillDownGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3a3e46" />
          <stop offset="100%" stopColor={HILL_DOWN_DARK} />
        </linearGradient>
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
      <g transform={compact ? 'translate(800,500) scale(0.46) translate(-800,-500)' : undefined}>

      {/* track oval — now a figure-8 (crosses itself once per lap at the
          center) instead of one simple loop: longer, and it actually
          crosses. Built in origin-centered local units, positioned by one
          group transform (courses.ts applies the identical zoom to the
          car path). The crossing is drawn as a raised bridge using paint
          order, since this is a flat top-down scene. */}
      {courseId === 'oval' && (() => {
        // Segment 0 (straight R3→L1) and segment 6 (straight L3→R1) are the
        // two edges that cross near the origin — split rendering there so
        // the second half's bridge paints over the first half.
        const splitT = ovalSegFractions[5] * Math.PI * 2;
        const cross1T = (ovalSegFractions[0] / 2) * Math.PI * 2;
        const cross2T = ((ovalSegFractions[5] + ovalSegFractions[6]) / 2) * Math.PI * 2;
        return (
      <g transform={`translate(${TRACK_CENTER_X},${TRACK_CENTER_Y}) scale(${OVAL_ZOOM})`}>
        <path d={buildOvalPath(0, Math.PI * 2, 260)} fill="none" stroke="#000" strokeWidth={OVAL_TRACK_WIDTH + 38} strokeLinecap="round" opacity="0.45" filter="url(#soft)" />

        {/* first half (drawn first so the second half's bridge paints over it at the crossing) */}
        <path d={buildOvalPath(0, splitT, 150)} fill="none" stroke="#3a3e46" strokeWidth={OVAL_TRACK_WIDTH} strokeLinecap="round" />
        <path d={buildOvalPath(0, splitT, 150)} fill="none" stroke="#4d525c" strokeWidth={OVAL_TRACK_WIDTH - 16} strokeLinecap="round" />
        <path d={buildOvalPath(0, splitT, 150)} fill="none" stroke="#e8ecef" strokeWidth="4" strokeDasharray="26,18" opacity="0.35" />
        {ovalTicks(0, splitT, 16, '#c81e1e', 'o1-')}

        {/* under-bridge tunnel mouth at the crossing */}
        <ellipse cx="0" cy="0" rx={OVAL_TRACK_WIDTH * 0.85} ry={OVAL_TRACK_WIDTH * 0.55} fill="#050608" opacity="0.55" filter="url(#soft)" />
        <path d={buildOvalPath(cross1T - 0.18, cross1T + 0.18, 12)} fill="none" stroke="url(#bridgeGrad)" strokeWidth={OVAL_TRACK_WIDTH} strokeLinecap="round" opacity="0.9" />

        {/* second half (the "over" bridge) */}
        <path d={buildOvalPath(splitT, Math.PI * 2, 150)} fill="none" stroke="#3a3e46" strokeWidth={OVAL_TRACK_WIDTH} strokeLinecap="round" />
        <path d={buildOvalPath(splitT, Math.PI * 2, 150)} fill="none" stroke="#4d525c" strokeWidth={OVAL_TRACK_WIDTH - 16} strokeLinecap="round" />
        <path d={buildOvalPath(splitT, Math.PI * 2, 150)} fill="none" stroke="#e8ecef" strokeWidth="4" strokeDasharray="26,18" opacity="0.35" />
        {ovalTicks(splitT, Math.PI * 2, 16, '#1d4ed8', 'o2-')}

        {/* bridge deck highlight right at the crossing, drawn last so it reads on top */}
        <path d={buildOvalPath(cross2T - 0.18, cross2T + 0.18, 12)} fill="none" stroke="#e8ecef" strokeWidth={OVAL_TRACK_WIDTH + 6} strokeLinecap="round" opacity="0.14" />

        {/* start / finish checker line, near a loop tip */}
        {(() => {
          const start = sampleOvalHexLocal(Math.PI / 2 - 0.05);
          return (
            <g transform={`translate(${start.x},${start.y}) rotate(${start.angleDeg})`}>
              {Array.from({ length: 8 }).map((_, i) => (
                <rect key={i} x={-8} y={i * 9 - 36} width="16" height="9" fill={i % 2 === 0 ? '#0c0c0c' : '#f4f4f4'} />
              ))}
            </g>
          );
        })()}

        {/* center logo watermark */}
        <text
          x="0"
          y="-140"
          textAnchor="middle"
          fill="#ffffff"
          opacity="0.05"
          fontFamily="Rajdhani, sans-serif"
          fontWeight={900}
          fontSize="56"
        >
          MINI 4WD
        </text>
      </g>
        );
      })()}

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

      {/* track: パワーヒルウェイ — 上り一本・下り一本の超ロングストレートを
          ヘアピン2つで繋いだ、パワー勝負のロングコース。上り区間はアンバー、
          下り区間はシアンのグラデーション＆縁石で塗り分け、シェブロン矢印で
          傾斜と進行方向を示す。 */}
      {courseId === 'hill' && (() => {
        const upEndT = hillSegFractions[0] * Math.PI * 2;
        const downStartT = hillSegFractions[1] * Math.PI * 2;
        const downEndT = hillSegFractions[2] * Math.PI * 2;
        return (
      <g transform={`translate(${TRACK_CENTER_X},${HILL_CENTER_Y}) scale(${HILL_ZOOM})`}>
        <path d={buildHillPath(0, Math.PI * 2, 220)} fill="none" stroke="#000" strokeWidth={HILL_TRACK_WIDTH + 34} strokeLinecap="round" opacity="0.45" filter="url(#soft)" />

        {/* 上り区間（アンバー） */}
        <path d={buildHillPath(0, upEndT, 100)} fill="none" stroke="url(#hillUpGrad)" strokeWidth={HILL_TRACK_WIDTH} strokeLinecap="round" />
        <path d={buildHillPath(0, upEndT, 100)} fill="none" stroke={HILL_UP_COLOR} strokeWidth={HILL_TRACK_WIDTH - 16} strokeLinecap="round" opacity="0.22" />
        <path d={buildHillPath(0, upEndT, 100)} fill="none" stroke="#e8ecef" strokeWidth="4" strokeDasharray="26,18" opacity="0.35" />

        {/* 上りヘアピン */}
        <path d={buildHillPath(upEndT, downStartT, 60)} fill="none" stroke="#3a3e46" strokeWidth={HILL_TRACK_WIDTH} strokeLinecap="round" />
        <path d={buildHillPath(upEndT, downStartT, 60)} fill="none" stroke="#4d525c" strokeWidth={HILL_TRACK_WIDTH - 16} strokeLinecap="round" />
        <path d={buildHillPath(upEndT, downStartT, 60)} fill="none" stroke="#e8ecef" strokeWidth="4" strokeDasharray="26,18" opacity="0.35" />

        {/* 下り区間（シアン） */}
        <path d={buildHillPath(downStartT, downEndT, 100)} fill="none" stroke="url(#hillDownGrad)" strokeWidth={HILL_TRACK_WIDTH} strokeLinecap="round" />
        <path d={buildHillPath(downStartT, downEndT, 100)} fill="none" stroke={HILL_DOWN_COLOR} strokeWidth={HILL_TRACK_WIDTH - 16} strokeLinecap="round" opacity="0.22" />
        <path d={buildHillPath(downStartT, downEndT, 100)} fill="none" stroke="#e8ecef" strokeWidth="4" strokeDasharray="26,18" opacity="0.35" />

        {/* 下りヘアピン */}
        <path d={buildHillPath(downEndT, Math.PI * 2, 60)} fill="none" stroke="#3a3e46" strokeWidth={HILL_TRACK_WIDTH} strokeLinecap="round" />
        <path d={buildHillPath(downEndT, Math.PI * 2, 60)} fill="none" stroke="#4d525c" strokeWidth={HILL_TRACK_WIDTH - 16} strokeLinecap="round" />
        <path d={buildHillPath(downEndT, Math.PI * 2, 60)} fill="none" stroke="#e8ecef" strokeWidth="4" strokeDasharray="26,18" opacity="0.35" />

        {hillTicks()}

        {/* start / finish checker line（上り区間の始点） */}
        {(() => {
          const start = sampleHillLocal(0.001);
          return (
            <g transform={`translate(${start.x},${start.y}) rotate(${start.angleDeg})`}>
              {Array.from({ length: 8 }).map((_, i) => (
                <rect key={i} x={-8} y={i * 9 - 36} width="16" height="9" fill={i % 2 === 0 ? '#0c0c0c' : '#f4f4f4'} />
              ))}
            </g>
          );
        })()}

        {/* 上り／下りラベル */}
        {(() => {
          const upMid = sampleHillLocal((hillSegFractions[0] / 2) * Math.PI * 2);
          const downMid = sampleHillLocal(((hillSegFractions[1] + hillSegFractions[2]) / 2) * Math.PI * 2);
          return (
            <>
              <g transform={`translate(${upMid.x},${upMid.y}) rotate(${upMid.angleDeg})`}>
                <text textAnchor="middle" fill={HILL_UP_COLOR} opacity="0.8" fontFamily="Rajdhani, sans-serif" fontWeight={800} fontSize="34" letterSpacing="2">▲ POWER UP</text>
              </g>
              <g transform={`translate(${downMid.x},${downMid.y}) rotate(${downMid.angleDeg})`}>
                <text textAnchor="middle" fill={HILL_DOWN_COLOR} opacity="0.8" fontFamily="Rajdhani, sans-serif" fontWeight={800} fontSize="34" letterSpacing="2">▼ DOWN HILL</text>
              </g>
            </>
          );
        })()}

        <text
          x="0"
          y={-(HILL_HALF_LEN + 90)}
          textAnchor="middle"
          fill="#ffffff"
          opacity="0.06"
          fontFamily="Rajdhani, sans-serif"
          fontWeight={900}
          fontSize="52"
        >
          POWER HILLWAY
        </text>
      </g>
        );
      })()}
      </g>
    </svg>
  );
};
