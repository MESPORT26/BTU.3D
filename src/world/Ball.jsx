import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { RigidBody, BallCollider } from '@react-three/rapier';
import * as THREE from 'three';
import { useGame } from '../game.js';
import { ballAt } from './coords.js';
import { TIME } from '../time.js';

const R = 0.075; // a little larger than real (6.5 cm) so it reads on a phone
const TRAIL = 14;

/*
 * During play the rules engine flies the ball (kinematic body, exact arcs).
 * When a point ends the ball is handed to Rapier physics: it bounces on the sand, hits the net, rolls.
 * CCD stops a fast ball tunnelling through the net between frames.
 */
export default function Ball() {
  const body = useRef();
  const shadow = useRef();
  const trail = useRef();
  const ball = useGame((s) => s.ball);
  const pts = useRef(Array.from({ length: TRAIL }, () => new THREE.Vector3(0, -5, 0)));

  useEffect(() => {
    const b = body.current;
    if (!b) return;
    if (ball.mode === 'free') {
      b.setBodyType(0, true); // dynamic
      b.setTranslation({ x: ball.pos[0], y: ball.pos[1], z: ball.pos[2] }, true);
      b.setLinvel({ x: ball.vel[0], y: ball.vel[1], z: ball.vel[2] }, true);
      b.setAngvel({ x: Math.random() * 8, y: 0, z: Math.random() * 8 }, true);
    } else {
      b.setBodyType(2, true); // kinematic, driven below
      b.setLinvel({ x: 0, y: 0, z: 0 }, true);
      if (ball.mode === 'held') b.setTranslation({ x: ball.pos[0], y: ball.pos[1], z: ball.pos[2] }, true);
      if (ball.mode === 'hidden') b.setTranslation({ x: 0, y: -5, z: 0 }, true);
    }
  }, [ball]);

  useFrame(() => {
    const b = body.current;
    if (!b) return;
    if (ball.mode === 'flight') {
      const p = ballAt(ball.flight, TIME.sim);
      b.setNextKinematicTranslation({ x: p[0], y: p[1], z: p[2] });
    }
    const t = b.translation();
    if (shadow.current) {
      shadow.current.position.set(t.x, 0.015, t.z);
      const k = Math.max(0.35, 1 - t.y / 8);
      shadow.current.scale.setScalar(k);
      shadow.current.material.opacity = ball.mode === 'hidden' ? 0 : 0.35 * k;
    }
    /* fading trail */
    const arr = pts.current;
    arr.pop();
    arr.unshift(new THREE.Vector3(t.x, t.y, t.z));
    if (trail.current) {
      const pos = trail.current.geometry.attributes.position;
      arr.forEach((v, i) => pos.setXYZ(i, v.x, v.y, v.z));
      pos.needsUpdate = true;
      trail.current.visible = ball.mode === 'flight';
    }
  });

  return (
    <>
      <RigidBody ref={body} type="kinematicPosition" colliders={false} ccd restitution={0.45} friction={0.8} linearDamping={0.35} angularDamping={0.8} position={[0, -5, 0]}>
        <BallCollider args={[R]} />
        <mesh castShadow>
          <sphereGeometry args={[R, 24, 16]} />
          <meshStandardMaterial color="#e8ff2e" emissive="#9fb000" emissiveIntensity={0.25} roughness={0.75} />
        </mesh>
      </RigidBody>
      <mesh ref={shadow} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[R * 1.6, 20]} />
        <meshBasicMaterial color="#000" transparent opacity={0.3} depthWrite={false} />
      </mesh>
      <line ref={trail}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[new Float32Array(TRAIL * 3), 3]} />
        </bufferGeometry>
        <lineBasicMaterial color="#fffbe0" transparent opacity={0.55} />
      </line>
    </>
  );
}
