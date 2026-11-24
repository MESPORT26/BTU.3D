import { useMemo } from 'react';
import * as THREE from 'three';
import { Sky } from '@react-three/drei';
import { RigidBody, CuboidCollider } from '@react-three/rapier';

/* Procedural sand: grain noise for colour, ripples for the bump map */
function sandTextures() {
  const N = 512;
  const c = document.createElement('canvas'); c.width = c.height = N;
  const g = c.getContext('2d');
  const img = g.createImageData(N, N);
  const b = document.createElement('canvas'); b.width = b.height = N;
  const gb = b.getContext('2d');
  const bimg = gb.createImageData(N, N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = (y * N + x) * 4;
    const grain = Math.random() * 26 - 13;
    const ripple = Math.sin((x * 0.09) + Math.sin(y * 0.03) * 2.2) * 0.5 + Math.sin((x + y) * 0.021) * 0.5;
    const r = 236 + grain + ripple * 5, gg = 214 + grain + ripple * 5, bb = 170 + grain * 0.8 + ripple * 4;
    img.data[i] = r; img.data[i + 1] = gg; img.data[i + 2] = bb; img.data[i + 3] = 255;
    const h = 128 + ripple * 50 + grain * 2.2;
    bimg.data[i] = bimg.data[i + 1] = bimg.data[i + 2] = h; bimg.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0); gb.putImageData(bimg, 0, 0);
  const map = new THREE.CanvasTexture(c), bump = new THREE.CanvasTexture(b);
  [map, bump].forEach((t) => { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(14, 14); t.anisotropy = 8; });
  map.colorSpace = THREE.SRGBColorSpace;
  return { map, bump };
}

/* Net mesh: a grid drawn on a transparent canvas */
function netTexture() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 128;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 512, 128);
  g.strokeStyle = 'rgba(20,20,20,0.9)'; g.lineWidth = 1.4;
  for (let x = 0; x <= 512; x += 8) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 128); g.stroke(); }
  for (let y = 0; y <= 128; y += 8) { g.beginPath(); g.moveTo(0, y); g.lineTo(512, y); g.stroke(); }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(4, 1);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const LINE = 0.05; // 5 cm tape
function Line({ x, z, w, d }) {
  return (
    <mesh position={[x, 0.012, z]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[w, d]} />
      <meshStandardMaterial color="#1f6fb8" roughness={0.6} />
    </mesh>
  );
}

export default function Court() {
  const sand = useMemo(sandTextures, []);
  const net = useMemo(netTexture, []);
  const NET_TOP = 1.7, NET_DROP = 1.0; // the net band hangs 1 m deep
  return (
    <group>
      <Sky distance={4500} sunPosition={[40, 14, -60]} turbidity={6} rayleigh={1.4} mieCoefficient={0.006} mieDirectionalG={0.85} />

      {/* Sand, with a physics floor for the ball */}
      <RigidBody type="fixed" colliders={false} friction={1.2} restitution={0.35}>
        <CuboidCollider args={[40, 0.5, 40]} position={[0, -0.5, 0]} />
      </RigidBody>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[120, 120, 1, 1]} />
        <meshStandardMaterial map={sand.map} bumpMap={sand.bump} bumpScale={0.6} roughness={0.96} metalness={0} />
      </mesh>

      {/* Ocean behind the far court */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, -90]}>
        <planeGeometry args={[400, 120]} />
        <meshStandardMaterial color="#1b82b5" roughness={0.18} metalness={0.25} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.025, -31]}>
        <planeGeometry args={[400, 2.5]} />
        <meshStandardMaterial color="#f4f1e6" roughness={0.5} transparent opacity={0.7} />
      </mesh>

      {/* Court lines: 16 m × 8 m */}
      <Line x={-4} z={0} w={LINE} d={16} />
      <Line x={4} z={0} w={LINE} d={16} />
      <Line x={0} z={-8} w={8 + LINE} d={LINE} />
      <Line x={0} z={8} w={8 + LINE} d={LINE} />

      {/* Net, posts and a physics wall the ball can hit */}
      <RigidBody type="fixed" colliders={false} restitution={0.1} friction={0.9}>
        <CuboidCollider args={[4.5, NET_DROP / 2, 0.02]} position={[0, NET_TOP - NET_DROP / 2, 0]} />
      </RigidBody>
      <mesh position={[0, NET_TOP - NET_DROP / 2, 0]} castShadow>
        <planeGeometry args={[9, NET_DROP]} />
        <meshStandardMaterial map={net} transparent alphaTest={0.2} side={THREE.DoubleSide} roughness={0.8} />
      </mesh>
      <mesh position={[0, NET_TOP - 0.03, 0]} castShadow>
        <boxGeometry args={[9, 0.06, 0.02]} />
        <meshStandardMaterial color="#f7f7f2" roughness={0.6} />
      </mesh>
      {[-4.6, 4.6].map((x) => (
        <mesh key={x} position={[x, 1.0, 0]} castShadow>
          <cylinderGeometry args={[0.045, 0.05, 2.0, 16]} />
          <meshStandardMaterial color="#e9e6df" metalness={0.5} roughness={0.35} />
        </mesh>
      ))}
    </group>
  );
}
