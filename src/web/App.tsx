import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { MiloBrain, type Effect, type Reaction } from '../core/brain.ts';
import { line } from '../core/responses.ts';
import { RHYMES, RHYME_SEQUENCE_CONFIG } from '../core/rhymes.ts';
import { RhymeSequence } from '../core/rhymeSequence.ts';
import { LAUGH_LINE, PICK_LINE, withBuddyName } from '../core/responses.ts';
import { AVATARS, DEFAULT_AVATAR, loadAvatar, saveAvatar, type AvatarId } from '../core/avatars.ts';
import type { CharacterState, Intent, Mood, ParsedCommand, Screen } from '../core/types.ts';
import { audio } from './audio.ts';
import { FocusMemory, ensureFocus, nextInDirection, toRemoteKey } from './focus.ts';
import { IntroCast, PartyBalloons, Scale } from './icons.tsx';
import { Buddy } from './Milo3D.tsx';
import { audioChannel } from './audioFlow.ts';
import { revealInScroller } from './screens.tsx';
import { Alphabets, Band, AvatarPicker, AnimalGuess, Breathe, Dance, DanceMaker, Diagnostics, Help, Home, Parents, Play, Rhymes, ShapeMatch, SimonSays, Talk } from './screens.tsx';
import { Btn, INTENT_PHRASE, type Ctx, type RhymeState, type Settings } from './ui.tsx';
import { voice } from './voice.ts';
import { speech } from './speech.ts';

const PARENT_OF: Record<Screen, Screen | 'exit'> = {
  home: 'exit', dance: 'home', rhymes: 'home', play: 'home', talk: 'home', alphabets: 'home', band: 'home', avatar: 'home', help: 'home', breathe: 'home', parents: 'home',
  shape: 'play', simon: 'play', animal: 'play', maker: 'dance', diagnostics: 'parents',
};

type ParticleKind = 'notes' | 'sparkles' | 'hearts' | 'zzz' | 'bubbles' | 'question';
interface P { id: number; kind: ParticleKind; x: number; y: number; d: number; s: number }

const DEFAULT_SETTINGS: Settings = { sound: true, volume: 'medium', voice: true, systemTts: false, motion: 'full', windDownMin: 0, dev: false };
const VOICE_VOL = { low: 0.45, medium: 0.75, high: 1 } as const;
const HOLD_MS = 3000;

function timeOfDay(bedtime: boolean): 'morning' | 'day' | 'sunset' | 'night' {
  if (bedtime) return 'night';
  const h = new Date().getHours();
  if (h >= 6 && h < 11) return 'morning';
  if (h >= 11 && h < 17) return 'day';
  if (h >= 17 && h < 20) return 'sunset';
  return 'night';
}

function useStageScale() {
  const [s, setS] = useState(1);
  useEffect(() => {
    const f = () => setS(Math.min(window.innerWidth / 1920, window.innerHeight / 1080));
    f();
    window.addEventListener('resize', f);
    return () => window.removeEventListener('resize', f);
  }, []);
  return s;
}

function ParticleGlyph({ kind }: { kind: ParticleKind }) {
  switch (kind) {
    case 'notes': return <svg viewBox="0 0 40 40" width="100%" height="100%"><path d="M14 30 L14 8 L32 4 L32 26" stroke="#8E6CC9" strokeWidth="4" fill="none" /><ellipse cx="10" cy="30" rx="6" ry="5" fill="#8E6CC9" /><ellipse cx="28" cy="26" rx="6" ry="5" fill="#8E6CC9" /></svg>;
    case 'sparkles': return <svg viewBox="0 0 40 40" width="100%" height="100%"><path d="M20 2 L24 16 L38 20 L24 24 L20 38 L16 24 L2 20 L16 16 Z" fill="#FFD23F" /></svg>;
    case 'hearts': return <svg viewBox="0 0 40 40" width="100%" height="100%"><path d="M20 36 C 6 26, 2 18, 4 12 C 6 4, 16 2, 20 10 C 24 2, 34 4, 36 12 C 38 18, 34 26, 20 36 Z" fill="#FF8FA3" /></svg>;
    case 'zzz': return <svg viewBox="0 0 40 40" width="100%" height="100%"><text x="6" y="32" fontSize="32" fontWeight="900" fill="#8E6CC9">z</text></svg>;
    case 'bubbles': return <svg viewBox="0 0 40 40" width="100%" height="100%"><circle cx="20" cy="20" r="16" fill="rgba(191,242,234,0.35)" stroke="#BFF2EA" strokeWidth="3" /><circle cx="14" cy="14" r="4" fill="#fff" opacity="0.8" /></svg>;
    case 'question': return <svg viewBox="0 0 40 40" width="100%" height="100%"><text x="8" y="34" fontSize="36" fontWeight="900" fill="#2BB3A3">?</text></svg>;
  }
}

export function App() {
  const scale = useStageScale();
  const brain = useMemo(() => new MiloBrain(Math.random, performance.now()), []);
  const focusMem = useMemo(() => new FocusMemory(), []);
  const [screen, setScreen] = useState<Screen>('home');
  const [avatar, setAvatarState] = useState<AvatarId>(() => {
    try { return loadAvatar(window.localStorage); } catch { return DEFAULT_AVATAR; }
  });
  speech.character = avatar; // the avatar's own voice for dialogue (and its rhymes are sung in it too)
  const setAvatar = useCallback((id: AvatarId) => {
    speech.character = id; // switch before the next line is spoken
    setAvatarState(id);
    try { saveAvatar(id, window.localStorage); } catch { /* storage unavailable: the choice lasts until the app closes */ }
  }, []);
  const [intro, setIntro] = useState(true);
  const introRef = useRef(true);
  const [bubble, setBubble] = useState<{ text: string; key: number }>({ text: '', key: 0 });
  const [mood, setMood] = useState<Mood>('happy');
  const [choices, setChoices] = useState<Intent[] | null>(null);
  const choicesRef = useRef<Intent[] | null>(null);
  choicesRef.current = choices;
  const bubbleHide = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [particles, setParticles] = useState<P[]>([]);
  const [scales, setScales] = useState<string[]>([]);
  const [settings, setSettingsState] = useState<Settings>(DEFAULT_SETTINGS);
  const [rhyme, setRhyme] = useState<RhymeState>({ id: null, status: 'idle' });
  const [charState, setCharState] = useState<CharacterState>('IDLE');
  const [speedIndex, setSpeedIndex] = useState(brain.machine.snapshot.speedIndex);
  const [gameKey, setGameKey] = useState(0);
  const [bedtime, setBedtime] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [hold, setHold] = useState(0);
  const [prefersReduced] = useState(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);

  const talkingUntil = useRef(0);
  const [voiceIssue, setVoiceIssue] = useState<string | null>(null);
  const [speechState, setSpeechState] = useState<string>('idle');
  const breathStart = useRef(0);
  const musicHold = useRef(false);
  const musicTempo = useRef<number | null>(null);
  const pid = useRef(0);
  const screenRef = useRef(screen);
  const sessionStart = useRef(performance.now());
  const lastBack = useRef(0);
  const holdStart = useRef(0);
  const holdTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const reduced = settings.motion === 'gentle' || prefersReduced;

  /* ---------- speech + particles ---------- */
  const say = useCallback((text: string, m: Mood = 'happy') => {
    setBubble((b) => ({ text, key: b.key + 1 }));
    setMood(m);
    // Real speech (bundled clip or verified system voice). The mouth moves only
    // while audio is actually playing: see the speech.queue.onChange effect below.
    const u = speech.speak(text);
    setVoiceIssue(u.state === 'failed' ? u.reason ?? 'no voice' : null);
  }, []);

  // Mouth + music ducking follow real playback events (approximate lip-sync).
  useEffect(() => speech.queue.onChange((u) => {
    const talking = u.state === 'speaking';
    if (talking) talkingUntil.current = Number.POSITIVE_INFINITY;
    else if (!speech.queue.speaking) talkingUntil.current = 0;
    audio.duck(speech.queue.speaking);
    // Talk: once the buddy has finished speaking, the speech bubble closes by itself (unless answer buttons are showing).
    if (bubbleHide.current) { clearTimeout(bubbleHide.current); bubbleHide.current = null; }
    if (!speech.queue.speaking && screenRef.current === 'talk') {
      bubbleHide.current = setTimeout(() => { bubbleHide.current = null; if (!choicesRef.current && !speech.queue.speaking) setBubble((b) => ({ text: '', key: b.key + 1 })); }, 3000);
    }
    if (u.state === 'failed') setVoiceIssue(u.reason ?? 'playback failed');
    setSpeechState(u.state);
  }), []);

  const particlesFn = useCallback((kind: ParticleKind, n = 6) => {
    const count = reduced ? Math.min(2, n) : n;
    const ps: P[] = Array.from({ length: count }, () => ({
      // Spawn beside Milo, never over his face.
      id: ++pid.current, kind, x: Math.random() < 0.5 ? 60 + Math.random() * 150 : 650 + Math.random() * 150, y: 380 + Math.random() * 320, d: Math.random() * 0.6, s: 34 + Math.random() * 30,
    }));
    setParticles((cur) => [...cur.slice(-30), ...ps]); // bounded
    setTimeout(() => setParticles((cur) => cur.filter((p) => !ps.includes(p))), 3400);
  }, [reduced]);

  const showBubble = useCallback((text: string, m: Mood = 'happy') => { setBubble((b) => ({ text, key: b.key + 1 })); setMood(m); }, []);
  const sfx = useCallback((name: string) => audio.playSound(name), []);

  /* ---------- rhymes ---------- */
  const avatarRef = useRef(avatar);
  avatarRef.current = avatar;
  const seqRef = useRef<RhymeSequence | null>(null);
  const jokeCancel = useRef<(() => void) | null>(null);
  const cancelRhymeSequence = useCallback(() => { seqRef.current?.cancel(false); seqRef.current = null; }, []);
  const playRhyme = useCallback((id: string) => {
    audio.unlock();
    cancelRhymeSequence();
    audio.stopRhyme();
    speech.cancel('new rhyme');
    const r = RHYMES.find((x) => x.id === id);
    if (!r) return;
    brain.selectRhyme(id);
    // Dialogue stages: the avatar waves/talks; it only sings once the song really starts.
    brain.machine.enter('WAVING', performance.now(), { durationMs: 2500 });
    audio.rhymeError = null;
    setRhyme({ id, status: 'playing' });
    const seq = new RhymeSequence({
      speak: (text, done) => { showBubble(text, 'happy'); return speech.speakAndWait(text, done); },
      wait: (ms, cb) => { const t = setTimeout(cb, ms); return () => clearTimeout(t); },
      startSong: ({ onEnd, onError }) => {
        brain.machine.enter('SINGING', performance.now(), { durationMs: null });
        particlesFn('notes', 8);
        audio.playRhyme(id, brain.machine.speed, onEnd, avatarRef.current);
        if (audio.rhymeError) onError(audio.rhymeError);
        else audio.rhymeClip.onFail = (m) => onError(m);
      },
      stopSong: () => audio.stopRhyme(),
      channel: audioChannel, // one sequence at a time: starting this one cancels any other that is still playing
    }, RHYME_SEQUENCE_CONFIG, r, {
      onState: (st) => {
        if (st === 'COMPLETED') {
          seqRef.current = null;
          brain.rhymeEnded(performance.now());
          setRhyme((x) => ({ ...x, status: 'idle' }));
          brain.machine.enter('CLAPPING', performance.now(), { durationMs: 1800 });
          say('Yay! We sang it!', 'excited');
          particlesFn('sparkles', 8);
        }
      },
      onError: (m) => {
        audio.rhymeError = m;
        brain.rhymeEnded(performance.now());
        setRhyme((x) => ({ ...x, status: 'idle' }));
        if (!brain.machine.isAsleep) brain.machine.enter('IDLE', performance.now(), {});
      },
    });
    seqRef.current = seq;
    seq.start();
  }, [brain, say, particlesFn, cancelRhymeSequence, showBubble]);
  const pauseRhyme = useCallback(() => { if (seqRef.current && seqRef.current.state !== 'SINGING') cancelRhymeSequence(); audio.pause(); setRhyme((r) => ({ ...r, status: r.id ? 'paused' : 'idle' })); brain.machine.enter('IDLE', performance.now(), {}); }, [brain]);
  const resumeRhyme = useCallback(() => { const id = rhymeRef.current.id; if (id && audio.getPlaybackState() === 'idle') { playRhyme(id); return; } audio.resume(); setRhyme((r) => ({ ...r, status: r.id ? 'playing' : 'idle' })); brain.machine.enter('SINGING', performance.now(), { durationMs: null }); }, [brain, playRhyme]);
  const restartRhyme = useCallback(() => { if (rhyme.id) playRhyme(rhyme.id); }, [rhyme.id, playRhyme]);
  const stopRhyme = useCallback(() => { cancelRhymeSequence(); audio.stopRhyme(); brain.rhymeEnded(performance.now()); setRhyme((r) => ({ ...r, status: 'idle' })); }, [brain]);

  /* ---------- navigation ---------- */
  const go = useCallback((s: Screen) => {
    if (s === screenRef.current) return;
    focusMem.remember(screenRef.current);
    // Leaving a screen stops its sounds, speech and animations.
    audioChannel.cancel('navigate'); // any animal / alphabet / rhyme sequence still running
    speech.cancel('navigate');
    jokeCancel.current?.(); jokeCancel.current = null; // a half-told joke never carries on elsewhere
    setBubble((b) => ({ text: '', key: b.key + 1 })); // the last screen's line must not stay on the next screen
    cancelRhymeSequence();
    audio.stopAll();
    musicHold.current = false;
    brain.rhymeEnded(performance.now());
    setRhyme((r) => ({ ...r, status: 'idle' }));
    if (!brain.machine.isAsleep) brain.machine.enter('IDLE', performance.now(), {});
    setChoices(null);
    voice.cancelListening();
    screenRef.current = s;
    brain.screen = s;
    setScreen(s);
    audio.playSound('select');
  }, [brain, focusMem]);

  /* ---------- apply a Reaction from the brain ---------- */
  const apply = useCallback((r: Reaction) => {
    // navigation first, so the destination screen exists before music starts
    const nav = r.effects.find((e): e is Extract<Effect, { type: 'navigate' }> => e.type === 'navigate');
    if (nav) go(nav.screen);
    for (const e of r.effects) {
      switch (e.type) {
        case 'sfx':
          // the joke is told first; then the buddy laughs out loud (a big "ha ha ha") once the line has really ended
          if (e.name === 'laughAfter') break; // the joke telling below handles the laugh
          audio.playSound(e.name); break;
        case 'stopAll': speech.cancel('stop'); audio.stopAll(); musicHold.current = false; setRhyme((x) => ({ ...x, status: 'idle' })); break;
        case 'tempo': audio.setTempo(e.speed); break;
        case 'particles': particlesFn(e.kind); break;
        case 'game': setGameKey((k) => k + 1); break;
        case 'rhyme':
          if (e.action === 'play' && e.id) playRhyme(e.id);
          if (e.action === 'pause') pauseRhyme();
          if (e.action === 'resume') resumeRhyme();
          break;
      }
    }
    jokeCancel.current?.(); jokeCancel.current = null;
    const q = r.intent === 'LAUGH' ? r.say.indexOf('?') : -1;
    if (q > 0 && q < r.say.length - 1) {
      // A joke: the question first, 2 seconds to think, then the answer, then the buddy laughs out loud.
      const question = r.say.slice(0, q + 1).trim();
      const answer = r.say.slice(q + 1).trim();
      let timer: ReturnType<typeof setTimeout> | undefined;
      let off2: (() => void) | undefined;
      say(question, r.mood);
      const off1 = speech.whenIdle(() => {
        timer = setTimeout(() => {
          say(answer, 'excited');
          off2 = speech.whenIdle(() => { say(LAUGH_LINE, 'excited'); brain.machine.enter('LAUGHING', performance.now(), { durationMs: 3600 }); particlesFn('sparkles'); }, 12000, 1200);
        }, 2000);
      }, 12000, 1200);
      jokeCancel.current = () => { off1(); off2?.(); if (timer) clearTimeout(timer); };
    } else say(r.say, r.mood);
    setChoices(r.choices && r.choices.length ? r.choices : null);
    setCharState(brain.machine.snapshot.state);
    setSpeedIndex(brain.machine.snapshot.speedIndex);
  }, [brain, go, particlesFn, playRhyme, pauseRhyme, resumeRhyme, say]);

  const hear = useCallback((text: string) => { audio.unlock(); apply(brain.hear(text, performance.now())); }, [apply, brain]);
  const act = useCallback((cmd: Omit<ParsedCommand, 'confidence'> & { confidence?: number }) => {
    audio.unlock();
    apply(brain.handle({ confidence: 1, ...cmd }, performance.now()));
  }, [apply, brain]);

  const anim = useCallback((s: CharacterState, durationMs?: number | null) => {
    brain.machine.enter(s, performance.now(), { durationMs });
    setCharState(s);
  }, [brain]);

  const earnScale = useCallback((color: string) => {
    setScales((x) => [...x, color].slice(-12));
    audio.playSound('fanfare');
    brain.machine.enter('CELEBRATING', performance.now(), { durationMs: 2500 });
    particlesFn('sparkles', 14);
  }, [brain, particlesFn]);

  const setSettings = useCallback((s: Settings) => {
    setSettingsState(s);
    audio.setEnabled(s.sound);
    audio.setVolume(s.volume);
    speech.enabled = s.sound && s.voice;
    speech.allowSystemTts = s.systemTts;
    speech.player.volume = VOICE_VOL[s.volume];
    if (s.windDownMin !== settings.windDownMin) { sessionStart.current = performance.now(); setBedtime(false); }
  }, [settings.windDownMin]);

  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  /** The remote's volume keys (and the Volume button): one step up or down, shown on screen. */
  const bumpVolume = useCallback((dir: number) => {
    const levels = ['low', 'medium', 'high'] as const;
    const cur = settingsRef.current;
    const i = Math.max(0, Math.min(levels.length - 1, levels.indexOf(cur.volume) + dir));
    if (levels[i] !== cur.volume) setSettings({ ...cur, sound: true, volume: levels[i] });
    audio.playSound('pop');
    setToast(`Volume: ${'🔈🔉🔊'[i]} ${levels[i][0].toUpperCase()}${levels[i].slice(1)}`);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 1800);
  }, [audio, setSettings]);

  const resetSession = useCallback(() => {
    audio.stopAll();
    brain.reset(performance.now());
    focusMem.clear();
    setScales([]);
    setBedtime(false);
    sessionStart.current = performance.now();
    say('Fresh start! Hello again!', 'happy');
  }, [brain, focusMem, say]);

  /* ---------- background music: exactly ONE track at a time ----------
     Home theme: only after the welcome line has finished, and only while Home is open.
     Alphabets: its own tune. Every other section: no background track (Dance, Sing, ... bring their own music).
     desiredTrack() is the single rule; it is applied on every screen change, when the welcome ends, when the app
     returns to the foreground and on every clock tick, so a late or blocked play() can never leak into a section. */
  const [welcomeDone, setWelcomeDone] = useState(false);
  const welcomeDoneRef = useRef(false);
  welcomeDoneRef.current = welcomeDone;
  const soundRef = useRef(settings.sound);
  soundRef.current = settings.sound;
  const desiredTrack = useCallback((): 'home' | 'alphabet' | null => {
    if (!soundRef.current) return null;
    const sc = screenRef.current;
    if (sc === 'home') return welcomeDoneRef.current ? 'home' : null;
    if (sc === 'alphabets') return 'alphabet';
    return null;
  }, []);
  const syncMusic = useCallback(() => {
    const t = desiredTrack();
    if (t) audio.startTheme(t); else audio.stopTheme();
  }, [desiredTrack]);
  const syncMusicRef = useRef(syncMusic);
  syncMusicRef.current = syncMusic;
  useEffect(() => { syncMusic(); }, [screen, settings.sound, welcomeDone, syncMusic]);

  /* ---------- clock: state machine ticks, dance music, wind-down ---------- */
  useEffect(() => {
    const id = setInterval(() => {
      const now = performance.now();
      const m = brain.machine;
      m.tick(now);
      if (audio.themePlaying) audio.enforceTheme(desiredTrack()); // never two musics at once
      const snap = m.snapshot;
      setCharState((c) => (c !== snap.state ? snap.state : c));
      setSpeedIndex((c) => (c !== snap.speedIndex ? snap.speedIndex : c));
      // The dance song plays for the whole time Dance Studio is open (every dance style, one loop) and never after leaving it.
      // Talk and Dance Maker keep their beat while something is dancing there; no other screen plays it.
      const sc = screenRef.current;
      const wantLoop = (sc === 'dance' || (sc === 'maker' && musicHold.current) || (sc === 'talk' && ((m.isDancing && !brain.rhymeActive) || musicHold.current))) && !audio.bandPlaying && settings.sound; // the Band has its own beat
      // Dance Maker plays its own song, at the speed the child picked there; everything else follows the character's speed.
      const tempo = musicTempo.current ?? m.speed;
      if (wantLoop && !audio.looping) audio.startLoop(tempo, sc === 'maker' ? 'maker' : snap.style);
      if (!wantLoop && audio.looping) audio.stopLoop();
      if (audio.looping) audio.setTempo(tempo);
      if (settings.windDownMin && !bedtime && now - sessionStart.current > settings.windDownMin * 60000) {
        setBedtime(true);
        go('home');
        audio.playSound('yawn');
        say(line('bedtime', Math.random), 'sleepy');
        setChoices(['SING', 'SLEEP']);
      }
    }, 100);
    return () => clearInterval(id);
  }, [brain, settings.windDownMin, bedtime, go, say, desiredTrack]);

  /* ---------- app hidden (Home button, screensaver, app switch): go quiet ---------- */
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState !== 'hidden') return;
      speech.cancel('hidden');
      audio.stopAll();
      musicHold.current = false;
      setRhyme((r) => ({ ...r, status: 'idle' }));
      if (!brain.machine.isAsleep) brain.machine.enter('IDLE', performance.now(), {});
    };
    const onShow = () => { if (document.visibilityState === 'visible') syncMusicRef.current(); };
    document.addEventListener('visibilitychange', onVis);
    document.addEventListener('visibilitychange', onShow);
    return () => { document.removeEventListener('visibilitychange', onVis); document.removeEventListener('visibilitychange', onShow); };
  }, [brain]);

  /* ---------- welcome (after the opening animation): the buddy speaks FIRST, the theme starts when it ends ---------- */
  useEffect(() => {
    if (intro) return;
    const tod = timeOfDay(false);
    let cancelWait: (() => void) | null = null;
    let gap: ReturnType<typeof setTimeout> | undefined;
    const t = setTimeout(() => {
      say(tod === 'morning' ? line('welcomeMorning', Math.random) : tod === 'night' ? line('welcomeNight', Math.random) : withBuddyName(line('welcome', Math.random), AVATARS[avatarRef.current].name), 'happy');
      brain.machine.enter('WAVING', performance.now(), { durationMs: 3000 });
      // whenIdle waits for the real end of the spoken line (7 s safety net; fires at once if the voice is off).
      // Then, one second later, the buddy turns to the choices and points at them; the music starts after that line.
      cancelWait = speech.whenIdle(() => {
        gap = setTimeout(() => {
          if (screenRef.current !== 'home') { setWelcomeDone(true); return; }
          say(PICK_LINE, 'happy');
          brain.machine.enter('POINTING', performance.now(), { durationMs: 3200 });
          cancelWait = speech.whenIdle(() => setWelcomeDone(true), 7000, 1200);
        }, 1000);
      }, 7000, 1200);
    }, 250);
    return () => { clearTimeout(t); if (gap) clearTimeout(gap); cancelWait?.(); };
  }, [brain, say, intro]);

  /* ---------- Home: until a section is picked, the buddy does a small move every few seconds, then stands still ---------- */
  useEffect(() => {
    if (screen !== 'home' || !welcomeDone) return;
    const moves: [CharacterState, number][] = [['WAVING', 2600], ['BOUNCING', 2200], ['CLAPPING', 2200], ['JUMPING', 1700], ['HANDSUP', 2300], ['SIDESTEPPING', 2900], ['SPINNING', 1500], [AVATARS[avatarRef.current].special.state, AVATARS[avatarRef.current].special.ms]];
    let i = Math.floor(Math.random() * moves.length);
    const t = setInterval(() => {
      const m = brain.machine;
      if (m.isAsleep || m.snapshot.state !== 'IDLE' || speech.queue.speaking) return; // never in the middle of something else
      i = (i + 1 + Math.floor(Math.random() * 3)) % moves.length;
      const [state, ms] = moves[i];
      m.enter(state, performance.now(), { durationMs: ms });
    }, 8500);
    return () => clearInterval(t);
  }, [screen, welcomeDone, brain]);

  /* ---------- opening animation: ~2.6 s, skippable with any remote key, never blocks later input ---------- */
  const endIntro = useCallback(() => { introRef.current = false; setIntro(false); }, []);
  useEffect(() => {
    const t = setTimeout(endIntro, prefersReduced ? 900 : 3400);
    return () => clearTimeout(t);
  }, [endIntro, prefersReduced]);

  /* ---------- focus restore after screen change ---------- */
  useLayoutEffect(() => {
    const raf = requestAnimationFrame(() => focusMem.restore(screen));
    return () => cancelAnimationFrame(raf);
  }, [screen, gameKey, focusMem]);
  useEffect(() => {
    const raf = requestAnimationFrame(() => ensureFocus());
    return () => cancelAnimationFrame(raf);
  });

  /* ---------- Back ---------- */
  const back = useCallback(() => {
    if (choices) { setChoices(null); return; }
    const parent = PARENT_OF[screenRef.current];
    if (parent !== 'exit') { go(parent); return; }
    const now = performance.now();
    if (now - lastBack.current < 2500) {
      say('Bye bye! See you soon!', 'happy');
      brain.machine.enter('WAVING', now, { durationMs: 1800 });
      const rn = (window as unknown as { ReactNativeWebView?: { postMessage: (s: string) => void } }).ReactNativeWebView;
      setTimeout(() => rn?.postMessage(JSON.stringify({ type: 'exit' })), 1200);
      return;
    }
    lastBack.current = now;
    setToast('Press Back again to leave');
    setTimeout(() => setToast(null), 2500);
  }, [brain, choices, go, say]);

  /* ---------- remote / keyboard ---------- */
  useEffect(() => {
    const stopHold = () => { if (holdTimer.current) clearInterval(holdTimer.current); holdTimer.current = null; setHold(0); };
    const down = (e: KeyboardEvent) => {
      audio.unlock();
      const k = toRemoteKey(e);
      if (!k) return;
      if (introRef.current) { e.preventDefault(); endIntro(); return; } // any key skips the intro
      const active = document.activeElement as HTMLElement | null;
      const typing = active?.tagName === 'INPUT';
      if (typing && (k === 'left' || k === 'right' || (k === 'back' && e.key === 'Backspace') || k === 'select')) return;
      e.preventDefault();
      if (k === 'up' || k === 'down' || k === 'left' || k === 'right') {
        const next = nextInDirection(active, k);
        if (next && next !== active) { next.focus({ preventScroll: true }); revealInScroller(next); audio.playSound('move'); }
        return;
      }
      if (k === 'volup' || k === 'voldown') { bumpVolume(k === 'volup' ? 1 : -1); return; }
      if (k === 'back') { back(); return; }
      if (k === 'playpause') {
        if (rhymeRef.current.status === 'playing') pauseRhyme();
        else if (rhymeRef.current.status === 'paused') resumeRhyme();
        return;
      }
      if (k === 'select' && active) {
        if (active.dataset.hold !== undefined) {
          if (e.repeat || holdTimer.current) return;
          holdStart.current = performance.now();
          holdTimer.current = setInterval(() => {
            const p = (performance.now() - holdStart.current) / HOLD_MS;
            setHold(Math.min(1, p));
            if (p >= 1) { stopHold(); go('parents'); }
          }, 50);
          return;
        }
        if (e.repeat) return;
        active.click();
      }
    };
    const up = (e: KeyboardEvent) => {
      if (toRemoteKey(e) === 'select' && holdTimer.current) {
        const held = performance.now() - holdStart.current;
        stopHold();
        if (held < HOLD_MS) { setToast('Settings: hold OK for 3 seconds'); setTimeout(() => setToast(null), 2500); }
      }
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); stopHold(); };
  }, [back, go, pauseRhyme, resumeRhyme, bumpVolume]);
  const rhymeRef = useRef(rhyme);
  rhymeRef.current = rhyme;

  const cancelJoke = useCallback(() => { jokeCancel.current?.(); jokeCancel.current = null; }, []);
  const ctx: Ctx = {
    brain, audio, settings, setSettings, hear, act, go, say, cancelJoke, sfx, anim, particles: particlesFn, earnScale,
    avatar, setAvatar, bubble: showBubble, rhyme, playRhyme, pauseRhyme, resumeRhyme, restartRhyme, stopRhyme, musicHold, musicTempo, breathStart, gameKey, bedtime,
    charState, speedIndex, reduced, scales, resetSession,
  };

  const tod = timeOfDay(bedtime);
  const ScreenEl = {
    home: Home, dance: Dance, rhymes: Rhymes, play: Play, shape: ShapeMatch, simon: SimonSays, animal: AnimalGuess,
    maker: DanceMaker, alphabets: Alphabets, band: Band, avatar: AvatarPicker, talk: Talk, help: Help, breathe: Breathe, parents: Parents, diagnostics: Diagnostics,
  }[screen];

  return (
    <div className="viewport">
      <div className={`stage tod-${tod}${reduced ? ' reduced' : ''}${intro ? ' intro-on' : ' intro-done'}`} style={{ transform: `translate(-50%, -50%) scale(${scale})` }} data-screen={screen} data-char={charState} data-speech={speechState}>
        <div className="sky">
          <div className="sun" />
          {tod === 'night' && <div className="stars">{Array.from({ length: 24 }, (_, i) => <i key={i} style={{ left: `${(i * 37) % 100}%`, top: `${(i * 23) % 45}%`, animationDelay: `${(i % 7) * 0.4}s` }} />)}</div>}
          <div className="cloud c1" /><div className="cloud c2" /><div className="cloud c3" />
          <div className="hill h1" /><div className="hill h2" />
        </div>

        {intro && (
          <div className="intro" aria-hidden="true">
            <div className="intro-rays" />
            <div className="intro-blocks">
              {[['A', '#E5533D'], ['B', '#F28C38'], ['C', '#F2B33D'], ['★', '#2BB3A3'], ['1', '#4FA3D9'], ['2', '#8E6CC9'], ['3', '#E85D8A'], ['♥', '#E5533D']].map(([g, c], i) => (
                <b key={i} style={{ ['--c' as string]: c, animationDelay: `${0.35 + i * 0.13}s, ${1.6 + i * 0.12}s` }}>{g}</b>
              ))}
            </div>
            <i className="intro-hop" />
            <div className="intro-logo">Zora Play</div>
            <IntroCast />
            <div className="intro-tag">{['Talk.', 'Play.', 'Dance.', 'Learn.'].map((w, i) => <span key={w} style={{ animationDelay: `${0.9 + i * 0.28}s` }}>{w}</span>)}</div>
            <div className="intro-confetti">
              {Array.from({ length: 30 }, (_, i) => (
                <i key={i} style={{ ['--a' as string]: `${(i * 12) % 360}deg`, ['--d' as string]: `${260 + (i * 47) % 300}px`, ['--c' as string]: ['#E5533D', '#FFD23F', '#4FA3D9', '#E85D8A', '#2BB3A3', '#8E6CC9', '#F28C38'][i % 7], animationDelay: `${0.55 + (i % 6) * 0.03}s` }} />
              ))}
            </div>
            <div className="intro-floaters">
              {['★', '♪', '♥', '✦', '♫', '★', '♥', '♪'].map((g, i) => <em key={i} style={{ left: `${5 + i * 12.5}%`, animationDelay: `${0.4 + (i % 4) * 0.35}s`, color: ['#FFD23F', '#8E6CC9', '#FF8FA3', '#BFF2EA'][i % 4] }}>{g}</em>)}
            </div>
            <i className="intro-shoot" />
            <div className="intro-load"><span>Getting ready</span><div className="intro-bar"><i /></div></div>
            <div className="intro-sparkles">{Array.from({ length: 10 }, (_, i) => <i key={i} style={{ left: `${8 + i * 9}%`, top: `${(i * 29) % 40 + 6}%`, animationDelay: `${0.3 + (i % 5) * 0.18}s` }} />)}</div>
          </div>
        )}
        <header className="topbar">
          <div className="logo"><PartyBalloons />Zora Play<small>Talk. Play. Dance. Learn.</small></div>
          <div className="shelf" aria-label={`${scales.length} shiny scales`}>
            {scales.length === 0 ? <span className="shelf-empty">Win games to collect shiny scales</span> : scales.map((c, i) => <Scale key={i} color={c} size={44} />)}
          </div>
          <Btn fkey="volume" className="grownups vol-btn" label={`Volume ${settings.volume}. Press to change`}
            onSelect={() => { const l = ['low', 'medium', 'high'] as const; setSettings({ ...settings, sound: true, volume: l[(l.indexOf(settings.volume) + 1) % 3] }); audio.playSound('pop'); }}>
            <span className="vol-bars">{[0, 1, 2].map((n) => <i key={n} className={n <= ['low', 'medium', 'high'].indexOf(settings.volume) ? 'on' : ''} style={{ height: 10 + n * 8 }} />)}</span>Volume
          </Btn>
          <Btn fkey="grownups" className="grownups" extra={{ 'data-hold': '' }} label="Settings: hold OK for 3 seconds" onSelect={() => { /* handled by hold */ }}>
            <span className="hold-ring" style={{ background: `conic-gradient(#FFD23F ${hold * 360}deg, transparent 0)` }} />Settings
          </Btn>
        </header>

        <div className="milo-area">
          {/* Milo asks with buttons inside his own speech bubble */}
          <div className="bubble-col">
            <div key={bubble.key} className={`bubble${bubble.text ? ' show' : ''}${choices ? ' has-choices' : ''}`}>
              {bubble.text}
              {settings.dev && voiceIssue && <span className="voice-issue" title={voiceIssue}>DEV · not voiced</span>}
            </div>
            {choices && (
              <div className="choices-pop" data-focus-trap="">
                {choices.map((c, i) => (
                  <Btn key={c} fkey={`choice-${c}`} autoFocus={i === 0} className="chip c-white" onSelect={() => { setChoices(null); act({ intent: c, params: {} }); }}>
                    {c === 'BREATHE' ? `${AVATARS[avatar].name}'s breath` : INTENT_PHRASE[c] ?? c}
                  </Btn>
                ))}
              </div>
            )}
          </div>
          <Buddy avatar={avatar} lowFps={intro} machine={brain.machine} mood={mood} talkingUntil={talkingUntil} reduced={reduced} breathStart={breathStart} />
          <div className="particles">
            {particles.map((p) => (
              <span key={p.id} className={`pt pt-${p.kind}`} style={{ left: p.x, top: p.y, width: p.s, height: p.s, animationDelay: `${p.d}s` }}><ParticleGlyph kind={p.kind} /></span>
            ))}
          </div>
          {voice.available && voice.getStatus() === 'LISTENING' && <div className="listening">Listening...</div>}
        </div>

        <main className="content" key={`${screen}-${gameKey}`}>
          <ScreenEl ctx={ctx} />
        </main>

        <footer className="hints">
          <span className="hint"><svg width="40" height="40" viewBox="0 0 40 40"><circle cx="20" cy="20" r="18" fill="none" stroke="currentColor" strokeWidth="3" /><path d="M20 6 L24 12 L16 12Z M20 34 L24 28 L16 28Z M6 20 L12 16 L12 24Z M34 20 L28 16 L28 24Z" fill="currentColor" /></svg>Move</span>
          <span className="hint"><span className="key">OK</span>Choose</span>
          <span className="hint"><span className="key">Back</span>{screen === 'home' ? 'Leave' : 'Go back'}</span>
          {rhyme.status !== 'idle' && <span className="hint"><span className="key">Play/Pause</span>Pause song</span>}
        </footer>

        {toast && <div className="toast">{toast}</div>}
      </div>
    </div>
  );
}
