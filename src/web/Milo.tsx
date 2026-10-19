// Milo, an original baby dragon drawn in SVG.
// A requestAnimationFrame loop computes a pose from the character state machine
// and writes transforms straight onto SVG nodes (no React re-render per frame).

import React, { useEffect, useRef } from 'react';
import type { CharacterMachine } from '../core/character.ts';
import type { CharacterState, Mood } from '../core/types.ts';
import { breathPhase } from '../core/games.ts';
import { AVATARS, DEFAULT_AVATAR, type AvatarId } from '../core/avatars.ts';

export type MouthKind = 'smile' | 'open' | 'o' | 'grin' | 'wobbly' | 'tiny';
export type EyeKind = 'open' | 'happy' | 'closed' | 'wide';
export type BrowKind = 'none' | 'worried' | 'soft';
export interface BuddyLookKinds { eyes: EyeKind; mouth: MouthKind; brows: BrowKind }

export interface Pose {
  x: number; y: number; rot: number; sx: number; sy: number;
  /** Turn around the vertical axis, in radians (the 3D buddy really turns; the flat SVG one squashes sx instead). */
  yaw: number;
  /** Tip forward / backward (a somersault), in radians. 3D only; the flat buddy turns in the plane instead. */
  pitch: number;
  head: number; tail: number; wing: number; armL: number; armR: number;
  belly: number; mouth: MouthKind; eyes: EyeKind; brows: BrowKind;
  lookX: number; lookY: number; mouthScale: number;
}

const BASE: Pose = { x: 0, y: 0, rot: 0, sx: 1, sy: 1, yaw: 0, pitch: 0, head: 0, tail: 0, wing: 0, armL: 12, armR: 12, belly: 1, mouth: 'smile', eyes: 'open', brows: 'none', lookX: 0, lookY: 0, mouthScale: 1 };
const TAU = Math.PI * 2;
const S = Math.sin;

export function computePose(state: CharacterState, t: number, speed: number, style: string, reduced: boolean, breathT: number, threeD = false): Pose {
  const k = reduced ? 0.4 : 1; // movement amplitude
  const p: Pose = { ...BASE };
  // Gentle life everywhere.
  p.y = S(t * 2) * 5 * k;
  p.sy = 1 + S(t * 2) * 0.012;
  p.tail = S(t * 1.5) * 8 * k;
  p.wing = S(t * 1.2) * 4 * k;
  p.head = S(t * 0.9) * 3 * k;
  p.lookX = S(t * 0.37) * 4;
  p.lookY = S(t * 0.23) * 2;

  const dt = t * speed; // dance-time, scales with speed
  switch (state) {
    case 'DANCING': {
      const ph = dt * TAU * 1.0;
      if (style === 'funny') {
        p.sx = 1 + S(ph * 2) * 0.12 * k; p.sy = 1 - S(ph * 2) * 0.12 * k;
        p.rot = S(ph) * 16 * k; p.head = S(ph * 3) * 14 * k; p.tail = S(ph * 2) * 35 * k;
        p.armL = 90 + S(ph * 2) * 60 * k; p.armR = 90 - S(ph * 2) * 60 * k;
        p.y = -Math.abs(S(ph)) * 20 * k; p.mouth = 'grin'; p.eyes = 'happy'; p.wing = 25 + S(ph * 4) * 20 * k;
      } else if (style === 'slow') {
        p.rot = S(ph * 0.5) * 9 * k; p.y = S(ph) * 8 * k; p.head = S(ph * 0.5 + 1) * 8 * k;
        p.armL = 60 + S(ph * 0.5) * 30 * k; p.armR = 60 - S(ph * 0.5) * 30 * k; p.tail = S(ph * 0.5) * 20 * k;
        p.eyes = 'happy'; p.mouth = 'smile'; p.wing = 10 + S(ph) * 10 * k;
      } else {
        p.y = -Math.abs(S(ph)) * 34 * k; p.rot = S(ph) * 10 * k; p.head = S(ph + 1) * 9 * k;
        p.tail = S(ph * 2) * 28 * k; p.wing = 22 + S(ph * 2) * 24 * k;
        p.armL = 110 + S(ph) * 45 * k; p.armR = 110 - S(ph) * 45 * k;
        p.sy = 1 + Math.abs(S(ph)) * 0.04 * k; p.mouth = 'open'; p.eyes = 'happy';
      }
      break;
    }
    case 'ROBOT_DANCE': {
      const q = Math.floor(dt * 4) % 4;
      p.rot = [0, 7, 0, -7][q] * k; p.head = [0, -12, 0, 12][q] * k; p.y = (q % 2) * -12 * k;
      p.armL = [0, 90, 90, 0][q]; p.armR = [90, 0, 0, 90][q]; p.tail = [0, 20, 0, -20][q] * k;
      p.wing = (q % 2) * 15; p.mouth = 'o'; p.eyes = 'wide'; p.lookX = 0; p.lookY = 0;
      break;
    }
    case 'SINGING': {
      p.rot = S(dt * 2) * 5 * k; p.head = S(dt * 1.6) * 9 * k; p.mouth = 'o'; p.eyes = 'happy';
      p.mouthScale = 0.75 + Math.abs(S(dt * 5)) * 0.45; p.armL = 40 + S(dt * 2) * 20 * k; p.armR = 40 - S(dt * 2) * 20 * k;
      break;
    }
    case 'JUMPING': {
      const ph = Math.min(t, 1.6) / 0.8; // two hops
      const air = Math.abs(S(ph * Math.PI));
      p.y = -air * 130 * k;
      const land = 1 - air;
      p.sy = 1 - land * 0.08 * (t < 1.6 ? 1 : 0) + air * 0.05; p.sx = 1 + land * 0.06 * (t < 1.6 ? 1 : 0);
      p.armL = 60 + air * 90; p.armR = 60 + air * 90; p.wing = air * 40; p.mouth = 'open'; p.eyes = 'happy';
      break;
    }
    case 'WAVING': p.armR = 140 + S(t * 12) * 25; p.head = 8; p.mouth = 'open'; p.eyes = 'happy'; break;
    case 'CLAPPING': {
      const c = (S(t * 11) + 1) / 2; p.armL = -30 + c * 55; p.armR = -30 + c * 55; p.y = -c * 6 * k; p.mouth = 'open'; p.eyes = 'happy';
      break;
    }
    case 'SPINNING': {
      if (reduced) { p.rot = S(t * 8) * 6; p.mouth = 'open'; break; }
      const turn = Math.min(t / 1.4, 1);
      const c = Math.cos(turn * TAU);
      if (threeD) p.yaw = turn * TAU; // a real turn around the body
      else p.sx = Math.sign(c || 1) * Math.max(0.08, Math.abs(c));
      p.y = -S(turn * Math.PI) * 40;
      p.armL = 90; p.armR = 90; p.wing = 30; p.tail = 30; p.mouth = 'open'; p.eyes = 'happy';
      break;
    }
    case 'FLYING': { // Zora: flaps up, flies one loop through the air and lands back on its spot
      const u = Math.min(t / 3.2, 1);
      const ue = u * u * (3 - 2 * u);
      const a = ue * TAU;
      p.x = 170 * S(a) * k; p.y = -82 * (1 - Math.cos(a)) * k;
      p.rot = 12 * Math.cos(a) * k; p.wing = 38 + S(t * 28) * 26; p.armL = 55; p.armR = 55; p.tail = S(t * 6) * 18;
      if (threeD) p.yaw = 0.5 * S(a); p.mouth = 'open'; p.eyes = 'happy';
      break;
    }
    case 'SOMERSAULT': { // Mimi: crouch, jump and flip once, land
      const u = Math.min(t / 1.9, 1);
      const v = Math.max(0, Math.min(1, (u - 0.2) / 0.6));
      const crouch = u < 0.2 ? S((u / 0.2) * Math.PI / 2) : u > 0.8 ? Math.max(0, 1 - (u - 0.8) / 0.1) * 0.8 : 0;
      p.y = -125 * S(v * Math.PI) * k; p.sy = 1 - crouch * 0.13; p.sx = 1 + crouch * 0.07;
      if (threeD) p.pitch = v >= 1 ? 0 : v * TAU; else p.rot = v >= 1 ? 0 : v * 360;
      p.armL = 60; p.armR = 60; p.tail = S(t * 9) * 20; p.mouth = 'open'; p.eyes = 'happy';
      break;
    }
    case 'TAILCHASE': { // Bruno: spins twice, faster and faster, with little hops and a wagging tail, then settles
      const u = Math.min(t / 2.8, 1);
      const turns = 2 * (u * u * (3 - 2 * u));
      if (threeD) p.yaw = turns * TAU; else { const c = Math.cos(turns * TAU); p.sx = Math.sign(c || 1) * Math.max(0.08, Math.abs(c)); }
      p.y = -Math.abs(S(t * 9)) * 16 * k; p.tail = S(t * 26) * 38; p.armL = 50; p.armR = 50; p.mouth = 'open'; p.eyes = 'happy';
      break;
    }
    case 'BEARHUG': { // Teddy: opens its arms wide, thumps its chest, then a big bear hug
      const u = Math.min(t / 3.4, 1);
      if (u < 0.28) { const e = S((u / 0.28) * Math.PI / 2); p.armL = 105 * e; p.armR = 105 * e; p.head = -6 * e; p.mouth = 'smile'; }
      else if (u < 0.72) { const w = (t - 0.95) * 13; p.armL = -8 + 30 * Math.max(0, S(w)); p.armR = -8 + 30 * Math.max(0, S(w + Math.PI)); p.y = -Math.abs(S(w)) * 9 * k; p.head = -9; p.mouth = 'open'; p.sy = 1 + 0.02 * S(w * 2); }
      else { const e = Math.min(1, (u - 0.72) / 0.12); p.armL = -10 * e + 60 * (1 - e); p.armR = -10 * e + 60 * (1 - e); p.rot = S((t - 2.4) * 4) * 4 * k; p.sy = 1 - 0.04 * e; p.mouth = 'smile'; p.head = 4; }
      p.eyes = 'happy';
      break;
    }
    case 'SIDESTEPPING': { // two clear steps right then left, arms swinging, body leaning into each step
      const c = S(Math.min(t, 2.8) * TAU / 1.4);
      p.x = c * 70 * k; p.rot = c * 7 * k; p.y = -Math.abs(S(Math.min(t, 2.8) * TAU / 0.7)) * 10 * k; p.armL = 60 + c * 35; p.armR = 60 - c * 35;
      p.head = c * 6; p.mouth = 'open'; p.eyes = 'happy'; p.lookX = c * 6;
      break;
    }
    case 'POINTING': { // turns towards the choices and points at them with one arm, a small nudge now and then
      const ease = Math.min(1, t / 0.4);
      p.armR = 100 * ease + S(t * 4) * 5 * ease; p.armL = 8; p.head = -6 * ease; p.lookX = 8 * ease; p.mouth = 'open'; p.eyes = 'happy';
      if (threeD) p.yaw = 0.55 * ease; else p.rot = 3 * ease;
      break;
    }
    case 'HANDSUP': { // both hands held high, happy sway
      const ease = Math.min(1, t / 0.35);
      p.armL = 175 * ease + S(t * 6) * 6; p.armR = 175 * ease - S(t * 6) * 6; p.y = -ease * 8 - Math.abs(S(t * 7)) * 8 * k; p.rot = S(t * 3.5) * 4 * k;
      p.mouth = 'open'; p.eyes = 'happy'; p.head = S(t * 3.5) * 5;
      break;
    }
    case 'BOUNCING': { // soft squashy bounce, arms relaxed
      const ph = Math.abs(S(t * TAU * 0.8));
      p.y = -ph * 26 * k; p.sy = 1 - (1 - ph) * 0.07; p.sx = 1 + (1 - ph) * 0.05; p.armL = 25 + ph * 20; p.armR = 25 + ph * 20; p.mouth = 'smile'; p.eyes = 'happy';
      break;
    }
    case 'LAUGHING':
      p.y = S(t * 26) * 4 * k; p.rot = S(t * 13) * 4 * k; p.head = -8 + S(t * 26) * 3; p.mouth = 'grin'; p.eyes = 'happy';
      p.armL = -20; p.armR = -20;
      break;
    case 'SLEEPING':
      p.sy = 1 + S(t * 1.1) * 0.03; p.y = 0; p.head = 7; p.eyes = 'closed'; p.mouth = 'tiny'; p.wing = 0; p.tail = S(t * 0.6) * 4;
      p.armL = -10; p.armR = -10; p.lookX = 0; p.lookY = 0;
      break;
    case 'HAPPY':
    case 'CELEBRATING': {
      const big = state === 'CELEBRATING' ? 1.4 : 1;
      p.y = -Math.abs(S(t * 6)) * 24 * big * k; p.armL = 140 + S(t * 12) * 15; p.armR = 140 - S(t * 12) * 15;
      p.wing = 30 + S(t * 12) * 15; p.mouth = 'open'; p.eyes = 'happy'; p.tail = S(t * 8) * 25 * k;
      break;
    }
    case 'CONFUSED': p.head = 14; p.brows = 'worried'; p.mouth = 'wobbly'; p.eyes = 'wide'; p.lookX = 8; p.lookY = -6; p.armR = 120; break;
    case 'SUPPORTIVE': p.head = -9; p.brows = 'soft'; p.mouth = 'smile'; p.armL = -35; p.armR = -35; p.rot = S(t * 1.2) * 3 * k; p.eyes = 'open'; break;
    case 'LISTENING': p.head = -10; p.eyes = 'wide'; p.lookX = 0; p.lookY = 2; break;
    case 'THINKING': p.head = 6; p.lookX = 6; p.lookY = -8; p.armR = 100; p.mouth = 'tiny'; break;
    case 'SPEAKING': p.head = S(t * 4) * 4; break;
    case 'BREATHING': {
      const b = breathPhase(breathT);
      const fill = b.phase === 'in' ? b.progress : b.phase === 'out' ? 1 - b.progress : 0;
      p.belly = 1 + fill * 0.1; p.sy = 1 + fill * 0.035; p.wing = fill * 25; p.y = -fill * 6;
      p.eyes = b.phase === 'out' ? 'closed' : 'open'; p.mouth = b.phase === 'out' ? 'o' : 'smile';
      p.mouthScale = b.phase === 'out' ? 0.8 : 1; p.armL = fill * 30; p.armR = fill * 30;
      break;
    }
    case 'STOPPING': p.rot = 0; p.y = 0; p.armL = 0; p.armR = 0; p.mouth = 'tiny'; p.eyes = 'wide'; break;
  }
  return p;
}

const MOOD_GLOW: Record<Mood, string> = {
  calm: '#FFD98A', happy: '#FFC46B', excited: '#FF9E7A', sleepy: '#B9A7F0', caring: '#FFA8C5', puzzled: '#8EDAD0',
};

interface Props {
  machine: CharacterMachine;
  mood: Mood;
  talkingUntil: React.MutableRefObject<number>;
  reduced: boolean;
  breathStart: React.MutableRefObject<number>;
  avatar?: AvatarId;
  /** Draw at ~15 fps (used while the opening animation runs on weak devices). */
  lowFps?: boolean;
}

export function Milo({ machine, mood, talkingUntil, reduced, breathStart, avatar = DEFAULT_AVATAR, lowFps = false }: Props) {
  const lowRef = useRef(lowFps);
  lowRef.current = lowFps;
  const root = useRef<SVGGElement>(null);
  const refs = useRef<Record<string, SVGElement | null>>({});
  const r = (name: string) => (el: SVGElement | null) => { refs.current[name] = el; };
  const blinkAt = useRef(0);
  const uid = React.useId().replace(/:/g, ''); // SVG ids must be unique per picture, or several buddies on screen all borrow the first one's colours

  useEffect(() => {
    if (typeof document !== 'undefined' && document.documentElement.classList.contains('perf-nomilo')) return;
    let raf = 0;
    let last = '';
    let lastFrame = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      // Idle needs little motion: 15 fps idle / 24 fps active keeps weak TV sticks responsive to the remote.
      const idle = machine.snapshot.state === 'IDLE' || machine.snapshot.state === 'SPEAKING';
      if (now - lastFrame < (lowRef.current ? 66 : idle ? 66 : 41)) return; // ~30fps is plenty for Milo and halves the work on weak sticks
      lastFrame = now;
      const s = machine.snapshot;
      const t = (now - s.enteredAt) / 1000;
      const pose = computePose(s.state, Math.max(0, t), machine.speed, s.style, reduced, now - breathStart.current);
      const R = refs.current;
      const set = (n: string, v: string) => R[n]?.setAttribute('transform', v);

      root.current?.setAttribute('transform',
        `translate(${pose.x.toFixed(1)} ${pose.y.toFixed(1)}) translate(300 600) rotate(${pose.rot.toFixed(2)}) scale(${pose.sx.toFixed(3)} ${pose.sy.toFixed(3)}) translate(-300 -600)`);
      const shadowScale = Math.max(0.55, 1 + pose.y / 260);
      R.shadow?.setAttribute('transform', `translate(300 612) scale(${shadowScale.toFixed(3)} 1) translate(-300 -612)`);
      set('head', `rotate(${pose.head.toFixed(2)} 300 330)`);
      set('tail', `rotate(${pose.tail.toFixed(2)} 405 520)`);
      set('wingL', `rotate(${(-pose.wing).toFixed(2)} 235 375)`);
      set('wingR', `rotate(${pose.wing.toFixed(2)} 365 375)`);
      set('armL', `rotate(${pose.armL.toFixed(1)} 200 420)`);
      set('armR', `rotate(${(-pose.armR).toFixed(1)} 400 420)`);
      set('belly', `translate(300 490) scale(${pose.belly.toFixed(3)}) translate(-300 -490)`);
      set('pupils', `translate(${pose.lookX.toFixed(1)} ${pose.lookY.toFixed(1)})`);

      // Blink every few seconds when eyes are open.
      if (now > blinkAt.current + 3800 + (blinkAt.current % 1700)) blinkAt.current = now;
      const blinking = now - blinkAt.current < 140 && pose.eyes === 'open';
      const eyes = blinking ? 'closed' : pose.eyes;

      // Mouth flaps while Milo is talking (independent of body animation).
      let mouth = pose.mouth;
      const talking = now < talkingUntil.current;
      if (talking && s.state !== 'SLEEPING' && (mouth === 'smile' || mouth === 'tiny' || mouth === 'wobbly' || mouth === 'open')) {
        mouth = Math.floor(now / 95) % 2 ? 'open' : 'smile';
      }
      const key = `${eyes}|${mouth}|${pose.brows}`;
      if (key !== last) {
        last = key;
        for (const m of ['smile', 'open', 'o', 'grin', 'wobbly', 'tiny']) R['m-' + m]?.setAttribute('visibility', m === mouth ? 'visible' : 'hidden');
        for (const e of ['open', 'happy', 'closed']) {
          const vis = e === eyes || (e === 'open' && eyes === 'wide');
          R['e-' + e]?.setAttribute('visibility', vis ? 'visible' : 'hidden');
        }
        R['brow-worried']?.setAttribute('visibility', pose.brows === 'worried' ? 'visible' : 'hidden');
        R['brow-soft']?.setAttribute('visibility', pose.brows === 'soft' ? 'visible' : 'hidden');
      }
      set('m-o', `translate(300 326) scale(${pose.mouthScale.toFixed(2)}) translate(-300 -326)`);
      set('eyeWide', eyes === 'wide' ? 'translate(240 222) scale(1.08) translate(-240 -222)' : '');
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [machine, reduced, talkingUntil, breathStart]);

  const skin = AVATARS[avatar].skin;
  const earPath = (side: 1 | -1) => {
    const x = side === 1 ? 0 : 600;
    const m = (v: number) => (side === 1 ? v : 600 - v);
    if (skin.ears === 'pointy') return <g><path d={`M${m(170)} 190 L ${m(190)} 40 L ${m(290)} 120 Z`} fill={skin.crest} /><path d={`M${m(200)} 160 L ${m(208)} 82 L ${m(256)} 124 Z`} fill={skin.inner} /></g>;
    if (skin.ears === 'floppy') return <g transform={`rotate(${side === 1 ? 16 : -16} ${m(200)} 150)`}><ellipse cx={m(176)} cy="190" rx="46" ry="96" fill={skin.crest} /><ellipse cx={m(176)} cy="206" rx="26" ry="64" fill={skin.inner} opacity="0.35" /></g>;
    if (skin.ears === 'round') return <g><circle cx={m(196)} cy="112" r="56" fill={skin.crest} /><circle cx={m(196)} cy="112" r="30" fill={skin.inner} /></g>;
    void x;
    return null;
  };
  const tailEl = skin.tail === 'dino' ? (
    <g ref={r('tail')}>
      <path d="M385 545 C 470 570, 530 530, 548 462 C 552 446, 536 440, 528 454 C 506 505, 462 522, 392 505 Z" fill={`url(#${uid}bodyG)`} />
      <path d="M530 456 L 566 424 L 556 470 Z" fill="#2BB3A3" stroke="#1E9C8E" strokeWidth="3" strokeLinejoin="round" />
      <circle cx="500" cy="512" r="9" fill="#2BB3A3" /><circle cx="462" cy="530" r="8" fill="#2BB3A3" />
    </g>
  ) : skin.tail === 'cat' ? (
    <g ref={r('tail')}><path d="M390 540 C 500 560, 560 500, 540 410 C 536 392, 512 396, 516 414 C 530 480, 480 520, 392 506 Z" fill={`url(#${uid}bodyG)`} /><path d="M540 410 C 536 392, 512 396, 516 414 C 518 430, 524 440, 530 448 Z" fill={skin.bodyDark} /></g>
  ) : skin.tail === 'dog' ? (
    <g ref={r('tail')}><path d="M388 535 C 450 545, 520 500, 534 440 C 538 424, 514 420, 508 438 C 492 486, 450 506, 392 502 Z" fill={`url(#${uid}bodyG)`} /></g>
  ) : (
    <g ref={r('tail')}><circle cx="420" cy="540" r="38" fill={`url(#${uid}bodyG)`} /></g>
  );
  const wing = (
    <>
      <path d="M240 385 C 185 340, 130 310, 100 250 C 140 262, 160 252, 172 236 C 182 268, 206 280, 214 292 C 226 312, 242 340, 252 372 Z" fill={`url(#${uid}wingG)`} />
      <path d="M172 240 C 190 290, 215 330, 242 370 M 120 258 C 160 300, 200 340, 240 378" stroke="#BFF2EA" strokeWidth="4" fill="none" strokeLinecap="round" opacity="0.7" />
    </>
  );

  return (
    <div className="milo-wrap" data-avatar={avatar}>
      <div className="mood-glow" style={{ background: `radial-gradient(circle, ${MOOD_GLOW[mood]}cc 0%, ${MOOD_GLOW[mood]}00 68%)` }} />
      <svg className="milo" viewBox="0 0 600 640" role="img" aria-label={`${AVATARS[avatar].name} the ${AVATARS[avatar].species}`}>
        <defs>
          <radialGradient id={`${uid}bodyG`} cx="38%" cy="30%" r="75%">
            <stop offset="0%" stopColor={skin.bodyLight} />
            <stop offset="60%" stopColor={skin.bodyMid} />
            <stop offset="100%" stopColor={skin.bodyDark} />
          </radialGradient>
          <radialGradient id={`${uid}headG`} cx="40%" cy="28%" r="78%">
            <stop offset="0%" stopColor={skin.bodyLight} />
            <stop offset="65%" stopColor={skin.bodyMid} />
            <stop offset="100%" stopColor={skin.bodyDark} />
          </radialGradient>
          <linearGradient id={`${uid}wingG`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#5FD3C4" />
            <stop offset="100%" stopColor="#1E9C8E" />
          </linearGradient>
          <clipPath id={`${uid}eyeClipL`}><ellipse cx="240" cy="222" rx="46" ry="54" /></clipPath>
          <clipPath id={`${uid}eyeClipR`}><ellipse cx="360" cy="222" rx="46" ry="54" /></clipPath>
        </defs>

        <ellipse ref={r('shadow')} cx="300" cy="612" rx="150" ry="20" fill="rgba(60,30,10,0.18)" />

        <g ref={root}>
          {tailEl}

          {skin.wings && (
            <>
              <g ref={r('wingL')}>{wing}</g>
              <g ref={r('wingR')}><g transform="translate(600 0) scale(-1 1)">{wing}</g></g>
            </>
          )}

          {/* feet */}
          <ellipse cx="228" cy="596" rx="52" ry="28" fill={skin.feet} />
          <ellipse cx="372" cy="596" rx="52" ry="28" fill={skin.feet} />
          {[200, 226, 252, 346, 372, 398].map((x) => <circle key={x} cx={x} cy="612" r="9" fill={skin.hand} />)}

          {/* body */}
          <ellipse cx="300" cy="470" rx="152" ry="142" fill={`url(#${uid}bodyG)`} />
          <g ref={r('belly')}>
            <ellipse cx="300" cy="490" rx="96" ry="104" fill={skin.belly} />
            {skin.face === 'dino' && [438, 478, 518, 556].map((y, i) => (
              <path key={y} d={`M${300 - (80 - i * 8 - (i === 3 ? 22 : 0))} ${y} Q 300 ${y + 14} ${300 + (80 - i * 8 - (i === 3 ? 22 : 0))} ${y}`} stroke={skin.bellyLine} strokeWidth="5" fill="none" strokeLinecap="round" />
            ))}
          </g>

          {/* arms */}
          <g ref={r('armL')}><ellipse cx="190" cy="462" rx="27" ry="46" fill={skin.arm} transform="rotate(14 190 462)" /><circle cx="181" cy="500" r="15" fill={skin.hand} /></g>
          <g ref={r('armR')}><ellipse cx="410" cy="462" rx="27" ry="46" fill={skin.arm} transform="rotate(-14 410 462)" /><circle cx="419" cy="500" r="15" fill={skin.hand} /></g>

          {/* head */}
          <g ref={r('head')}>
            {skin.horns && (
              <>
                {[[262, 96, 15], [300, 86, 18], [338, 96, 15]].map(([cx, cy, rr]) => <circle key={cx} cx={cx} cy={cy} r={rr} fill={skin.crest} />)}
                <ellipse cx="208" cy="112" rx="22" ry="44" fill="#FFD48A" transform="rotate(-28 208 112)" /><ellipse cx="392" cy="112" rx="22" ry="44" fill="#FFD48A" transform="rotate(28 392 112)" />
                <ellipse cx="208" cy="112" rx="10" ry="30" fill={skin.inner} transform="rotate(-28 208 112)" /><ellipse cx="392" cy="112" rx="10" ry="30" fill={skin.inner} transform="rotate(28 392 112)" />
              </>
            )}
            {skin.ears !== 'none' && <>{earPath(1)}{earPath(-1)}</>}
            <ellipse cx="300" cy="232" rx="168" ry="146" fill={`url(#${uid}headG)`} />

            {/* eyes: open */}
            <g ref={r('e-open')}>
              <g ref={r('eyeWide')}>
                <ellipse cx="240" cy="222" rx="46" ry="54" fill="#fff" />
                <ellipse cx="360" cy="222" rx="46" ry="54" fill="#fff" />
                <g ref={r('pupils')}>
                  <g clipPath={`url(#${uid}eyeClipL)`}><circle cx="246" cy="230" r="31" fill="#2A1B12" /><circle cx="256" cy="216" r="11" fill="#fff" /><circle cx="236" cy="244" r="5" fill="#fff" /></g>
                  <g clipPath={`url(#${uid}eyeClipR)`}><circle cx="354" cy="230" r="31" fill="#2A1B12" /><circle cx="364" cy="216" r="11" fill="#fff" /><circle cx="344" cy="244" r="5" fill="#fff" /></g>
                </g>
              </g>
            </g>
            <g ref={r('e-happy')} visibility="hidden">
              <path d="M205 236 Q 240 192 275 236" stroke="#2A1B12" strokeWidth="10" fill="none" strokeLinecap="round" />
              <path d="M325 236 Q 360 192 395 236" stroke="#2A1B12" strokeWidth="10" fill="none" strokeLinecap="round" />
            </g>
            <g ref={r('e-closed')} visibility="hidden">
              <path d="M205 226 Q 240 254 275 226" stroke="#2A1B12" strokeWidth="9" fill="none" strokeLinecap="round" />
              <path d="M325 226 Q 360 254 395 226" stroke="#2A1B12" strokeWidth="9" fill="none" strokeLinecap="round" />
            </g>
            <g ref={r('brow-worried')} visibility="hidden">
              <path d="M210 158 Q 238 150 268 164" stroke="#9A4A16" strokeWidth="8" fill="none" strokeLinecap="round" />
              <path d="M332 150 Q 362 140 390 150" stroke="#9A4A16" strokeWidth="8" fill="none" strokeLinecap="round" />
            </g>
            <g ref={r('brow-soft')} visibility="hidden">
              <path d="M212 160 Q 240 148 268 154" stroke="#9A4A16" strokeWidth="7" fill="none" strokeLinecap="round" />
              <path d="M332 154 Q 360 148 388 160" stroke="#9A4A16" strokeWidth="7" fill="none" strokeLinecap="round" />
            </g>

            {/* cheeks + muzzle (face-specific) */}
            <ellipse cx="185" cy="288" rx="28" ry="17" fill={skin.cheek} opacity="0.55" />
            <ellipse cx="415" cy="288" rx="28" ry="17" fill={skin.cheek} opacity="0.55" />
            <ellipse cx="300" cy="300" rx={skin.face === 'bear' ? 92 : 78} ry={skin.face === 'bear' ? 58 : 48} fill={skin.muzzle} />
            {skin.face === 'dino' && <><ellipse cx="282" cy="286" rx="7" ry="5" fill={skin.nose} /><ellipse cx="318" cy="286" rx="7" ry="5" fill={skin.nose} /></>}
            {skin.face === 'cat' && (
              <>
                <path d="M284 280 L 316 280 L 300 298 Z" fill={skin.nose} />
                <path d="M130 270 L 215 284 M 126 300 L 214 298 M 470 270 L 385 284 M 474 300 L 386 298" stroke="#6F7890" strokeWidth="4" strokeLinecap="round" />
              </>
            )}
            {skin.face === 'dog' && <ellipse cx="300" cy="284" rx="26" ry="19" fill={skin.nose} />}
            {skin.face === 'bear' && <ellipse cx="300" cy="282" rx="24" ry="17" fill={skin.nose} />}

            {/* mouths */}
            <g ref={r('m-smile')}>
              <path d="M262 318 Q 300 350 338 318" stroke="#5B2410" strokeWidth="7" fill="none" strokeLinecap="round" />
              {skin.face === 'dino' && <path d="M322 328 L 328 340 L 333 325 Z" fill="#fff" />}
            </g>
            <g ref={r('m-open')} visibility="hidden">
              <path d="M260 314 Q 300 372 340 314 Q 300 328 260 314 Z" fill="#7A2E1A" />
              <ellipse cx="300" cy="342" rx="16" ry="8" fill="#FF7E8E" />
              {skin.face === 'dino' && <path d="M318 320 L 323 332 L 328 318 Z" fill="#fff" />}
            </g>
            <g ref={r('m-o')} visibility="hidden">
              <ellipse cx="300" cy="326" rx="17" ry="21" fill="#7A2E1A" />
              <ellipse cx="300" cy="334" rx="9" ry="6" fill="#FF7E8E" />
            </g>
            <g ref={r('m-grin')} visibility="hidden">
              <path d="M250 310 Q 300 390 350 310 Z" fill="#7A2E1A" />
              <path d="M275 350 Q 300 372 325 350 Q 300 345 275 350 Z" fill="#FF7E8E" />
              {skin.face === 'dino' && <path d="M262 312 L 338 312 L 334 322 L 266 322 Z" fill="#fff" />}
            </g>
            <g ref={r('m-wobbly')} visibility="hidden">
              <path d="M268 326 Q 284 314 300 326 Q 316 338 332 326" stroke="#5B2410" strokeWidth="7" fill="none" strokeLinecap="round" />
            </g>
            <g ref={r('m-tiny')} visibility="hidden">
              <path d="M286 324 Q 300 334 314 324" stroke="#5B2410" strokeWidth="6" fill="none" strokeLinecap="round" />
            </g>
          </g>
        </g>
      </svg>
    </div>
  );
}
