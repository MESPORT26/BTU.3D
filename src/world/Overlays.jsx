import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { useGame, aimAt, tapLanding } from '../game.js';
import { fromWorld } from './coords.js';

/* Aim zones on their court: 3 depths × 3 lanes. Tap anywhere for an exact aim. */
export function AimZones() {
  const targets = useGame((s) => s.targets);
  if (!targets) return null;
  const rows = targets.serve ? [[6, 8]] : [[0, 3], [3, 6], [6, 8]];
  const onDown = (e) => {
    e.stopPropagation();
    const p = fromWorld(1, e.point.x, e.point.z);
    if (p[0] < 0.1 || p[0] > 8 || p[1] < 0 || p[1] > 8) return;
    aimAt(p[0], p[1]);
  };
  return (
    <group>
      {rows.map(([a, b]) => [0, 1, 2].map((l) => {
        const y0 = (l * 8) / 3, y1 = ((l + 1) * 8) / 3;
        return (
          <mesh key={a + '-' + l} position={[(y0 + y1) / 2 - 4, 0.02, -(a + b) / 2]} rotation={[-Math.PI / 2, 0, 0]} onPointerDown={onDown}>
            <planeGeometry args={[8 / 3 - 0.12, b - a - 0.12]} />
            <meshBasicMaterial color={targets.serve ? '#FF9F1C' : '#00A79E'} transparent opacity={0.22} depthWrite={false} />
          </mesh>
        );
      }))}
      {/* catch taps in the gaps */}
      <mesh position={[0, 0.015, -4]} rotation={[-Math.PI / 2, 0, 0]} onPointerDown={onDown}>
        <planeGeometry args={[8, 8]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
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
