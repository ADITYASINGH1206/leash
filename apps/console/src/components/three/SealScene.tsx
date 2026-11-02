'use client';

/**
 * A signing seal. It turns slowly while a mandate is a draft; when you sign,
 * it presses forward, settles face-on and its engraving fills with ink.
 */
import React, { useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';

function rosetteGeo(R: number, r: number, d: number, scale: number, steps: number) {
  const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
  const turns = r / gcd(R, r);
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i < steps; i++) {
    const t = (i / steps) * Math.PI * 2 * turns;
    pts.push(
      new THREE.Vector3(
        ((R - r) * Math.cos(t) + d * Math.cos(((R - r) / r) * t)) * scale,
        ((R - r) * Math.sin(t) - d * Math.sin(((R - r) / r) * t)) * scale,
        0,
      ),
    );
  }
  return new THREE.BufferGeometry().setFromPoints(pts);
}

function Seal({ signed, still }: { signed: boolean; still: boolean }) {
  const group = useRef<THREE.Group>(null);
  const lineMats = useRef<THREE.LineBasicMaterial[]>([]);
  const press = useRef(0);
  const rings = useMemo(
    () => [0.5, 0.8, 1.1].map((k, i) => rosetteGeo(96, 42, 42 * k, 0.0105 - i * 0.0008, 2800)),
    [],
  );
  const faded = useMemo(() => new THREE.Color('#7C8598'), []);
  const ink = useMemo(() => new THREE.Color('#2440B8'), []);

  useFrame((clock, dt) => {
    const g = group.current;
    if (!g) return;
    const target = signed ? 1 : 0;
    press.current += (target - press.current) * (still ? 1 : Math.min(1, dt * 4));
    const p = press.current;
    const t = still ? 0 : clock.clock.elapsedTime;
    // Draft: turning slowly. Signed: face-on, with a short forward press
    g.rotation.y = (1 - p) * Math.sin(t * 0.6) * 0.7;
    g.rotation.x = (1 - p) * 0.35;
    g.position.z = Math.sin(Math.min(p, 1) * Math.PI) * 0.6;
    lineMats.current.forEach((m) => m.color.copy(faded).lerp(ink, p));
  });

  return (
    <group ref={group}>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[1.25, 1.25, 0.22, 96]} />
        <meshStandardMaterial color={'#F5F6F1'} roughness={0.5} metalness={0.15} />
      </mesh>
      <mesh>
        <torusGeometry args={[1.25, 0.045, 12, 96]} />
        <meshStandardMaterial color={'#142039'} roughness={0.4} metalness={0.4} />
      </mesh>
      {rings.map((geo, i) => (
        <lineLoop key={i} geometry={geo} position={[0, 0, 0.115]}>
          <lineBasicMaterial
            ref={(m: THREE.LineBasicMaterial | null) => {
              if (m) lineMats.current[i] = m;
            }}
            color={faded}
          />
        </lineLoop>
      ))}
    </group>
  );
}

export default function SealScene({ signed, still = false }: { signed: boolean; still?: boolean }) {
  return (
    <Canvas dpr={[1, 2]} camera={{ position: [0, 0, 4.4], fov: 40 }} gl={{ antialias: true, alpha: true }} aria-hidden="true">
      <ambientLight intensity={0.8} />
      <directionalLight position={[2, 3, 4]} intensity={1.5} />
      <Seal signed={signed} still={still} />
    </Canvas>
  );
}
