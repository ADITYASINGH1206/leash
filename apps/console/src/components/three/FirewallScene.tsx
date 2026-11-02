'use client';

/**
 * Hero scene: the leash itself.
 *
 * An agent (left) can only reach PayPal (right) along one cord, and the cord
 * runs through five engraved gates — the five checks. Payment tokens travel
 * the cord: honest ones pass every gate and drop into the PayPal hold; one is
 * held at the policy gate until "approved"; one is stopped at the provenance
 * gate and falls away. The loop is the product story in miniature.
 */
import React, { useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

const INK = new THREE.Color('#142039');
const INTAGLIO = new THREE.Color('#2440B8');
const ALLOW = new THREE.Color('#1D7350');
const HOLD = new THREE.Color('#C08A14');
const BLOCK = new THREE.Color('#B42A1F');

const GATE_T = [0.22, 0.35, 0.48, 0.61, 0.74]; // positions of layers 0–4 on the cord
const HOLD_GATE = 1; // policy
const BLOCK_GATE = 2; // provenance

type Kind = 'allow' | 'hold' | 'block';
const PATTERN: Kind[] = ['allow', 'block', 'allow', 'hold', 'allow', 'allow', 'block', 'hold'];

function makeCurve() {
  return new THREE.CatmullRomCurve3([
    new THREE.Vector3(-5.6, -0.6, 0.4),
    new THREE.Vector3(-3.7, 0.35, 0),
    new THREE.Vector3(-1.4, -0.25, -0.6),
    new THREE.Vector3(0.9, 0.3, -0.2),
    new THREE.Vector3(3.1, -0.15, 0.3),
    new THREE.Vector3(5.0, 0.2, 0),
  ]);
}

/** Hypotrochoid rosette in the XY plane (same maths as the SVG guilloché). */
function rosette(R: number, r: number, d: number, scale: number, steps: number) {
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

function Gate({ index, curve, flash }: { index: number; curve: THREE.CatmullRomCurve3; flash: React.MutableRefObject<number[]> }) {
  const group = useRef<THREE.Group>(null);
  const spin = useRef<THREE.Group>(null);
  const mats = useRef<THREE.LineBasicMaterial[]>([]);
  const t = GATE_T[index]!;
  const { position, quaternion } = useMemo(() => {
    const p = curve.getPointAt(t);
    const tangent = curve.getTangentAt(t).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), tangent);
    return { position: p, quaternion: q };
  }, [curve, t]);

  const geos = useMemo(() => {
    const petals = 14 + index * 2;
    const g = 6;
    const q = petals % 7 === 0 ? 5 : 7;
    const R = petals * g;
    const r = q * g;
    const s = 0.82 / (R - r + r * 1.1);
    return [0.55, 0.8, 1.05].map((k) => rosette(R, r, r * k, s, 220 * q));
  }, [index]);

  const base = index === BLOCK_GATE ? INK : INTAGLIO;

  useFrame((_, dt) => {
    if (spin.current) spin.current.rotation.z += dt * (index % 2 ? -0.12 : 0.09);
    const f = flash.current[index] ?? 0;
    flash.current[index] = Math.max(0, f - dt * 1.6);
    mats.current.forEach((m, i) => {
      const target = f > 0 ? (index === BLOCK_GATE && f > 0.5 ? BLOCK : index === HOLD_GATE && f > 0.5 ? HOLD : ALLOW) : base;
      m.color.copy(base).lerp(target, Math.min(1, f));
      m.opacity = 0.5 + 0.45 * Math.min(1, f) + i * 0.05;
    });
  });

  return (
    <group ref={group} position={position} quaternion={quaternion}>
      <group ref={spin}>
        {geos.map((geo, i) => (
          <lineLoop key={i} geometry={geo}>
            <lineBasicMaterial
              ref={(m: THREE.LineBasicMaterial | null) => {
                if (m) mats.current[i] = m;
              }}
              color={base}
              transparent
              opacity={0.55}
            />
          </lineLoop>
        ))}
      </group>
      <mesh>
        <torusGeometry args={[0.86, 0.012, 8, 96]} />
        <meshStandardMaterial color={INK} roughness={0.6} />
      </mesh>
    </group>
  );
}

interface Token {
  kind: Kind;
  u: number; // position along the cord, 0..1
  wait: number; // seconds left waiting at a gate
  passed: number; // highest gate index passed
  state: 'travel' | 'held' | 'falling' | 'done';
  vy: number;
  y: number;
  life: number;
}

function Tokens({ curve, flash, still }: { curve: THREE.CatmullRomCurve3; flash: React.MutableRefObject<number[]>; still: boolean }) {
  const POOL = 7;
  const meshes = useRef<Array<THREE.Mesh | null>>([]);
  const tokens = useRef<Token[]>([]);
  const spawnClock = useRef(0);
  const nextKind = useRef(0);
  const tmp = useMemo(() => new THREE.Vector3(), []);
  const up = useMemo(() => new THREE.Vector3(0, 1, 0), []); // cylinder axis

  // Static frame for reduced motion: a few tokens frozen at telling positions
  useMemo(() => {
    if (!still) return;
    tokens.current = [
      { kind: 'allow', u: 0.86, wait: 0, passed: 4, state: 'travel', vy: 0, y: 0, life: 1 },
      { kind: 'hold', u: GATE_T[HOLD_GATE]! - 0.012, wait: 99, passed: 0, state: 'held', vy: 0, y: 0, life: 1 },
      { kind: 'block', u: GATE_T[BLOCK_GATE]! - 0.012, wait: 0, passed: 1, state: 'falling', vy: 0, y: -0.25, life: 0.9 },
      { kind: 'allow', u: 0.1, wait: 0, passed: -1, state: 'travel', vy: 0, y: 0, life: 1 },
    ];
  }, [still]);

  useFrame((_, rawDt) => {
    const dt = still ? 0 : Math.min(rawDt, 0.05);
    spawnClock.current -= dt;
    if (!still && spawnClock.current <= 0 && tokens.current.filter((t) => t.state !== 'done').length < POOL) {
      spawnClock.current = 1.25;
      tokens.current.push({
        kind: PATTERN[nextKind.current++ % PATTERN.length]!,
        u: 0,
        wait: 0,
        passed: -1,
        state: 'travel',
        vy: 0,
        y: 0,
        life: 1,
      });
    }
    tokens.current = tokens.current.filter((t) => t.state !== 'done').slice(-POOL);

    tokens.current.forEach((tok) => {
      if (tok.state === 'travel') {
        tok.u += dt * 0.085;
        const nextGate = tok.passed + 1;
        const gateU = GATE_T[nextGate];
        if (gateU !== undefined && tok.u >= gateU - 0.012) {
          if (tok.kind === 'block' && nextGate === BLOCK_GATE) {
            tok.state = 'falling';
            flash.current[nextGate] = 1.2;
          } else if (tok.kind === 'hold' && nextGate === HOLD_GATE) {
            tok.state = 'held';
            tok.wait = 1.6;
            flash.current[nextGate] = 1.2;
          } else {
            tok.passed = nextGate;
            flash.current[nextGate] = Math.max(flash.current[nextGate] ?? 0, 0.45);
          }
        }
        if (tok.u >= 0.97) {
          tok.life -= dt * 2.5;
          if (tok.life <= 0) tok.state = 'done';
        }
      } else if (tok.state === 'held') {
        tok.wait -= dt;
        if (tok.wait <= 0) {
          tok.state = 'travel';
          tok.kind = 'allow'; // approved by the human
          tok.passed = HOLD_GATE;
        }
      } else if (tok.state === 'falling') {
        tok.vy -= dt * 3.2;
        tok.y += tok.vy * dt;
        tok.life -= dt * 0.7;
        if (tok.life <= 0) tok.state = 'done';
      }
    });

    for (let i = 0; i < POOL; i++) {
      const mesh = meshes.current[i];
      const tok = tokens.current[i];
      if (!mesh) continue;
      if (!tok) {
        mesh.visible = false;
        continue;
      }
      mesh.visible = true;
      curve.getPointAt(Math.min(tok.u, 1), tmp);
      mesh.position.set(tmp.x, tmp.y + tok.y, tmp.z);
      const tangent = curve.getTangentAt(Math.min(tok.u, 1));
      mesh.quaternion.setFromUnitVectors(up, tangent);
      if (tok.state === 'falling') mesh.rotateX(tok.y * 2.2);
      const mat = mesh.material as THREE.MeshStandardMaterial;
      const color =
        tok.state === 'falling' ? BLOCK : tok.state === 'held' ? HOLD : tok.u > GATE_T[4]! ? ALLOW : INTAGLIO;
      mat.color.copy(color);
      mat.opacity = Math.max(0, tok.life);
      const s = tok.state === 'held' ? 1 + 0.08 * Math.sin(performance.now() / 120) : 1;
      mesh.scale.setScalar(s * Math.max(0.2, Math.min(1, tok.life * 1.4)));
    }
  });

  return (
    <>
      {Array.from({ length: POOL }, (_, i) => (
        <mesh
          key={i}
          ref={(m) => {
            meshes.current[i] = m;
          }}
          visible={false}
        >
          <cylinderGeometry args={[0.2, 0.2, 0.06, 40]} />
          <meshStandardMaterial color={INTAGLIO} roughness={0.35} metalness={0.25} transparent />
        </mesh>
      ))}
    </>
  );
}

function Endpoints({ curve }: { curve: THREE.CatmullRomCurve3 }) {
  const agent = useRef<THREE.Mesh>(null);
  const start = curve.getPointAt(0);
  const end = curve.getPointAt(1);
  useFrame((_, dt) => {
    if (agent.current) agent.current.rotation.y += dt * 0.4;
  });
  return (
    <>
      {/* The agent: a faceted, slightly restless solid */}
      <mesh ref={agent} position={start}>
        <icosahedronGeometry args={[0.5, 0]} />
        <meshStandardMaterial color={INK} flatShading roughness={0.5} metalness={0.15} />
      </mesh>
      {/* PayPal hold: a coin-like vault, facing the cord */}
      <group position={end} rotation={[Math.PI / 2, 0.5, 0]}>
        <mesh>
          <cylinderGeometry args={[0.46, 0.46, 0.12, 64]} />
          <meshStandardMaterial color={'#E3E7DD'} roughness={0.4} metalness={0.2} />
        </mesh>
        <mesh position={[0, 0.062, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.3, 0.025, 10, 64]} />
          <meshStandardMaterial color={ALLOW} roughness={0.4} />
        </mesh>
      </group>
    </>
  );
}

/**
 * Projects label anchors (in the rotated scene group) to screen space and
 * moves plain DOM labels there. Cheaper than mounting a React root per label.
 */
function LabelProjector({
  anchors,
  labels,
  group,
}: {
  anchors: THREE.Vector3[];
  labels: React.MutableRefObject<Array<HTMLSpanElement | null>>;
  group: React.RefObject<THREE.Group | null>;
}) {
  const { camera, size } = useThree();
  const v = useMemo(() => new THREE.Vector3(), []);
  useFrame(() => {
    const g = group.current;
    if (!g) return;
    g.updateMatrixWorld();
    camera.updateMatrixWorld();
    anchors.forEach((a, i) => {
      const el = labels.current[i];
      if (!el) return;
      v.copy(a).applyMatrix4(g.matrixWorld).project(camera);
      const x = (v.x * 0.5 + 0.5) * size.width;
      const y = (-v.y * 0.5 + 0.5) * size.height;
      el.style.transform = `translate(-50%, -50%) translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
      el.style.opacity = '1';
    });
  });
  return null;
}

function Rig({ still }: { still: boolean }) {
  const { camera, size, pointer } = useThree();
  useFrame(() => {
    // Fit the whole cord (about 10 units wide once turned) inside the canvas
    const aspect = size.width / size.height;
    const vt = Math.tan(THREE.MathUtils.degToRad((camera as THREE.PerspectiveCamera).fov / 2));
    const baseZ = Math.max(7.5, 5.1 / (vt * aspect) + 1.2);
    const px = still ? 0 : pointer.x * 0.6;
    const py = still ? 0 : pointer.y * 0.35;
    const k = still ? 1 : 0.04; // reduced motion: jump straight to the framed view
    camera.position.x += (px - camera.position.x) * k;
    camera.position.y += (1.1 + py - camera.position.y) * k;
    camera.position.z += (baseZ - camera.position.z) * (still ? 1 : 0.08);
    camera.lookAt(0, 0, 0);
  });
  return null;
}

function Cord({ curve }: { curve: THREE.CatmullRomCurve3 }) {
  const geo = useMemo(() => new THREE.TubeGeometry(curve, 320, 0.028, 10, false), [curve]);
  return (
    <mesh geometry={geo}>
      <meshStandardMaterial color={INTAGLIO} roughness={0.45} metalness={0.1} />
    </mesh>
  );
}

const LABELS = ['Agent', '0', '1', '2', '3', '4', 'PayPal hold'];

export default function FirewallScene({ still = false }: { still?: boolean }) {
  const curve = useMemo(makeCurve, []);
  const flash = useRef<number[]>([0, 0, 0, 0, 0]);
  const group = useRef<THREE.Group>(null);
  const labels = useRef<Array<HTMLSpanElement | null>>([]);
  const anchors = useMemo(() => {
    const below = (t: number, dy: number) => curve.getPointAt(t).add(new THREE.Vector3(0, dy, 0));
    return [below(0, -0.95), ...GATE_T.map((t) => below(t, -1.15)), below(1, -0.95)];
  }, [curve]);

  return (
    <div className="relative h-full w-full">
      <Canvas
        dpr={[1, 2]}
        camera={{ position: [0, 1.1, 10.6], fov: 38 }}
        gl={{ antialias: true, alpha: true }}
        frameloop={still ? 'demand' : 'always'}
        aria-hidden="true"
      >
        <ambientLight intensity={0.9} />
        <directionalLight position={[4, 6, 5]} intensity={1.4} />
        <directionalLight position={[-6, -2, 3]} intensity={0.4} color={'#C9D2F5'} />
        <Rig still={still} />
        {/* Turned three-quarters so the gates read as open rings, not edges */}
        <group ref={group} rotation={[0.12, -0.5, 0.04]} position={[-0.35, 0.3, 0]}>
          <Cord curve={curve} />
          {GATE_T.map((_, i) => (
            <Gate key={i} index={i} curve={curve} flash={flash} />
          ))}
          <Tokens curve={curve} flash={flash} still={still} />
          <Endpoints curve={curve} />
        </group>
        <LabelProjector anchors={anchors} labels={labels} group={group} />
      </Canvas>
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        {LABELS.map((l, i) => (
          <span
            key={l}
            ref={(el) => {
              labels.current[i] = el;
            }}
            className={`absolute left-0 top-0 whitespace-nowrap opacity-0 ${
              i > 0 && i < 6 ? 'font-display text-[15px] text-ink-soft' : 'text-[12px] text-ink-soft'
            }`}
          >
            {l}
          </span>
        ))}
      </div>
    </div>
  );
}

export { GATE_T };
