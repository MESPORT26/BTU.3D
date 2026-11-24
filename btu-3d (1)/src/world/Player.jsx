import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { TIME } from '../time.js';

/*
 * A procedural athlete: a jointed body (hips, spine, arms, legs, racket) animated in code.
 * Movement accelerates and brakes like a person, legs blend between run, shuffle and back-pedal,
 * and every shot is a real swing timed to contact. Swap in a rigged GLB (Mixamo/Quaternius) later
 * by keeping the same props: target, speed, swing, hop, dive, mood.
 */

const ACC = 7.5; // m/s²
const SWING_T = 0.6, CONTACT = 0.32;

function Limb({ len, r, color, children, ...p }) {
  return (
    <group {...p}>
      <mesh position={[0, -len / 2, 0]} castShadow>
        <capsuleGeometry args={[r, len - r * 2, 6, 12]} />
        <meshStandardMaterial color={color} roughness={0.65} />
      </mesh>
      <group position={[0, -len, 0]}>{children}</group>
    </group>
  );
}

const ease = (u) => u * u * (3 - 2 * u);
const lerp = (a, b, u) => a + (b - a) * u;
/* Keyframes [t, value] → value at u */
function kf(keys, u) {
  if (u <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    if (u <= keys[i][0]) {
      const a = keys[i - 1], b = keys[i];
      return lerp(a[1], b[1], ease((u - a[0]) / (b[0] - a[0])));
    }
  }
  return keys[keys.length - 1][1];
}

/* Swing curves: shoulder pitch (x), shoulder roll (z), elbow, torso yaw, over 0..1 (contact at 0.53) */
const SW = {
  over: {
    sx: [[0, -0.3], [0.35, -2.9], [0.53, -2.6], [0.75, -0.6], [1, -0.3]],
    sz: [[0, 0.2], [0.35, 0.5], [0.53, 0.1], [1, 0.2]],
    el: [[0, -0.4], [0.35, -1.9], [0.53, -0.15], [0.8, -0.4], [1, -0.4]],
    yaw: [[0, 0], [0.35, -0.9], [0.53, 0.2], [0.8, 0.5], [1, 0]],
    lean: [[0, 0.15], [0.35, -0.2], [0.53, 0.35], [1, 0.15]],
  },
  fh: {
    sx: [[0, -0.3], [0.35, -0.9], [0.53, -1.2], [0.8, -1.5], [1, -0.3]],
    sz: [[0, 0.2], [0.35, 1.3], [0.53, 0.3], [0.8, -0.9], [1, 0.2]],
    el: [[0, -0.4], [0.35, -0.6], [0.53, -0.25], [0.8, -1.2], [1, -0.4]],
    yaw: [[0, 0], [0.35, -0.9], [0.53, 0.1], [0.8, 0.8], [1, 0]],
    lean: [[0, 0.15], [0.53, 0.3], [1, 0.15]],
  },
  bh: {
    sx: [[0, -0.3], [0.35, -1.0], [0.53, -1.25], [0.8, -1.4], [1, -0.3]],
    sz: [[0, 0.2], [0.35, -1.4], [0.53, -0.5], [0.8, 0.7], [1, 0.2]],
    el: [[0, -0.4], [0.35, -1.6], [0.53, -0.3], [0.8, -0.6], [1, -0.4]],
    yaw: [[0, 0], [0.35, 0.95], [0.53, 0.1], [0.8, -0.7], [1, 0]],
    lean: [[0, 0.15], [0.53, 0.3], [1, 0.15]],
  },
};

export default function Player({ a }) {
  const root = useRef(), hips = useRef(), spine = useRef(), head = useRef();
  const sL = useRef(), sR = useRef(), eL = useRef(), eR = useRef();
  const hL = useRef(), hR = useRef(), kL = useRef(), kR = useRef();
  const st = useRef({ pos: new THREE.Vector2(a.target[0], a.target[1]), vel: new THREE.Vector2(), phase: Math.random() * 6, snap: a.snap, yaw: 0 });
  const L = a.look;
  const face = a.team === 0 ? Math.PI : 0; // face the net

  const mats = useMemo(() => ({}), []);

  useFrame((_, rdt) => {
    const dt = Math.min(rdt * TIME.boost, 0.1 * TIME.boost) * TIME.scale;
    const s = st.current;
    if (s.snap !== a.snap) { s.pos.set(a.target[0], a.target[1]); s.vel.set(0, 0); s.snap = a.snap; }
    const now = TIME.sim;

    /* --- locomotion: accelerate toward the target, brake to arrive --- */
    const to = new THREE.Vector2(a.target[0] - s.pos.x, a.target[1] - s.pos.y);
    const dist = to.length();
    const vmax = a.speed || 4.5;
    const diving = a.dive != null && now - a.dive < 1.6;
    let want = new THREE.Vector2();
    if (dist > 0.03 && !diving) want = to.clone().normalize().multiplyScalar(Math.min(vmax, Math.sqrt(2 * ACC * dist) * 0.95));
    const dv = want.clone().sub(s.vel);
    const maxDv = ACC * dt * 1.6;
    if (dv.length() > maxDv) dv.setLength(maxDv);
    s.vel.add(dv);
    if (diving) s.vel.multiplyScalar(Math.max(0, 1 - dt * 3));
    s.pos.addScaledVector(s.vel, dt);
    const speed = s.vel.length();
    root.current.position.set(s.pos.x, 0, s.pos.y);

    /* body faces the net; local velocity tells run vs shuffle vs back-pedal */
    const fwdZ = a.team === 0 ? -1 : 1;
    const vFwd = s.vel.y * fwdZ, vSide = s.vel.x * (a.team === 0 ? 1 : -1);
    const sideways = Math.abs(vSide) > Math.abs(vFwd) * 1.3 && speed > 0.4;
    /* turn into a sprint when chasing a long way back (lob) */
    const turnRun = !sideways && vFwd < -2.6;
    const targetYaw = face + (turnRun ? Math.PI : 0) + (sideways && speed > 3.2 ? Math.sign(vSide) * -0.9 * (a.team === 0 ? 1 : -1) : 0);
    s.yaw = lerp(s.yaw || face, targetYaw, Math.min(1, dt * 8));
    root.current.rotation.y = s.yaw;

    s.phase += dt * (2.2 + speed * 1.9);
    const amp = Math.min(1, speed / 3.2);
    const ph = s.phase;

    /* --- base athletic stance (knees bent, light bounce) --- */
    let hipY = 0.9 - 0.06 + Math.sin(now * 7) * 0.012 * (1 - amp);
    let lean = 0.18 + amp * 0.18;
    let thighL = -0.35, thighR = -0.35, kneeL = 0.6, kneeR = 0.6, rollL = 0.06, rollR = -0.06;
    let armL = -0.25 - amp * 0.2, armR = -0.5, armLz = 0.25, armRz = -0.25, elL = -0.9, elR = -0.7, yaw = 0;

    if (sideways) {
      /* defensive shuffle: legs open and close */
      const o = Math.sin(ph) * 0.35 * amp;
      rollL = 0.1 + o; rollR = -0.1 + o;
      kneeL = kneeR = 0.75; hipY -= 0.05 + Math.abs(Math.cos(ph)) * 0.03 * amp;
    } else if (speed > 0.2) {
      /* run / back-pedal cycle */
      const dir = turnRun || vFwd >= 0 ? 1 : -0.7;
      thighL = -0.3 + Math.sin(ph) * 0.95 * amp * dir;
      thighR = -0.3 - Math.sin(ph) * 0.95 * amp * dir;
      kneeL = 0.35 + Math.max(0, -Math.sin(ph + 0.6)) * 1.5 * amp;
      kneeR = 0.35 + Math.max(0, Math.sin(ph + 0.6)) * 1.5 * amp;
      armL = -0.2 - Math.sin(ph) * 0.8 * amp; armR = -0.4 + Math.sin(ph) * 0.8 * amp;
      elL = elR = -1.3;
      hipY += Math.abs(Math.sin(ph)) * 0.05 * amp;
      if (vFwd < 0 && !turnRun) lean = 0.02;
    }

    /* --- split-step: a small hop as the opponent hits --- */
    if (a.hop != null) {
      const u = (now - a.hop) / 0.28;
      if (u >= 0 && u < 1) { hipY += Math.sin(Math.PI * u) * 0.09; kneeL = kneeR = lerp(kneeL, 0.2, Math.sin(Math.PI * u)); rollL += 0.12 * Math.sin(Math.PI * u); rollR -= 0.12 * Math.sin(Math.PI * u); }
    }

    /* --- swing --- */
    if (a.swing) {
      const u = (now - a.swing.at + 0.0) / SWING_T + (CONTACT / SWING_T - 0.53) * 0; // contact at 0.53 of the clip
      if (u >= 0 && u < 1) {
        const K = SW[a.swing.kind] || SW.fh;
        armR = kf(K.sx, u); armRz = -kf(K.sz, u); elR = kf(K.el, u); yaw = kf(K.yaw, u); lean = kf(K.lean, u) + amp * 0.1;
        if (a.swing.kind === 'over') { armL = lerp(armL, -2.3, Math.sin(Math.PI * Math.min(1, u * 1.6))); elL = -0.4; hipY += Math.sin(Math.PI * u) * 0.06; }
        else { armL = -0.9; armLz = 0.6; }
      }
    }

    /* --- dive: lunge flat out toward the ball --- */
    let pitch = 0, drop = 0;
    if (diving) {
      const u = Math.min(1, (now - a.dive) / 0.45);
      pitch = 1.25 * ease(u); drop = 0.62 * ease(u);
      armR = -2.9; armL = -2.6; elR = elL = -0.1; thighL = 0.5; thighR = 0.2; kneeL = kneeR = 0.2;
    }

    /* --- point won: arms up --- */
    if (a.mood === 'happy' && a.moodAt != null && now - a.moodAt < 2.5 && !diving) {
      const u = Math.min(1, (now - a.moodAt) / 0.3);
      armL = lerp(armL, -2.9, u); armR = lerp(armR, -2.9, u); elL = elR = -0.2; hipY += Math.abs(Math.sin(now * 9)) * 0.05;
    }

    hips.current.position.y = hipY - drop;
    hips.current.rotation.x = pitch;
    spine.current.rotation.set(lean, yaw, 0);
    sL.current.rotation.set(armL, 0, armLz);
    sR.current.rotation.set(armR, 0, armRz);
    eL.current.rotation.x = elL;
    eR.current.rotation.x = elR;
    hL.current.rotation.set(thighL, 0, rollL);
    hR.current.rotation.set(thighR, 0, rollR);
    kL.current.rotation.x = kneeL;
    kR.current.rotation.x = kneeR;
    head.current.rotation.x = -lean * 0.6 - pitch * 0.6;
  });

  return (
    <group ref={root}>
      <group ref={hips} position={[0, 0.9, 0]}>
        {/* legs: thigh → knee → shin → foot (front of the body is +Z) */}
        {[[hL, kL, 0.1], [hR, kR, -0.1]].map(([h, k, x], i) => (
          <group key={i} ref={h} position={[x, 0, 0]}>
            <mesh position={[0, -0.2, 0]} castShadow>
              <capsuleGeometry args={[0.075, 0.26, 6, 12]} />
              <meshStandardMaterial color={L.skin} roughness={0.6} />
            </mesh>
            <mesh position={[0, -0.06, 0]} castShadow>
              <cylinderGeometry args={[0.105, 0.1, 0.18, 12]} />
              <meshStandardMaterial color={L.shorts} roughness={0.8} />
            </mesh>
            <group ref={k} position={[0, -0.42, 0]} rotation={[0.6, 0, 0]}>
              <mesh position={[0, -0.2, 0]} castShadow>
                <capsuleGeometry args={[0.058, 0.28, 6, 12]} />
                <meshStandardMaterial color={L.skin} roughness={0.6} />
              </mesh>
              <mesh position={[0, -0.43, 0.06]} castShadow>
                <boxGeometry args={[0.09, 0.05, 0.22]} />
                <meshStandardMaterial color={L.skin} roughness={0.7} />
              </mesh>
            </group>
          </group>
        ))}
        {/* pelvis + torso */}
        <mesh position={[0, 0.03, 0]} castShadow>
          <capsuleGeometry args={[0.13, 0.08, 6, 12]} />
          <meshStandardMaterial color={L.shorts} roughness={0.8} />
        </mesh>
        <group ref={spine}>
          <mesh position={[0, 0.3, 0]} castShadow scale={[1.12, 1, 0.78]}>
            <capsuleGeometry args={[0.15, 0.3, 8, 16]} />
            <meshStandardMaterial color={L.shirt} roughness={0.7} />
          </mesh>
          {/* head, cap, sunglasses */}
          <group ref={head} position={[0, 0.66, 0]}>
            <mesh castShadow position={[0, -0.08, 0]}>
              <cylinderGeometry args={[0.045, 0.05, 0.1, 10]} />
              <meshStandardMaterial color={L.skin} roughness={0.6} />
            </mesh>
            <mesh castShadow position={[0, 0.04, 0]}>
              <sphereGeometry args={[0.105, 20, 16]} />
              <meshStandardMaterial color={L.skin} roughness={0.55} />
            </mesh>
            <mesh position={[0, 0.09, -0.005]} castShadow>
              <sphereGeometry args={[0.112, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
              <meshStandardMaterial color={L.cap} roughness={0.7} />
            </mesh>
            <mesh position={[0, 0.095, 0.1]} rotation={[0.15, 0, 0]} castShadow>
              <boxGeometry args={[0.17, 0.012, 0.11]} />
              <meshStandardMaterial color={L.cap} roughness={0.7} />
            </mesh>
            <mesh position={[0, 0.045, 0.098]}>
              <boxGeometry args={[0.16, 0.035, 0.02]} />
              <meshStandardMaterial color="#111" metalness={0.8} roughness={0.15} />
            </mesh>
          </group>
          {/* arms: shoulder → elbow → hand (+ racket in the right hand) */}
          <group ref={sL} position={[0.22, 0.47, 0]}>
            <Limb len={0.28} r={0.052} color={L.skin}>
              <group ref={eL}>
                <Limb len={0.26} r={0.045} color={L.skin} />
              </group>
            </Limb>
          </group>
          <group ref={sR} position={[-0.22, 0.47, 0]}>
            <Limb len={0.28} r={0.055} color={L.skin}>
              <group ref={eR}>
                <Limb len={0.26} r={0.047} color={L.skin}>
                  {/* beach tennis racket: solid paddle */}
                  <group position={[0, -0.02, 0]} rotation={[0, 0, 0]}>
                    <mesh position={[0, -0.08, 0]} castShadow>
                      <cylinderGeometry args={[0.018, 0.02, 0.16, 8]} />
                      <meshStandardMaterial color="#222" roughness={0.6} />
                    </mesh>
                    <mesh position={[0, -0.3, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow scale={[1, 1, 1.15]}>
                      <cylinderGeometry args={[0.13, 0.13, 0.025, 24]} />
                      <meshStandardMaterial color={L.cap === '#FFFFFF' ? '#00C2B8' : L.cap} roughness={0.35} metalness={0.2} />
                    </mesh>
                  </group>
                </Limb>
              </group>
            </Limb>
          </group>
        </group>
      </group>
    </group>
  );
}
