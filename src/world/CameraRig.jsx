import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useGame } from '../game.js';

/* Broadcast-style camera behind your baseline. Eases closer over your shoulder when you decide. */
export default function CameraRig() {
  const { camera, size } = useThree();
  const look = useRef(new THREE.Vector3(0, 0, -2));
  useFrame((_, dt) => {
    const g = useGame.getState();
    const portrait = size.width / size.height < 0.85;
    const deciding = g.phase === 'SHOT' || g.phase === 'SERVE';
    const me = g.actors.me ? g.actors.me.target : [0, 6];
    const pos = portrait ? new THREE.Vector3(0, 11, 15.8) : new THREE.Vector3(0, 8.2, 16.5);
    const tgt = portrait ? new THREE.Vector3(0, 0, -0.2) : new THREE.Vector3(0, 0, -1.6);
    if (deciding) {
      pos.lerp(new THREE.Vector3(me[0] * 0.5, pos.y * 1.08, me[1] + 8), 0.35);
      tgt.lerp(new THREE.Vector3(me[0] * 0.4, 0, -3.6), 0.45);
    }
    /* phones: the shot rail sits on the left, so frame the court a little to the right */
    if (portrait) { pos.x -= 1.1; tgt.x -= 1.1; }
    if (g.screen === 'lobby') { pos.set(9, 4.2, 11); tgt.set(0, 0.8, 0); }
    camera.fov = portrait ? 52 : 42;
    camera.updateProjectionMatrix();
    const k = Math.min(1, dt * 2.2);
    camera.position.lerp(pos, k);
    look.current.lerp(tgt, k);
    camera.lookAt(look.current);
  });
  return null;
}
