import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { useGame, aimAt, tapLanding } from '../game.js';
import { fromWorld } from './coords.js';

/* Which depths each shot can reach (as in the 2D game) */
const ROWS = { drop: ['short'], lob: ['mid', 'deep'], block: ['short', 'mid'], hook: ['mid', 'deep'] };
const BAND = { short: [0, 3], mid: [3, 6], deep: [6, 8] };
const BAND_NAME = { short: '0–3 m', mid: '3–6 m', deep: '6–8 m' };

function Zone({ x0, x1, y0, y1, color, label, hot, onPick, onHover }) {
  /* own-frame x (from net) / y (across) on their side → world */
  const cx = (y0 + y1) / 2 - 4, cz = -(x0 + x1) / 2, w = y1 - y0 - 0.1, d = x1 - x0 - 0.1;
  const edge = useMemo(() => new THREE.PlaneGeometry(w, d), [w, d]);
  return (
    <group>
      <mesh position={[cx, 0.02, cz]} rotation={[-Math.PI / 2, 0, 0]}
        onPointerDown={(e) => { e.stopPropagation(); onPick(e.point); }}
        onPointerOver={(e) => { e.stopPropagation(); onHover(true); }}
        onPointerOut={() => onHover(false)}>
        <planeGeometry args={[w, d]} />
        <meshBasicMaterial color={hot === 2 ? '#FF4D6D' : color} transparent opacity={hot === 2 ? 0.55 : hot === 1 ? 0.38 : 0.2} depthWrite={false} />
      </mesh>
      {/* outline */}
      <lineSegments position={[cx, 0.025, cz]} rotation={[-Math.PI / 2, 0, 0]}>
        <edgesGeometry args={[edge]} />
        <lineBasicMaterial color={hot === 2 ? '#FF4D6D' : color} transparent opacity={hot ? 1 : 0.7} />
      </lineSegments>
      {label && (
        <Html center position={[cx, 0.05, cz]} zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}>
          <div className={'zlabel' + (hot === 2 ? ' hot' : '')} style={{ color: hot === 2 ? '#fff' : color, background: hot === 2 ? '#FF4D6D' : 'rgba(255,255,255,.85)' }}>{label}</div>
        </Html>
      )}
    </group>
  );
}

/*
 * Serve: five numbered lanes across their court (tap a lane, the exact spot is your aim).
 * Shot: nine sections (3 depths × 3 lanes) limited to what your shot can reach; the one you tap lights up.
 */
export function AimZones() {
  const targets = useGame((s) => s.targets);
  const sel = useGame((s) => s.rail && s.rail.sel);
  const [hover, setHover] = useState(null);
  const [picked, setPicked] = useState(null);
  useEffect(() => { setPicked(null); setHover(null); }, [targets, sel]);
  if (!targets) return null;
  const pick = (key, p) => {
    if (picked) return;
    const o = fromWorld(1, p.x, p.z);
    if (o[0] < 0.1 || o[0] > 8 || o[1] < 0 || o[1] > 8) return;
    setPicked(key);
    setTimeout(() => aimAt(o[0], o[1]), 280); // let the highlight show first
  };
  const hotOf = (k) => (picked === k ? 2 : hover === k && !picked ? 1 : 0);
  if (targets.serve) {
    return (
      <group>
        {[0, 1, 2, 3, 4].map((b) => {
          const k = 's' + b;
          return <Zone key={k} x0={0.3} x1={8} y0={b * 1.6} y1={b * 1.6 + 1.6} color="#FF9F1C" label={String(b + 1)} hot={hotOf(k)} onPick={(p) => pick(k, p)} onHover={(h) => setHover(h ? k : null)} />;
        })}
      </group>
    );
  }
  const rows = ROWS[sel] || ['short', 'mid', 'deep'];
  return (
    <group>
      {rows.map((d) => [0, 1, 2].map((l) => {
        const k = d + l;
        return <Zone key={k} x0={BAND[d][0]} x1={BAND[d][1]} y0={(l * 8) / 3} y1={((l + 1) * 8) / 3} color="#00A79E" label={l === 1 ? BAND_NAME[d] : null} hot={hotOf(k)} onPick={(p) => pick(k, p)} onHover={(h) => setHover(h ? k : null)} />;
      }))}
    </group>
  );
}

/* The landing spot: a ring that closes and turns green → yellow → orange → red. Tap it to run. */
const RING_COLS = ['#2ECC71', '#2ECC71', '#FFD23F', '#FF9F1C', '#D6264B'].map((c) => new THREE.Color(c));
const RING_KEYS = [0, 0.3, 0.55, 0.8, 1];
function ringColor(u, out) {
  for (let i = 1; i < RING_KEYS.length; i++) if (u <= RING_KEYS[i]) return out.copy(RING_COLS[i - 1]).lerp(RING_COLS[i], (u - RING_KEYS[i - 1]) / (RING_KEYS[i] - RING_KEYS[i - 1]));
  return out.copy(RING_COLS[RING_COLS.length - 1]);
}
export function LandingRing() {
  const ring = useGame((s) => s.ring);
  const outer = useRef(), core = useRef();
  const c = useRef(new THREE.Color());
  useFrame(() => {
    if (!ring || !outer.current) return;
    const u = Math.min(1, (performance.now() - ring.t0) / ring.W);
    const col = ringColor(u, c.current);
    outer.current.material.color.copy(col);
    core.current.material.color.copy(col);
    const s = 1 - 0.3 * u;
    outer.current.scale.setScalar(s);
    core.current.scale.setScalar(1 + 0.08 * Math.sin(performance.now() / 120));
  });
  if (!ring) return null;
  return (
    <group position={[ring.pos[0], 0.03, ring.pos[1]]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.005, 0]}>
        <ringGeometry args={[1.02, 1.12, 56]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.9} depthWrite={false} />
      </mesh>
      <mesh ref={outer} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.8, 1.02, 56]} />
        <meshBasicMaterial transparent opacity={0.95} depthWrite={false} />
      </mesh>
      <mesh ref={core} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.55, 40]} />
        <meshBasicMaterial transparent opacity={0.95} depthWrite={false} />
      </mesh>
      {/* generous invisible hit area */}
      {!ring.auto && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.3, 0]} onPointerDown={(e) => { e.stopPropagation(); tapLanding(); }}>
          <circleGeometry args={[1.5, 24]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      )}
      {!ring.auto && (
        <Html center position={[0, 0.05, 0]} zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
          <div className="tapLabel">TAP</div>
        </Html>
      )}
    </group>
  );
}

/* Floating labels: contact height, "Too late" */
export function Pops() {
  const pops = useGame((s) => s.pops);
  return pops.map((p) => (
    <Html key={p.id} center position={p.pos} zIndexRange={[15, 0]} style={{ pointerEvents: 'none' }}>
      <div className="pop" style={{ background: p.color }}>{p.text}</div>
    </Html>
  ));
}
