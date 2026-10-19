// The 3D buddy on the stage. Same props and the same state machine as the flat SVG Milo (Milo.tsx), which is used as
// the fallback when WebGL is missing, fails, or cannot keep up on a weak device (the choice is remembered).

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { WebGLRenderer } from 'three';
import type { CharacterMachine } from '../core/character.ts';
import type { Mood } from '../core/types.ts';
import { AVATARS, DEFAULT_AVATAR, type AvatarId } from '../core/avatars.ts';
import { Milo, computePose, type BuddyLookKinds, type Pose } from './Milo.tsx';
import { OUTPUT_COLOR_SPACE, createBuddy, createStage, type Buddy as Buddy3D } from './buddy3d.ts';

const RENDER_KEY = 'zora.render';
const MOOD_GLOW: Record<Mood, string> = {
  calm: '#FFD98A', happy: '#FFC46B', excited: '#FF9E7A', sleepy: '#B9A7F0', caring: '#FFA8C5', puzzled: '#8EDAD0',
};

let webglChecked: boolean | null = null;
/** Is WebGL there at all? Checked once (every check opens a real GL context, so it must not be repeated). */
export function webglAvailable(): boolean {
  if (webglChecked !== null) return webglChecked;
  try {
    if (typeof document === 'undefined') return false;
    const c = document.createElement('canvas');
    const gl = (c.getContext('webgl2') || c.getContext('webgl')) as WebGLRenderingContext | null;
    webglChecked = !!gl;
    gl?.getExtension('WEBGL_lose_context')?.loseContext(); // give the test context back
  } catch { webglChecked = false; }
  return webglChecked;
}

/** 3D unless the owner/a failed run switched it off (localStorage zora.render = 2d, or ?2d in the address). */
export function want3D(): boolean {
  try {
    if (typeof window === 'undefined') return false;
    if (/[?&]2d\b/.test(window.location.search)) return false;
    if (window.localStorage?.getItem(RENDER_KEY) === '2d') return false;
    if (document.documentElement.classList.contains('perf-nomilo')) return false;
  } catch { /* storage blocked: stay with 3D */ }
  return webglAvailable();
}

interface Props {
  machine: CharacterMachine;
  mood: Mood;
  talkingUntil: React.MutableRefObject<number>;
  reduced: boolean;
  breathStart: React.MutableRefObject<number>;
  avatar?: AvatarId;
  lowFps?: boolean;
}

// The canvas is roomy (1040 x 960 on the 1920x1080 stage) so the special moves (a flying loop, a somersault) never leave it;
// it is drawn at 85% resolution to keep the cost close to the old, smaller canvas on weak TV sticks.
const W = 1040, H = 960, RES = 0.75;

export function Buddy(props: Props) {
  const [mode, setMode] = useState<'3d' | '2d'>(() => (want3D() ? '3d' : '2d'));
  // One stable callback: a new function each render used to restart the whole 3D scene on every app update.
  const fail = useCallback((why: string) => {
    console.error(`[3d] falling back to the flat buddy: ${why}`);
    try { window.localStorage?.setItem(RENDER_KEY, '2d'); } catch { /* ignore */ }
    setMode('2d');
  }, []);
  if (mode === '2d') return <Milo {...props} />;
  return <Milo3D {...props} onFail={fail} />;
}

type Smooth = Omit<Pose, 'mouth' | 'eyes' | 'brows' | 'yaw'>;
const SMOOTH_KEYS: (keyof Smooth)[] = ['x', 'y', 'rot', 'sx', 'sy', 'head', 'tail', 'wing', 'armL', 'armR', 'belly', 'lookX', 'lookY', 'mouthScale'];

function Milo3D({ machine, mood, talkingUntil, reduced, breathStart, avatar = DEFAULT_AVATAR, lowFps = false, onFail }: Props & { onFail: (why: string) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const lowRef = useRef(lowFps);
  lowRef.current = lowFps;
  const blinkAt = useRef(0);
  const avatarRef = useRef(avatar);
  avatarRef.current = avatar;
  const swap = useRef<((a: AvatarId) => void) | null>(null);
  const live = useRef({ machine, reduced, talkingUntil, breathStart });
  live.current = { machine, reduced, talkingUntil, breathStart };

  // One renderer and one render loop for the life of the component; only the model is swapped when the buddy changes.
  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    let renderer: WebGLRenderer;
    try {
      renderer = new WebGLRenderer({ canvas: el, antialias: true, alpha: true, powerPreference: 'low-power' });
    } catch (e) { onFail(String(e)); return; }
    renderer.outputColorSpace = OUTPUT_COLOR_SPACE;
    renderer.setPixelRatio(RES);
    renderer.setSize(W, H, false);
    renderer.setClearColor(0x000000, 0);
    const { scene, camera } = createStage(W / H);
    // Same picture scale as before (about 113 px per unit), just more room all round: a wider view, a little taller.
    camera.fov = 32.8;
    camera.position.set(0, 4.98, 14.3);
    camera.lookAt(0, 3.68, 0);
    camera.updateProjectionMatrix();
    let buddy: Buddy3D | null = null;
    const build = (a: AvatarId) => {
      if (buddy) { scene.remove(buddy.root); scene.remove(buddy.shadow); buddy.dispose(); }
      buddy = createBuddy(a);
      scene.add(buddy.root);
      scene.add(buddy.shadow);
      smooth = null;
    };
    swap.current = build;
    let smooth: Smooth | null = null;
    let yawSmooth = 0, wasSpin = false;
    build(avatarRef.current);
    const lost = (e: Event) => { e.preventDefault(); onFail('WebGL context lost'); };
    el.addEventListener('webglcontextlost', lost);

    let raf = 0;
    let frames = 0;
    let lastFrame = 0;
    let lastNow = 0;
    // Speed check after a warm-up: if the page cannot keep about 18+ frames a second while visible, three windows in a
    // row, the flat buddy takes over for good.
    const born = performance.now();
    let watchStart = 0, watchFrames = 0, slowWindows = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (document.visibilityState !== 'visible') { watchStart = 0; return; }
      if (now - born > 8000) {
        if (!watchStart) { watchStart = now; watchFrames = 0; }
        watchFrames++;
        if (now - watchStart > 4000) {
          slowWindows = watchFrames / ((now - watchStart) / 1000) < 18 ? slowWindows + 1 : 0;
          if (slowWindows >= 3) { onFail('too slow'); return; }
          watchStart = now; watchFrames = 0;
        }
      }
      const { machine: m, reduced: red, talkingUntil: tu, breathStart: bs } = live.current;
      const s = m.snapshot;
      const idle = s.state === 'IDLE' || s.state === 'SPEAKING';
      // Every display frame while it moves (smooth), half rate while it only breathes, quarter during the opening.
      if (now - lastFrame < (lowRef.current ? 66 : idle ? 50 : 22)) return;
      lastFrame = now;
      const dt = Math.min(0.1, lastNow ? (now - lastNow) / 1000 : 0.016);
      lastNow = now;
      const t = Math.max(0, (now - s.enteredAt) / 1000);
      const target = computePose(s.state, t, m.speed, s.style, red, now - bs.current, true);
      // Ease towards the target pose so state changes and fast moves glide instead of snapping.
      if (!smooth) smooth = { ...target };
      else {
        const k = 1 - Math.exp(-dt * 20);
        for (const key of SMOOTH_KEYS) smooth[key] = smooth[key] + (target[key] - smooth[key]) * k;
      }
      // The turn is smoothed too (so pointing turns gently); a spin is followed exactly, and a finished spin lands back on 0.
      if (s.state === 'SPINNING' || s.state === 'TAILCHASE') { yawSmooth = target.yaw; wasSpin = true; }
      else {
        if (wasSpin) { yawSmooth %= Math.PI * 2; wasSpin = false; }
        yawSmooth += (target.yaw - yawSmooth) * (1 - Math.exp(-dt * 9));
      }
      const pose: Pose = { ...smooth, yaw: yawSmooth, pitch: target.pitch, mouth: target.mouth, eyes: target.eyes, brows: target.brows };

      if (now > blinkAt.current + 3800 + (blinkAt.current % 1700)) blinkAt.current = now;
      const blinking = now - blinkAt.current < 140 && pose.eyes === 'open';
      const eyes = blinking ? 'closed' : pose.eyes;
      let mouth = pose.mouth;
      const talking = now < tu.current;
      if (talking && s.state !== 'SLEEPING' && (mouth === 'smile' || mouth === 'tiny' || mouth === 'wobbly' || mouth === 'open')) mouth = Math.floor(now / 95) % 2 ? 'open' : 'smile';
      const look: BuddyLookKinds = { eyes, mouth, brows: pose.brows };
      // A gentle turn left and right keeps it clearly 3D even when it stands still.
      const idleYaw = s.state === 'SPINNING' || s.state === 'TAILCHASE' ? 0 : Math.sin(now / 1000 * 0.7) * (red ? 0.05 : 0.2);
      buddy?.apply(pose, look, idleYaw);
      renderer.render(scene, camera);
      el.dataset.frames = String(++frames); // lets tests see that it is really drawing
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      swap.current = null;
      el.removeEventListener('webglcontextlost', lost);
      buddy?.dispose();
      renderer.dispose();
    };
  }, [onFail]);

  useEffect(() => { swap.current?.(avatar); }, [avatar]);

  return (
    <div className="milo-wrap" data-avatar={avatar}>
      <div className="mood-glow" style={{ background: `radial-gradient(circle, ${MOOD_GLOW[mood]}4d 0%, ${MOOD_GLOW[mood]}00 62%)` }} />
      <canvas ref={canvas} className="milo milo3d" width={W} height={H} role="img" aria-label={`${AVATARS[avatar].name} the ${AVATARS[avatar].species}`} />
    </div>
  );
}
