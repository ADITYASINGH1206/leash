'use client';

/**
 * The ledger as a physical chain: one interlocked link per entry (the most
 * recent ones). When the browser verifies the chain, links turn green one by
 * one; a link whose hash does not recompute turns red and drops out of line.
 */
import React, { useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

export type LinkState = 'idle' | 'ok' | 'bad';

const COLORS: Record<LinkState, THREE.Color> = {
  idle: new THREE.Color('#5A6683'),
  ok: new THREE.Color('#1D7350'),
  bad: new THREE.Color('#B42A1F'),
};

const PITCH = 1.05; // distance between link centres

function Link({ i, state, active, still }: { i: number; state: LinkState; active: boolean; still: boolean }) {
  const mesh = useRef<THREE.Mesh>(null);
  const mat = useRef<THREE.MeshStandardMaterial>(null);
  const drop = useRef(0);
  useFrame((clock, dt) => {
    const m = mesh.current;
    if (!m || !mat.current) return;
    mat.current.color.lerp(COLORS[state], still ? 1 : Math.min(1, dt * 6));
    mat.current.emissive.copy(COLORS[state]).multiplyScalar(active ? 0.35 : 0.04);
    const target = state === 'bad' ? -0.55 : 0;
    drop.current += (target - drop.current) * (still ? 1 : Math.min(1, dt * 5));
    const sway = still ? 0 : Math.sin(clock.clock.elapsedTime * 0.8 + i * 0.5) * 0.06;
    m.position.y = drop.current + sway;
    const s = active && !still ? 1.12 : 1;
    m.scale.set(1.55 * s, s, s);
  });
  return (
    <mesh ref={mesh} position={[i * PITCH, 0, 0]} rotation={[i % 2 ? Math.PI / 2 : 0, 0, 0]}>
      <torusGeometry args={[0.42, 0.085, 18, 64]} />
      <meshStandardMaterial ref={mat} color={COLORS.idle} roughness={0.35} metalness={0.55} />
    </mesh>
  );
}

function Rig({ count, still }: { count: number; still: boolean }) {
  const { camera, size } = useThree();
  useFrame((clock) => {
    const width = count * PITCH + 1.2;
    const vt = Math.tan(THREE.MathUtils.degToRad((camera as THREE.PerspectiveCamera).fov / 2));
    const z = Math.max(3.5, (width / 2) / (vt * (size.width / size.height)) + 0.6);
    const t = still ? 0 : clock.clock.elapsedTime;
    camera.position.set(Math.sin(t * 0.15) * 0.8, z * 0.32 + Math.sin(t * 0.2) * 0.2, z);
    camera.lookAt(0, 0, 0);
  });
  return null;
}

export default function ChainScene({
  states,
  active = -1,
  still = false,
}: {
  states: LinkState[];
  active?: number;
  still?: boolean;
}) {
  const offset = useMemo(() => -((states.length - 1) * PITCH) / 2, [states.length]);
  return (
    <Canvas dpr={[1, 2]} camera={{ position: [0, 1.2, 9], fov: 34 }} gl={{ antialias: true, alpha: true }} aria-hidden="true">
      <ambientLight intensity={0.7} />
      <directionalLight position={[3, 5, 4]} intensity={1.6} />
      <directionalLight position={[-4, -1, 2]} intensity={0.5} color={'#C9D2F5'} />
      <Rig count={states.length} still={still} />
      <group position={[offset, 0, 0]}>
        {states.map((s, i) => (
          <Link key={i} i={i} state={s} active={i === active} still={still} />
        ))}
      </group>
    </Canvas>
  );
}
