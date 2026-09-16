import { forwardRef, useImperativeHandle, useRef } from 'react';

/**
 * The in-race machine. Uses the actual machine photo (so it's clearly the
 * body the player picked in the garage) as a proper positioned/animated
 * game object rather than a flat, unremarkable sprite: it gets its own
 * glow, ground shadow and speed trail, and the race loop drives its
 * position, heading, suspension bounce and cornering lean every frame via
 * direct style writes on the exposed refs (kept imperative for animation
 * performance, matching the rest of the race loop in Race.tsx).
 */
export interface RaceCarHandle {
  root: HTMLDivElement | null;
  bounce: HTMLDivElement | null;
  rotate: HTMLDivElement | null;
  trail: HTMLDivElement | null;
}

interface RaceCarProps {
  bodyId: string | null;
  isOut: boolean;
}

function getCarImage(bodyId: string | null): string {
  if (bodyId === 'b_sonic') return '/sonic.jpg';
  if (bodyId === 'b_tridagger') return '/tridagger.jpg';
  return '/magnum.jpg';
}

const GLOW: Record<string, string> = {
  b_magnum: '#5aabff',
  b_sonic: '#ff5a5a',
  b_tridagger: '#ffb020',
};
const DEFAULT_GLOW = GLOW.b_magnum;

export const RaceCar = forwardRef<RaceCarHandle, RaceCarProps>(({ bodyId, isOut }, ref) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const bounceRef = useRef<HTMLDivElement>(null);
  const rotateRef = useRef<HTMLDivElement>(null);
  const trailRef = useRef<HTMLDivElement>(null);

  useImperativeHandle(ref, () => ({
    get root() { return rootRef.current; },
    get bounce() { return bounceRef.current; },
    get rotate() { return rotateRef.current; },
    get trail() { return trailRef.current; },
  }));

  const glow = (bodyId && GLOW[bodyId]) || DEFAULT_GLOW;

  return (
    <div ref={rootRef} className="mc-root">
      <div ref={bounceRef} className="mc-bounce">
        <div ref={trailRef} className="mc-trail" style={{ background: `radial-gradient(circle, ${glow}88, transparent 70%)` }} />
        <div className="mc-shadow" />
        <div ref={rotateRef} className={`mc-rotate${isOut ? ' is-out' : ''}`}>
          <div className="mc-glow-ring" style={{ boxShadow: `0 0 26px 8px ${glow}66, 0 0 60px 14px ${glow}33` }} />
          <img src={getCarImage(bodyId)} alt="Machine" className="mc-photo" />
        </div>
      </div>
    </div>
  );
});

RaceCar.displayName = 'RaceCar';
