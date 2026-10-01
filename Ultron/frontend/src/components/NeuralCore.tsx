import { useMemo, useRef } from "react";
import * as THREE from "three";
import { Canvas, useFrame } from "@react-three/fiber";
import {
  EffectComposer, Bloom, DepthOfField, ChromaticAberration, Vignette,
} from "@react-three/postprocessing";

const ENABLE_BOKEH = true;

/* ============================= PALETTE ============================= */
const COL_A = new THREE.Color("#00E5FF");
const COL_B = new THREE.Color("#FF1E27");
const EDGE_A = new THREE.Color("#7ff4ff");
const EDGE_B = new THREE.Color("#ff5a63");
const WIRE_B = new THREE.Color("#a41426");

function stateTargets(appState: string): { mix: number; act: number } {
  switch (appState) {
    case "THINKING": case "SPEAKING": case "EXECUTING": case "TRANSCRIBING":
      return { mix: 1, act: 1 };
    case "LISTENING":
      return { mix: 0.15, act: 0.35 };
    default:
      return { mix: 0, act: 0 };
  }
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ============================= GLSL ============================= */
const SNOISE = /* glsl */`
vec3 mod289(vec3 x){return x - floor(x*(1.0/289.0))*289.0;}
vec4 mod289(vec4 x){return x - floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159 - 0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C = vec2(1.0/6.0, 1.0/3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i  = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(
            i.z + vec4(0.0, i1.z, i2.z, 1.0))
          + i.y + vec4(0.0, i1.y, i2.y, 1.0))
          + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0)*2.0 + 1.0;
  vec4 s1 = floor(b1)*2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
}
/* CALMED: noise time scale 0.05 -> 0.012 (~25% speed). Same field, slower drift. */
vec3 drift(vec3 p, float seed, float uTime, float amp){
  float t = uTime * 0.012;
  vec3 q = p * 0.10 + vec3(seed * 13.7);
  return p + amp * vec3(
    snoise(q + vec3(t, 0.0, 0.0)),
    snoise(q + vec3(0.0, t, 0.0)),
    snoise(q + vec3(0.0, 0.0, t))
  );
}
vec3 nodePos(vec3 base, float seed, float uTime, float uFlow, float uDrift){
  float r0 = length(base);
  vec3 dir = base / max(r0, 0.0001);
  float r = mod(r0 + uFlow * (0.4 + seed * 0.8), 36.0) + 2.5;
  return drift(dir * r, seed, uTime, uDrift);
}
float hash1(float n){ return fract(sin(n) * 43758.5453123); }`;

/* CALMED: hard step-twinkle replaced by slow per-star breathing (10-18s periods),
   junction blooms slowed to ~25s cycles. No state-driven flicker speed. */
const SPARK_VERT = /* glsl */`
attribute float aSeed; attribute float aSize; attribute float aBright;
uniform float uTime; uniform float uAct; uniform float uFlow; uniform float uDrift;
uniform float uPix; uniform float uMaxSize; uniform float uRadial;
varying float vTw; varying float vB;
${SNOISE}
void main(){
  vec3 p = nodePos(position, aSeed, uTime, uFlow, uDrift);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float r0 = length(position);
  float radProx = smoothstep(20.0, 3.0, r0);
  float tw = 0.5 + 0.5 * sin(uTime * (0.35 + fract(aSeed * 7.77) * 0.30) + aSeed * 61.0);
  vTw = 0.82 + 0.18 * tw;
  float junction = step(0.975, hash1(aSeed * 3.31)) * pow(0.5 + 0.5 * sin(uTime * 0.25 + aSeed * 91.0), 2.0);
  vB = aBright * (0.55 + 0.85 * uRadial * radProx) * (1.0 + junction * 1.6);
  gl_PointSize = min(aSize * uPix * (26.0 / max(-mv.z, 0.8)) * (1.0 + 0.35 * uAct), uMaxSize);
  gl_Position = projectionMatrix * mv;
}`;

const SPARK_FRAG = /* glsl */`
uniform vec3 uColA; uniform vec3 uColB; uniform float uMix;
uniform float uOpacity; uniform float uBright;
varying float vTw; varying float vB;
void main(){
  float d = length(gl_PointCoord - 0.5);
  float m = smoothstep(0.5, 0.12, d);
  float hot = pow(m, 3.0);
  vec3 col = mix(uColA, uColB, uMix);
  vec3 hotCol = mix(vec3(1.0), col, uMix * 0.65);
  vec3 c = col * (m * 0.8 + hot * uBright * vB) + hotCol * hot * 0.35 * vB;
  gl_FragColor = vec4(c * vTw * 1.5, (m * 0.7 + hot * 0.5) * vTw * vB * uOpacity);
}`;

/* CALMED: travelling signal flare frequency ~25% of previous. */
const LINK_VERT = /* glsl */`
attribute float aSeed; attribute float aOpacity; attribute float aRad;
uniform float uTime; uniform float uFlow; uniform float uDrift; uniform float uLink;
uniform float uRadial; uniform float uSignal;
varying float vA; varying float vFl;
${SNOISE}
void main(){
  vec3 p = nodePos(position, aSeed, uTime, uFlow, uDrift);
  float gate = smoothstep(uLink - 0.25, uLink + 0.25, fract(aSeed * 13.7));
  float flare = pow(0.5 + 0.5 * sin(uTime * (0.12 + fract(aSeed * 7.13) * 0.40) + aSeed * 57.0), 8.0);
  vFl = flare * gate;
  vA = aOpacity * gate * (0.75 + 1.1 * flare * uSignal) * (0.55 + 0.75 * uRadial * aRad);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;

const LINK_FRAG = /* glsl */`
uniform vec3 uColA; uniform vec3 uColB; uniform float uMix;
varying float vA; varying float vFl;
void main(){
  vec3 col = mix(uColA, uColB, uMix);
  col += mix(vec3(1.0), col, uMix * 0.75) * vFl * 0.40;
  gl_FragColor = vec4(col * vA * 1.25, vA);
}`;

const TRI_VERT = /* glsl */`
attribute float aSeed; attribute float aTri; attribute float aRad;
uniform float uTime; uniform float uFlow; uniform float uDrift;
varying float vF; varying float vRad;
${SNOISE}
void main(){
  vec3 p = nodePos(position, aSeed, uTime, uFlow, uDrift);
  vF = aTri; vRad = aRad;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;

/* CALMED: facet flicker frequency ~25% of previous. */
const TRI_FRAG = /* glsl */`
uniform float uTime; uniform float uAct; uniform float uMix;
uniform vec3 uColA; uniform vec3 uColB; uniform float uRadial;
varying float vF; varying float vRad;
void main(){
  float h = fract(sin(vF * 47.3) * 43758.5453);
  float flick = 0.5 + 0.5 * sin(uTime * (0.10 + h * 0.45) + h * 30.0);
  float a = (0.020 + 0.060 * uAct) * (0.35 + 0.65 * flick) * (0.5 + 0.8 * uRadial * vRad);
  vec3 col = mix(uColA, uColB, uMix);
  gl_FragColor = vec4(col * a, a);
}`;

const SHELL_VERT = /* glsl */`
attribute float aFace;
varying float vF; varying vec3 vN; varying vec3 vW;
void main(){
  vF = aFace;
  vN = normalize(mat3(modelMatrix) * normal);
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const SHELL_FRAG = /* glsl */`
uniform float uTime; uniform float uAct; uniform float uMix;
uniform vec3 uColA; uniform vec3 uColB;
varying float vF; varying vec3 vN; varying vec3 vW;
void main(){
  vec3 N = normalize(vN);
  vec3 V = normalize(cameraPosition - vW);
  float fres = pow(1.0 - abs(dot(N, V)), 2.0);
  float h = fract(sin(vF * 91.7) * 43758.5453);
  float flick = 0.5 + 0.5 * sin(uTime * (0.4 + h * 2.0) + h * 30.0);
  float face = 0.10 + 0.05 * flick * (0.25 + 0.45 * uAct);
  float rim = fres * (0.40 + 0.25 * uAct);
  float a = min(face + rim, 0.5) * (1.0 - 0.28 * uMix);
  vec3 base = mix(uColA, uColB, uMix);
  vec3 rimCol = mix(vec3(1.0), base, uMix * 0.8);
  vec3 col = base * (0.6 + 0.4 * flick) + rimCol * rim * 0.32;
  gl_FragColor = vec4(col * a, a);
}`;

const CORE_VERT = /* glsl */`
varying vec3 vN; varying vec3 vP;
void main(){
  vN = normalize(normalMatrix * normal);
  vP = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const CORE_FRAG = /* glsl */`
uniform float uTime; uniform float uAct; uniform float uMix;
uniform float uAudioStrength; uniform float uPulse;
uniform vec3 uColA; uniform vec3 uColB;
varying vec3 vN; varying vec3 vP;
void main(){
  vec3 N = normalize(vN);
  float ndv = max(dot(N, vec3(0.0, 0.0, 1.0)), 0.0);
  float fres = pow(1.0 - ndv, 2.2);
  float center = pow(ndv, 4.0);
  float w = sin(vP.x*7.0 + uTime*1.4) * sin(vP.y*8.0 - uTime*1.1) * sin(vP.z*6.0 + uTime*0.8);
  float fil = smoothstep(0.2, 0.9, w*0.5+0.5);
  vec3 col = mix(uColA, uColB, uMix);
  vec3 c = col * (fres * 1.3 + fil * (0.20 + 0.55 * uAct));
  c += col * center * 1.0;
  c += vec3(1.0) * center * center * (1.15 + 0.85 * uAct + uAudioStrength * 0.8 + uPulse * 0.4);
  gl_FragColor = vec4(c, 1.0);
}`;

const HALO_VERT = /* glsl */`
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;

const HALO_FRAG = /* glsl */`
uniform float uAct; uniform float uMix; uniform float uPulse; uniform float uAudioStrength; uniform float uTime;
uniform vec3 uColA; uniform vec3 uColB;
varying vec2 vUv;
void main(){
  vec2 c = vUv - 0.5;
  float r = length(c) * 2.0;
  float body = pow(max(0.0, 1.0 - r), 4.0);
  float fh = pow(max(0.0, 1.0 - abs(c.y) * 18.0), 3.0) * pow(max(0.0, 1.0 - abs(c.x) * 2.2), 2.0);
  float fv = pow(max(0.0, 1.0 - abs(c.x) * 18.0), 3.0) * pow(max(0.0, 1.0 - abs(c.y) * 2.2), 2.0);
  float a = body * (0.24 + 0.24 * uAct + uAudioStrength * 0.14 + uPulse * 0.12)
          + (fh + fv) * 0.08 * (0.4 + 0.6 * uAct);
  vec3 col = mix(uColA, uColB, uMix) * a * 1.6
           + mix(vec3(1.0), mix(uColA, uColB, uMix), uMix * 0.5) * pow(max(0.0, 1.0 - r), 8.0) * 0.55;
  gl_FragColor = vec4(col, a);
}`;

const RING_VERT = /* glsl */`
varying vec3 vP;
void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;

const RING_FRAG = /* glsl */`
uniform float uMode; uniform float uSeed; uniform float uTime; uniform float uAct;
uniform float uMix; uniform float uDir; uniform float uGain;
uniform vec3 uColA; uniform vec3 uColB;
varying vec3 vP;
float hash(float n){ return fract(sin(n) * 43758.5453); }
void main(){
  float ang = atan(vP.y, vP.x);
  float u = ang / 6.2831853 + 0.5;
  float pat = 0.0;
  if (uMode < 0.5) {
    float seg = floor(u * 14.0 + uSeed * 7.0);
    float on = step(0.45, hash(seg * 3.7 + uSeed));
    float local = fract(u * 14.0 + uSeed * 7.0);
    float endF = smoothstep(0.0, 0.08, local) * (1.0 - smoothstep(0.92, 1.0, local));
    pat = on * endF * (0.75 + 0.25 * sin(u * 40.0 - uTime * (1.0 + uAct * 4.0) * uDir));
  } else if (uMode < 1.5) {
    float d = fract(u * 90.0 + uSeed * 13.0);
    pat = step(0.35, d) * (0.5 + 0.5 * step(0.5, hash(floor(u * 90.0) + uSeed)));
  } else {
    pat = step(0.86, fract(u * 120.0 + uSeed * 5.0));
  }
  float sweep = pow(max(0.0, cos(ang - uTime * (0.35 + 0.9 * uAct) * uDir - uSeed * 6.0)), 24.0);
  float a = pat * (0.16 + 0.50 * (0.25 + 0.75 * uAct)) + sweep * 0.30 * (0.3 + 0.7 * uAct);
  a *= uGain;
  vec3 col = mix(uColA, uColB, uMix) * (1.0 + 0.35 * sin(uTime * 2.0 + uSeed * 9.0) * uAct);
  gl_FragColor = vec4(col * a * 1.7, a);
}`;

/* ============================= SCENE ============================= */
function Scene({ appState }: { appState: string }) {
  const rnd = useMemo(() => mulberry32(42069), []);
  const S = useRef({ mix: 0, act: 0, rad: 0.18, pulse: 0, pulseT: 3, audio: 0, flow: 0 });
  const refs = useRef<any>({
    shells: [] as (THREE.Mesh | null)[],
    wires: [] as (THREE.LineSegments | null)[],
    rings: [] as (THREE.Mesh | null)[],
    core: null as THREE.Mesh | null,
    halo: null as THREE.Mesh | null,
    plexus: null as THREE.Group | null,
  });

  const plexus = useMemo(() => {
    const N = 1400;
    const pts: THREE.Vector3[] = [];
    const seeds = new Float32Array(N);
    const sizes = new Float32Array(N);
    const brights = new Float32Array(N);

    const gauss = () => (rnd() + rnd() + rnd() - 1.5);

    const outerClusters: THREE.Vector3[] = [];
    for (let c = 0; c < 10; c++) {
      const rc = 12 + Math.pow(rnd(), 0.7) * 16;
      const th = rnd() * Math.PI * 2;
      const ph = Math.acos(2 * rnd() - 1);
      outerClusters.push(new THREE.Vector3(
        rc * Math.sin(ph) * Math.cos(th),
        rc * Math.cos(ph) * 0.85,
        rc * Math.sin(ph) * Math.sin(th),
      ));
    }

    for (let i = 0; i < N; i++) {
      const roll = rnd();
      let v: THREE.Vector3;

      if (roll < 0.22) {
        const r = 2 + Math.pow(rnd(), 1.4) * 6;
        const th = rnd() * Math.PI * 2;
        const ph = Math.acos(2 * rnd() - 1);
        v = new THREE.Vector3(r * Math.sin(ph) * Math.cos(th), r * Math.cos(ph) * 0.85, r * Math.sin(ph) * Math.sin(th));
      } else if (roll < 0.55) {
        const r = 8 + Math.pow(rnd(), 1.2) * 8;
        const th = rnd() * Math.PI * 2;
        const ph = Math.acos(2 * rnd() - 1);
        v = new THREE.Vector3(r * Math.sin(ph) * Math.cos(th), r * Math.cos(ph) * 0.85, r * Math.sin(ph) * Math.sin(th));
      } else if (roll < 0.90) {
        const cluster = outerClusters[Math.floor(rnd() * outerClusters.length)];
        const sigma = 1.5 + rnd() * 3.5;
        v = cluster.clone().add(new THREE.Vector3(gauss() * sigma, gauss() * sigma * 0.9, gauss() * sigma));
      } else {
        const r = 22 + Math.pow(rnd(), 0.9) * 10;
        const th = rnd() * Math.PI * 2;
        const ph = Math.acos(2 * rnd() - 1);
        v = new THREE.Vector3(r * Math.sin(ph) * Math.cos(th), r * Math.cos(ph) * 0.8, r * Math.sin(ph) * Math.sin(th));
      }

      if (v.length() > 32) v.setLength(32);
      pts.push(v);

      const r = v.length();
      seeds[i] = rnd();

      const sRoll = rnd();
      if (r > 20) {
        if (sRoll < 0.85) { sizes[i] = 0.3 + rnd() * 0.4; brights[i] = 0.25 + rnd() * 0.35; }
        else if (sRoll < 0.98) { sizes[i] = 0.8 + rnd() * 0.6; brights[i] = 0.45 + rnd() * 0.35; }
        else { sizes[i] = 1.8 + rnd() * 1.0; brights[i] = 1.0; }
      } else if (r > 12) {
        if (sRoll < 0.75) { sizes[i] = 0.4 + rnd() * 0.5; brights[i] = 0.30 + rnd() * 0.40; }
        else if (sRoll < 0.95) { sizes[i] = 0.9 + rnd() * 0.8; brights[i] = 0.50 + rnd() * 0.40; }
        else { sizes[i] = 2.2 + rnd() * 1.2; brights[i] = 1.0; }
      } else {
        if (sRoll < 0.70) { sizes[i] = 0.45 + rnd() * 0.5; brights[i] = 0.30 + rnd() * 0.35; }
        else if (sRoll < 0.95) { sizes[i] = 1.1 + rnd() * 0.9; brights[i] = 0.55 + rnd() * 0.35; }
        else { sizes[i] = 2.4 + rnd() * 1.2; brights[i] = 1.0; }
      }

      if (v.z > 6) sizes[i] *= 1.25;
      if (v.z < -6) sizes[i] *= 0.85;
    }

    const nodePosArr = new Float32Array(N * 3);
    pts.forEach((p, i) => nodePosArr.set([p.x, p.y, p.z], i * 3));

    const linkPos: number[] = []; const linkSeed: number[] = [];
    const linkOp: number[] = []; const linkRad: number[] = [];

    let linkCount = 0;
    const MAX_LINKS = 4500;

    for (let i = 0; i < N && linkCount < MAX_LINKS; i++) {
      for (let j = i + 1; j < N && linkCount < MAX_LINKS; j++) {
        const d = pts[i].distanceTo(pts[j]);
        const rAvg = (pts[i].length() + pts[j].length()) * 0.5;

        const thresh = 2.8 + (rAvg / 28) * 5.2;
        if (d > thresh) continue;

        let o: number;
        if (rAvg < 8) o = 0.10 + rnd() * 0.25;
        else if (rAvg < 16) o = 0.07 + rnd() * 0.15;
        else if (rAvg < 24) o = 0.035 + rnd() * 0.105;
        else o = 0.02 + rnd() * 0.06;

        linkPos.push(pts[i].x, pts[i].y, pts[i].z, pts[j].x, pts[j].y, pts[j].z);
        linkSeed.push(seeds[i], seeds[j]);
        linkOp.push(o, o);
        const rad = 1.0 - Math.min(1, rAvg / 28);
        linkRad.push(rad, rad);
        linkCount++;
      }
    }

    for (let k = 0; k < 200 && linkCount < MAX_LINKS + 100; k++) {
      const i = Math.floor(rnd() * N);
      const j = Math.floor(rnd() * N);
      if (i === j) continue;
      const d = pts[i].distanceTo(pts[j]);
      if (d > 18) continue;

      const rAvg = (pts[i].length() + pts[j].length()) * 0.5;
      const o = 0.025 + rnd() * 0.055;

      linkPos.push(pts[i].x, pts[i].y, pts[i].z, pts[j].x, pts[j].y, pts[j].z);
      linkSeed.push(seeds[i], seeds[j]);
      linkOp.push(o, o);
      const rad = 1.0 - Math.min(1, rAvg / 28);
      linkRad.push(rad, rad);
      linkCount++;
    }

    const triPos: number[] = []; const triSeed: number[] = [];
    const triId: number[] = []; const triRad: number[] = [];
    const neigh: number[][] = pts.map(() => []);

    for (let i = 0; i < N; i++) {
      for (let j = i + 1; j < N; j++) {
        const d = pts[i].distanceTo(pts[j]);
        const rAvg = (pts[i].length() + pts[j].length()) * 0.5;
        const thresh = 3.5 + (rAvg / 28) * 4.0;
        if (d < thresh) { neigh[i].push(j); neigh[j].push(i); }
      }
    }

    let triCount = 0;
    const MAX_TRIS = 700;
    for (let i = 0; i < N && triCount < MAX_TRIS; i++) {
      for (let a = 0; a < neigh[i].length && triCount < MAX_TRIS; a++) {
        for (let b = a + 1; b < neigh[i].length && triCount < MAX_TRIS; b++) {
          const j = neigh[i][a], k = neigh[i][b];
          const d = pts[j].distanceTo(pts[k]);
          const rAvg = (pts[i].length() + pts[j].length() + pts[k].length()) / 3;
          const thresh = 3.5 + (rAvg / 28) * 4.0;
          if (d < thresh) {
            const rad = 1.0 - Math.min(1, rAvg / 28);
            triPos.push(
              pts[i].x, pts[i].y, pts[i].z,
              pts[j].x, pts[j].y, pts[j].z,
              pts[k].x, pts[k].y, pts[k].z,
            );
            triSeed.push(seeds[i], seeds[j], seeds[k]);
            triId.push(triCount, triCount, triCount);
            triRad.push(rad, rad, rad);
            triCount++;
          }
        }
      }
    }

    const nodeGeo = new THREE.BufferGeometry();
    nodeGeo.setAttribute("position", new THREE.BufferAttribute(nodePosArr, 3));
    nodeGeo.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));
    nodeGeo.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
    nodeGeo.setAttribute("aBright", new THREE.BufferAttribute(brights, 1));
    const linkGeo = new THREE.BufferGeometry();
    linkGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(linkPos), 3));
    linkGeo.setAttribute("aSeed", new THREE.BufferAttribute(new Float32Array(linkSeed), 1));
    linkGeo.setAttribute("aOpacity", new THREE.BufferAttribute(new Float32Array(linkOp), 1));
    linkGeo.setAttribute("aRad", new THREE.BufferAttribute(new Float32Array(linkRad), 1));
    const triGeo = new THREE.BufferGeometry();
    triGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(triPos), 3));
    triGeo.setAttribute("aSeed", new THREE.BufferAttribute(new Float32Array(triSeed), 1));
    triGeo.setAttribute("aTri", new THREE.BufferAttribute(new Float32Array(triId), 1));
    triGeo.setAttribute("aRad", new THREE.BufferAttribute(new Float32Array(triRad), 1));
    return { nodeGeo, linkGeo, triGeo };
  }, [rnd]);

  const dustGeo = useMemo(() => {
    const N = 9000;
    const pos = new Float32Array(N * 3);
    const seeds = new Float32Array(N);
    const sizes = new Float32Array(N);
    const brights = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const zone = rnd();
      let r: number;
      if (zone < 0.25) r = 3 + Math.pow(rnd(), 0.8) * 5;
      else if (zone < 0.55) r = 8 + Math.pow(rnd(), 0.75) * 10;
      else if (zone < 0.85) r = 18 + Math.pow(rnd(), 0.7) * 8;
      else r = 26 + Math.pow(rnd(), 0.85) * 8;

      const th = rnd() * Math.PI * 2;
      const ph = Math.acos(2 * rnd() - 1);
      pos.set([r * Math.sin(ph) * Math.cos(th), r * Math.cos(ph) * 0.85, r * Math.sin(ph) * Math.sin(th)], i * 3);
      seeds[i] = rnd();
      sizes[i] = 0.35 + rnd() * 0.8;
      brights[i] = 0.20 + rnd() * 0.60;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));
    g.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
    g.setAttribute("aBright", new THREE.BufferAttribute(brights, 1));
    return g;
  }, [rnd]);

  const shells = useMemo(() => {
    return [1.55, 2.2, 2.9].map((radius) => {
      let g: THREE.BufferGeometry = new THREE.IcosahedronGeometry(radius, 1);
      g = g.toNonIndexed();
      const count = g.attributes.position.count;
      const arr = new Float32Array(count);
      for (let f = 0; f < count / 3; f++) {
        arr[f * 3] = f; arr[f * 3 + 1] = f; arr[f * 3 + 2] = f;
      }
      g.setAttribute("aFace", new THREE.BufferAttribute(arr, 1));
      const wire = new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(radius, 1));
      return { facet: g, wire };
    });
  }, []);

  const rings = useMemo(() => {
    const cfg = [
      { r: 1.95, w: 0.10, mode: 0, speed: 0.10, gain: 1.0 },
      { r: 2.35, w: 0.05, mode: 1, speed: -0.07, gain: 0.55 },
      { r: 2.75, w: 0.16, mode: 2, speed: 0.05, gain: 0.75 },
      { r: 3.25, w: 0.09, mode: 0, speed: -0.09, gain: 0.5 },
      { r: 3.80, w: 0.05, mode: 1, speed: 0.06, gain: 0.62 },
    ];
    const last = cfg.length - 1;
    return cfg.map((c, i) => ({
      geo: new THREE.RingGeometry(c.r, c.r + c.w, 256, 1),
      mode: c.mode,
      speed: c.speed,
      gain: c.gain,
      seed: rnd() * 10,
      tilt: (i === last ? [0, 0, 0] : [(rnd() - 0.5) * 0.5, (rnd() - 0.5) * 0.5, 0]) as [number, number, number],
      id: i,
    }));
  }, [rnd]);

  const spokeGeo = useMemo(() => {
    const arr = new Float32Array(44 * 2 * 3);
    for (let i = 0; i < 44; i++) {
      const th = rnd() * Math.PI * 2;
      const ph = Math.acos(2 * rnd() - 1);
      const d = new THREE.Vector3(Math.sin(ph) * Math.cos(th), Math.cos(ph) * 0.85, Math.sin(ph) * Math.sin(th));
      const a = d.clone().multiplyScalar(8 + rnd() * 6);
      const b = d.clone().multiplyScalar(34 + rnd() * 10);
      arr.set([a.x, a.y, a.z], i * 6);
      arr.set([b.x, b.y, b.z], i * 6 + 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(arr, 3));
    return g;
  }, [rnd]);

  const M = useMemo(() => {
    const spark = (maxSize: number, opacity: number, bright: number, drift: number) =>
      new THREE.ShaderMaterial({
        vertexShader: SPARK_VERT, fragmentShader: SPARK_FRAG,
        uniforms: {
          uTime: { value: 0 }, uAct: { value: 0 }, uMix: { value: 0 },
          uFlow: { value: 0 }, uDrift: { value: drift },
          uPix: { value: 1.5 }, uMaxSize: { value: maxSize },
          uOpacity: { value: opacity }, uBright: { value: bright },
          uRadial: { value: 0.18 },
          uColA: { value: COL_A.clone() }, uColB: { value: COL_B.clone() },
        },
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      });
    return {
      dust: spark(2.6, 0.42, 1.0, 0.45),
      glint: spark(3.5, 0.9, 2.0, 0.45),
      link: new THREE.ShaderMaterial({
        vertexShader: LINK_VERT, fragmentShader: LINK_FRAG,
        uniforms: {
          uTime: { value: 0 }, uFlow: { value: 0 }, uDrift: { value: 0.45 }, uLink: { value: 0.3 },
          uMix: { value: 0 }, uRadial: { value: 0.18 }, uSignal: { value: 0.35 },
          uColA: { value: COL_A.clone() }, uColB: { value: COL_B.clone() },
        },
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      }),
      tri: new THREE.ShaderMaterial({
        vertexShader: TRI_VERT, fragmentShader: TRI_FRAG,
        uniforms: {
          uTime: { value: 0 }, uFlow: { value: 0 }, uDrift: { value: 0.45 }, uAct: { value: 0 },
          uMix: { value: 0 }, uRadial: { value: 0.18 },
          uColA: { value: COL_A.clone() }, uColB: { value: COL_B.clone() },
        },
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      }),
      shellFacet: shells.map(() => new THREE.ShaderMaterial({
        vertexShader: SHELL_VERT, fragmentShader: SHELL_FRAG,
        uniforms: {
          uTime: { value: 0 }, uAct: { value: 0 }, uMix: { value: 0 },
          uColA: { value: COL_A.clone() }, uColB: { value: COL_B.clone() },
        },
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      })),
      shellWire: shells.map(() => new THREE.LineBasicMaterial({
        color: EDGE_A.clone(), transparent: true, opacity: 0.55,
        blending: THREE.AdditiveBlending, depthWrite: false,
      })),
      core: new THREE.ShaderMaterial({
        vertexShader: CORE_VERT, fragmentShader: CORE_FRAG,
        uniforms: {
          uTime: { value: 0 }, uAct: { value: 0 }, uMix: { value: 0 },
          uAudioStrength: { value: 0 }, uPulse: { value: 0 },
          uColA: { value: COL_A.clone() }, uColB: { value: COL_B.clone() },
        },
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      }),
      halo: new THREE.ShaderMaterial({
        vertexShader: HALO_VERT, fragmentShader: HALO_FRAG,
        uniforms: {
          uTime: { value: 0 }, uAct: { value: 0 }, uMix: { value: 0 },
          uAudioStrength: { value: 0 }, uPulse: { value: 0 },
          uColA: { value: COL_A.clone() }, uColB: { value: COL_B.clone() },
        },
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      }),
      ring: rings.map((r) => new THREE.ShaderMaterial({
        vertexShader: RING_VERT, fragmentShader: RING_FRAG,
        uniforms: {
          uMode: { value: r.mode }, uSeed: { value: r.seed }, uTime: { value: 0 },
          uAct: { value: 0 }, uMix: { value: 0 }, uDir: { value: Math.sign(r.speed) || 1 },
          uGain: { value: r.gain },
          uColA: { value: COL_A.clone() }, uColB: { value: COL_B.clone() },
        },
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      })),
      spoke: new THREE.LineBasicMaterial({ color: COL_A.clone(), transparent: true, opacity: 0.06, blending: THREE.AdditiveBlending, depthWrite: false }),
    };
  }, [shells, rings]);

  const bloomRef = useRef<any>(null);
  const dofRef = useRef<any>(null);
  const caRef = useRef<any>(null);

  useFrame((state, dt) => {
    const t = state.clock.elapsedTime;
    const st = S.current;
    const tgt = stateTargets(appState);

    const tauMix = tgt.mix > st.mix ? 0.55 : 1.2;
    const tauAct = tgt.act > st.act ? 0.45 : 1.7;
    st.mix += (tgt.mix - st.mix) * (1 - Math.exp(-dt / tauMix));
    st.act += (tgt.act - st.act) * (1 - Math.exp(-dt / tauAct));
    const mix = st.mix, act = st.act;

    const radTarget = 0.18 + act * 0.55;
    st.rad += (radTarget - st.rad) * (1 - Math.exp(-dt / 0.8));

    st.pulseT -= dt;
    if (st.pulseT <= 0) {
      st.pulse = 1;
      st.pulseT = act > 0.5 ? 0.9 + Math.random() * 1.2 : 4 + Math.random() * 4;
    }
    st.pulse = Math.max(0, st.pulse - dt / (act > 0.5 ? 0.5 : 1.4));

    const audioTarget = appState === "SPEAKING"
      ? 0.35 + 0.65 * Math.abs(Math.sin(t * 6.1)) * Math.abs(Math.sin(t * 2.3 + 1.7))
      : appState === "THINKING" ? 0.2 + 0.15 * Math.sin(t * 9.0) : 0.0;
    st.audio += (audioTarget - st.audio) * (1 - Math.exp(-dt * 8));

    /* CALMED: radial flow ~25% of previous speed */
    st.flow += dt * (0.025 + act * 0.28);

    const link = act > 0.5
      ? 0.55 + 0.30 * Math.sin(t * 2.4) + 0.10 * Math.sin(t * 5.1)
      : 0.30 + 0.10 * Math.sin(t * 0.35);

    [M.dust, M.glint].forEach((m) => {
      m.uniforms.uTime.value = t; m.uniforms.uAct.value = act; m.uniforms.uMix.value = mix;
      m.uniforms.uFlow.value = st.flow; m.uniforms.uRadial.value = st.rad;
    });
    M.link.uniforms.uTime.value = t; M.link.uniforms.uFlow.value = st.flow;
    M.link.uniforms.uLink.value = link; M.link.uniforms.uMix.value = mix;
    M.link.uniforms.uRadial.value = st.rad; M.link.uniforms.uSignal.value = 0.35 + 0.50 * act;
    M.tri.uniforms.uTime.value = t; M.tri.uniforms.uFlow.value = st.flow;
    M.tri.uniforms.uAct.value = act; M.tri.uniforms.uMix.value = mix;
    M.tri.uniforms.uRadial.value = st.rad;
    M.core.uniforms.uTime.value = t; M.core.uniforms.uAct.value = act;
    M.core.uniforms.uMix.value = mix; M.core.uniforms.uAudioStrength.value = st.audio;
    M.core.uniforms.uPulse.value = st.pulse;
    M.halo.uniforms.uTime.value = t; M.halo.uniforms.uAct.value = act;
    M.halo.uniforms.uMix.value = mix; M.halo.uniforms.uAudioStrength.value = st.audio;
    M.halo.uniforms.uPulse.value = st.pulse;
    M.shellFacet.forEach((m) => { m.uniforms.uTime.value = t; m.uniforms.uAct.value = act; m.uniforms.uMix.value = mix; });
    M.ring.forEach((m) => { m.uniforms.uTime.value = t; m.uniforms.uAct.value = act; m.uniforms.uMix.value = mix; });

    M.shellWire.forEach((w) => w.color.copy(EDGE_A).lerp(WIRE_B, mix));
    M.shellWire.forEach((w, i) => { w.opacity = (i === 0 ? 0.50 : 0.34 - i * 0.06) + 0.08 * act; });
    M.spoke.color.copy(COL_A).lerp(COL_B, mix);
    M.spoke.opacity = 0.05 + 0.09 * act;

    const spin = 1 + act * 2.0;
    refs.current.shells.forEach((sMesh: THREE.Mesh | null, i: number) => {
      if (!sMesh) return;
      sMesh.rotation.y += dt * (0.05 + i * 0.02) * spin * (i % 2 === 0 ? 1 : -1);
      sMesh.rotation.x += dt * (0.02 + i * 0.013) * spin;
      sMesh.rotation.z += dt * 0.015 * spin * (i === 1 ? -1 : 1);
    });
    refs.current.wires.forEach((w: THREE.LineSegments | null, i: number) => {
      const sMesh = refs.current.shells[i];
      if (w && sMesh) w.rotation.copy(sMesh.rotation);
    });

    const outerIdx = rings.length - 1;
    refs.current.rings.forEach((rMesh: THREE.Mesh | null, i: number) => {
      if (!rMesh) return;
      rMesh.rotation.z += dt * rings[i].speed * spin;
      if (i === outerIdx) {
        rMesh.rotation.x += (0 - rMesh.rotation.x) * Math.min(1, dt * 3);
        rMesh.rotation.y += (0 - rMesh.rotation.y) * Math.min(1, dt * 3);
      } else {
        rMesh.rotation.x = rings[i].tilt[0] + Math.sin(t * 0.06 + i) * 0.08;
        rMesh.rotation.y = rings[i].tilt[1] + Math.cos(t * 0.05 + i * 2) * 0.08;
      }
    });

    /* CALMED: plexus rotation ~30% of previous speed */
    if (refs.current.plexus) refs.current.plexus.rotation.y += dt * (0.004 + 0.018 * act);

    if (refs.current.core) {
      const breath = 1 + 0.026 * Math.sin(t * Math.PI * 2 * (0.2 + act * 0.6))
        + st.pulse * 0.02 + st.audio * 0.045;
      refs.current.core.scale.setScalar(breath);
    }
    if (refs.current.halo) {
      refs.current.halo.quaternion.copy(state.camera.quaternion);
      refs.current.halo.scale.setScalar(1 + 0.10 * act + st.pulse * 0.08 + st.audio * 0.09);
    }

    if (bloomRef.current) bloomRef.current.intensity = 1.05 + 0.32 * act + st.pulse * 0.25 + st.audio * 0.12;
    if (dofRef.current && ENABLE_BOKEH) dofRef.current.bokehScale = 2.2 + act * 0.45;
    if (caRef.current && caRef.current.offset) {
      const o = 0.0018 + st.pulse * 0.0012;
      caRef.current.offset.set(o, o * 0.8);
    }
  });

  return (
    <group>
      {shells.map((s, i) => (
        <group key={i}>
          <mesh ref={(el) => { refs.current.shells[i] = el; }} geometry={s.facet} material={M.shellFacet[i]} />
          <lineSegments ref={(el) => { refs.current.wires[i] = el; }} geometry={s.wire} material={M.shellWire[i]} />
        </group>
      ))}

      <mesh ref={(el) => { refs.current.core = el; }} material={M.core}>
        <icosahedronGeometry args={[0.85, 2]} />
      </mesh>
      <mesh ref={(el) => { refs.current.halo = el; }} material={M.halo}>
        <planeGeometry args={[5, 5]} />
      </mesh>

      {rings.map((r, i) => (
        <mesh key={`r${i}`} ref={(el) => { refs.current.rings[i] = el; }} geometry={r.geo} material={M.ring[i]} />
      ))}

      <group ref={(el) => { refs.current.plexus = el; }}>
        <lineSegments geometry={plexus.linkGeo} material={M.link} />
        <mesh geometry={plexus.triGeo} material={M.tri} />
        <points geometry={plexus.nodeGeo} material={M.glint} />
        <lineSegments geometry={spokeGeo} material={M.spoke} />
      </group>

      <points geometry={dustGeo} material={M.dust} />

      <EffectComposer multisampling={4}>
        {ENABLE_BOKEH && (
          <DepthOfField ref={dofRef} target={[0, 0, 0]} focalLength={0.16} bokehScale={2.4} height={560} />
        )}
        <Bloom ref={bloomRef} intensity={1.2} luminanceThreshold={0.85} luminanceSmoothing={0.15} mipmapBlur radius={0.72} />
        <ChromaticAberration ref={caRef} offset={new THREE.Vector2(0.0018, 0.0014)} radialModulation modulationOffset={0.35} />
        <Vignette eskil={false} offset={0.24} darkness={0.86} />
      </EffectComposer>
    </group>
  );
}

export default function NeuralCore({ appState }: { appState: string }) {
  return (
    <div
      className="neural-core-container"
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", zIndex: 0, background: "#000203", overflow: "hidden" }}
    >
      <Canvas
        flat
        dpr={[1, 1.75]}
        gl={{ antialias: true, powerPreference: "high-performance" }}
        camera={{ fov: 50, near: 0.1, far: 220, position: [0, 0, 11] }}
        style={{ position: "absolute", inset: 0, display: "block" }}
      >
        <color attach="background" args={["#000203"]} />
        <Scene appState={appState} />
      </Canvas>
    </div>
  );
}