// Small 3D pictures of the buddy, drawn once with the same 3D model as the big character:
//  - a face portrait (avatar picker), and
//  - a short strip of frames for each Dance Maker / Says move (the strip plays when the card is focused or hovered).
// Everything is made lazily on the first screen that needs it, a few frames at a time, then kept as images.

import { useEffect, useState } from 'react';
import { WebGLRenderer } from 'three';
import { AVATAR_IDS, type AvatarId } from '../core/avatars.ts';
import type { CharacterState } from '../core/types.ts';
import { computePose } from './Milo.tsx';
import { OUTPUT_COLOR_SPACE, createBuddy, createStage } from './buddy3d.ts';
import { want3D } from './Milo3D.tsx';

export interface MoveStrip { url: string; frames: number; ms: number; still: number }

const FRAME = 192;
const FRAMES = 8;
/** The animation state, the length of one loop in seconds, and the frame that looks best standing still. */
const MOVES: Record<string, { state: CharacterState; period: number; still: number }> = {
  wave: { state: 'WAVING', period: 0.52, still: 2 },
  jump: { state: 'JUMPING', period: 1.6, still: 2 },
  sidestep: { state: 'SIDESTEPPING', period: 1.4, still: 1 },
  turn: { state: 'SPINNING', period: 1.4, still: 0 },
  handsup: { state: 'HANDSUP', period: 1.05, still: 3 },
  bounce: { state: 'BOUNCING', period: 0.625, still: 1 },
};
export const MOVE_IDS = Object.keys(MOVES);

let renderer: WebGLRenderer | null = null;
let rendererFailed = false;
function getRenderer(): WebGLRenderer | null {
  if (renderer || rendererFailed) return renderer;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = FRAME; canvas.height = FRAME;
    renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.outputColorSpace = OUTPUT_COLOR_SPACE;
    renderer.setPixelRatio(1);
    renderer.setSize(FRAME, FRAME, false);
    renderer.setClearColor(0x000000, 0);
  } catch (e) { rendererFailed = true; console.error(`[3d] picture renderer unavailable: ${String(e)}`); }
  return renderer;
}

const faces = new Map<AvatarId, string>();
const strips = new Map<string, MoveStrip>();
const jobs = new Map<AvatarId, Promise<void>>();
const listeners = new Set<() => void>();

function renderFace(avatar: AvatarId, r: WebGLRenderer): string {
  const { scene, camera } = createStage(1);
  camera.position.set(0, 3.7, 7.5);
  camera.lookAt(0, 3.6, 0);
  const b = createBuddy(avatar);
  scene.add(b.root);
  const pose = computePose('IDLE', 0, 1, 'normal', true, 0, true);
  b.apply(pose, { eyes: 'open', mouth: 'smile', brows: 'none' }, 0.28);
  r.render(scene, camera);
  const url = r.domElement.toDataURL('image/png');
  b.dispose();
  return url;
}

function renderStrip(avatar: AvatarId, move: string, r: WebGLRenderer, size = FRAME, frames = FRAMES): MoveStrip {
  const def = MOVES[move];
  if (size !== FRAME) r.setSize(size, size, false);
  const { scene, camera } = createStage(1);
  const big = size !== FRAME; // opening scene: closer camera so the buddy fills the frame like the live character
  // The toes stick out towards the camera, so the frame needs a margin below the feet (it used to cut them off).
  camera.position.set(0, big ? 4.0 : 4.1, big ? 13.8 : 13.4);
  camera.lookAt(0, big ? 3.1 : 3.2, 0);
  const b = createBuddy(avatar);
  scene.add(b.root);
  const strip = document.createElement('canvas');
  strip.width = size * frames; strip.height = size;
  const sctx = strip.getContext('2d')!;
  for (let i = 0; i < frames; i++) {
    const pose = computePose(def.state, (i / frames) * def.period, 1, 'normal', false, 0, true);
    const sway = move === 'turn' ? 0 : 0.18;
    b.apply(pose, { eyes: big ? 'open' : pose.eyes, mouth: pose.mouth, brows: 'none' }, sway); // intro: wide-open eyes, as the live character has
    r.render(scene, camera);
    sctx.drawImage(r.domElement, i * size, 0);
  }
  b.dispose();
  if (size !== FRAME) r.setSize(FRAME, FRAME, false);
  return { url: strip.toDataURL('image/png'), frames, ms: Math.round(Math.max(600, def.period * 1000 * (move === 'wave' || move === 'bounce' ? 2 : 1))), still: def.still };
}

/** Make this buddy's pictures (one move per timer tick, so the remote never feels stuck). */
function makeArt(avatar: AvatarId): Promise<void> {
  let job = jobs.get(avatar);
  if (job) return job;
  job = new Promise<void>((resolve) => {
    const r = getRenderer();
    if (!r) { resolve(); return; }
    const todo: (() => void)[] = [() => { faces.set(avatar, renderFace(avatar, r)); }];
    for (const m of MOVE_IDS) todo.push(() => { strips.set(`${avatar}:${m}`, renderStrip(avatar, m, r)); });
    const step = () => {
      const next = todo.shift();
      if (!next) { resolve(); return; }
      try { next(); } catch (e) { console.error(`[3d] picture failed: ${String(e)}`); }
      listeners.forEach((l) => l());
      setTimeout(step, 0);
    };
    setTimeout(step, 0);
  });
  jobs.set(avatar, job);
  return job;
}

/** Re-renders the caller whenever more pictures of `avatar` are ready. Returns false when 3D pictures are not available. */
function useArt(avatar: AvatarId): boolean {
  const [, bump] = useState(0);
  const on = want3D();
  useEffect(() => {
    if (!on) return;
    const l = () => bump((n) => n + 1);
    listeners.add(l);
    void makeArt(avatar);
    return () => { listeners.delete(l); };
  }, [avatar, on]);
  return on;
}

export function useFacePicture(avatar: AvatarId): string | null {
  const on = useArt(avatar);
  return on ? faces.get(avatar) ?? null : null;
}

export function useMoveStrip(avatar: AvatarId, move: string): MoveStrip | null {
  const on = useArt(avatar);
  return on ? strips.get(`${avatar}:${move}`) ?? null : null;
}

/** All avatars, for warming the cache when the picker opens. */
export function warmAll(): void { if (want3D()) for (const id of AVATAR_IDS) void makeArt(id); }

/* ---- bigger, smoother strips for the opening scene (four buddies side by side) ---- */
const BIG = 440, BIG_FRAMES = 12; // drawn at the size they are shown, so they stay sharp
const bigStrips = new Map<string, MoveStrip>();
const bigQueue: (() => void)[] = [];
let bigBusy = false;
function pumpBig() {
  if (bigBusy) return;
  bigBusy = true;
  const step = () => {
    const job = bigQueue.shift();
    if (!job) { bigBusy = false; return; }
    try { job(); } catch (e) { console.error(`[3d] intro picture failed: ${String(e)}`); }
    listeners.forEach((l) => l());
    setTimeout(step, 0);
  };
  setTimeout(step, 0);
}
/** Pre-drawn opening strips (public/intro/<avatar>-<move>.png, made with ?exportintro): they show at once, with no drawing work on a weak TV. */
export const INTRO_FRAMES = BIG_FRAMES;
export function introStripMeta(move: string): { frames: number; ms: number } {
  const def = MOVES[move];
  return { frames: BIG_FRAMES, ms: Math.round(Math.max(600, def.period * 1000 * (move === 'wave' || move === 'bounce' ? 2 : 1))) };
}
export function introStripUrl(avatar: AvatarId, move: string): string { return `intro/${avatar}-${move}.png`; }

/** Lets scripts/export-intro.py draw the opening strips and save them as files (nothing else calls it). */
if (typeof window !== 'undefined') {
  (window as unknown as { __exportIntro?: (a: AvatarId, m: string) => string | null }).__exportIntro = (a, m) => {
    const r = getRenderer();
    return r ? renderStrip(a, m, r, BIG, BIG_FRAMES).url : null;
  };
}

export function useBigStrip(avatar: AvatarId, move: string, enabled = true): MoveStrip | null {
  const [, bump] = useState(0);
  const on = want3D() && enabled;
  const key = `${avatar}:${move}`;
  useEffect(() => {
    if (!on) return;
    const l = () => bump((n) => n + 1);
    listeners.add(l);
    if (!bigStrips.has(key) && !bigQueue.length) {
      const r = getRenderer();
      if (r) { bigQueue.push(() => { bigStrips.set(key, renderStrip(avatar, move, r, BIG, BIG_FRAMES)); }); pumpBig(); }
    } else if (!bigStrips.has(key)) {
      const r = getRenderer();
      if (r) { bigQueue.push(() => { bigStrips.set(key, renderStrip(avatar, move, r, BIG, BIG_FRAMES)); }); pumpBig(); }
    }
    return () => { listeners.delete(l); };
  }, [avatar, move, on, key]);
  return on ? bigStrips.get(key) ?? null : null;
}

/** The pre-drawn strip for the opening scene: `strip` once the picture has loaded, `failed` if the file is missing (then draw it live). */
export function useIntroStrip(avatar: AvatarId, move: string): { strip: MoveStrip | null; failed: boolean } {
  const [state, setState] = useState<{ key: string; ok: boolean } | null>(null);
  const key = `${avatar}:${move}`;
  const url = introStripUrl(avatar, move);
  useEffect(() => {
    let live = true;
    const img = new Image();
    img.onload = () => { if (live) setState({ key, ok: true }); };
    img.onerror = () => { if (live) setState({ key, ok: false }); };
    img.src = url;
    return () => { live = false; };
  }, [key, url]);
  if (state?.key !== key) return { strip: null, failed: false };
  if (!state.ok) return { strip: null, failed: true };
  const m = introStripMeta(move);
  return { strip: { url, frames: m.frames, ms: m.ms, still: 0 }, failed: false };
}
