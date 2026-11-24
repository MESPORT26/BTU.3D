import { Suspense } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Physics } from '@react-three/rapier';
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing';
import Court from './world/Court.jsx';
import Ball from './world/Ball.jsx';
import Player from './world/Player.jsx';
import CameraRig from './world/CameraRig.jsx';
import { AimZones, LandingRing, Pops } from './world/Overlays.jsx';
import Hud from './ui/Hud.jsx';
import { useGame, tickGame, KEYS } from './game.js';
import { stepTime } from './time.js';

/* Advances sim time (slow motion aware) and runs the point loop's timers */
function GameClock() {
  useFrame((_, dt) => { stepTime(dt); tickGame(); });
  return null;
}

function Players() {
  const actors = useGame((s) => s.actors);
  return KEYS.filter((k) => actors[k]).map((k) => <Player key={k} a={actors[k]} />);
}

function Lights() {
  return (
    <>
      <hemisphereLight args={['#cfe8ff', '#e9c98f', 0.75]} />
      <directionalLight
        position={[9, 15, 7]}
        intensity={2.4}
        color="#ffe2b8"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-13}
        shadow-camera-right={13}
        shadow-camera-top={13}
        shadow-camera-bottom={-13}
        shadow-camera-far={60}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
      />
    </>
  );
}

export default function App() {
  const fx = useGame((s) => s.settings.fx);
  return (
    <div className="app">
      <Canvas shadows dpr={fx === 'high' ? [1, 2] : [1, 1.25]} camera={{ position: [9, 4.2, 11], fov: 45, near: 0.1, far: 1000 }} gl={{ antialias: true }}>
        <GameClock />
        <CameraRig />
        <Lights />
        <fog attach="fog" args={['#f3e2c6', 45, 160]} />
        <Suspense fallback={null}>
          <Physics gravity={[0, -9.81, 0]}>
            <Court />
            <Ball />
          </Physics>
          <Players />
          <AimZones />
          <LandingRing />
          <Pops />
        </Suspense>
        {fx === 'high' && (
          <EffectComposer multisampling={0}>
            <Bloom intensity={0.35} luminanceThreshold={0.85} luminanceSmoothing={0.2} mipmapBlur />
            <Vignette offset={0.3} darkness={0.45} />
          </EffectComposer>
        )}
      </Canvas>
      <Hud />
    </div>
  );
}
