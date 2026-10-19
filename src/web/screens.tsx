import React, { useEffect, useRef, useState } from 'react';
import {
  BREATH, MAKER_MOVES, MOVES, SHAPES, MAKER_LABEL, addMove, answerChoice, breathPhase, choreoReady, choreoTimeline,
  emptyChoreo, newChoiceGame, newSimon, nextChoiceRound, removeLast, shouldHint, simonNext, simonPress, simonStartAnswer, stepAt,
  type ChoiceGame, type Choreo, type MakerMove, type Move, type PlayableAnimal, type ShapeId, type SimonGame,
} from '../core/games.ts';
import { RHYMES } from '../core/rhymes.ts';
import { AVATARS } from '../core/avatars.ts';
import { TALK_CHATS, TALK_GREETING, TALK_NO_MIC, chatLines, type TalkChat } from '../core/talk.ts';
import { SPEED_STEPS } from '../core/character.ts';
import { line, SAY } from '../core/responses.ts';
import type { CharacterState } from '../core/types.ts';
import { RhymeArt } from './rhymeArt.tsx';
import { AnimalIcon, CtlIcon, Flame, MoveDemo, MoveIcon, SHAPE_COLOR, ShapeIcon, TileIcon } from './icons.tsx';
import { Btn, Dots, Panel, type Ctx } from './ui.tsx';
import { runAudioProbe, type ProbeResult } from './probe.ts';
import { readTtsVerified, speech, writeTtsVerified } from './speech.ts';
import { allPhrases } from '../core/phrases.ts';

export { Alphabets, AnimalGuess, AvatarPicker } from './screensNew.tsx';
export { Band } from './Band.tsx';

/** Injected by scripts/build.mjs; lets you confirm which build is running on the TV. */
const BUILD: { version: string; hash: string } =
  (typeof window !== 'undefined' && (window as unknown as { __MILO_BUILD__?: { version: string; hash: string } }).__MILO_BUILD__) || { version: 'dev', hash: 'local' };

const R = Math.random;
const later = (fn: () => void, ms: number, list: ReturnType<typeof setTimeout>[]) => { list.push(setTimeout(fn, ms)); };
/** Collect timeouts per screen and clear them on unmount (no stray timers). */
function useTimers() {
  const t = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => { t.current.forEach(clearTimeout); t.current = []; }, []);
  return t.current;
}

/* ============================== HOME ============================== */

export function Home({ ctx }: { ctx: Ctx }) {
  return (
    <Panel title="What shall we do?">
      {ctx.bedtime && <div className="banner">Wind-down time. Zora Play is getting sleepy. Try the Lantern Lullaby!</div>}
      <div className="tiles six">
        <Btn fkey="home-dance" autoFocus className="tile t-dance" onSelect={() => ctx.go('dance')}><TileIcon kind="dance" size={100} /><span>Dance</span></Btn>
        <Btn fkey="home-sing" className="tile t-sing" onSelect={() => ctx.go('rhymes')}><TileIcon kind="sing" size={100} /><span>Sing</span></Btn>
        <Btn fkey="home-play" className="tile t-play" dim={ctx.bedtime} onSelect={() => ctx.go('play')}><TileIcon kind="play" size={100} /><span>{ctx.bedtime ? 'After a sleep' : 'Play'}</span></Btn>
        <Btn fkey="home-abc" className="tile t-abc" dim={ctx.bedtime} onSelect={() => ctx.go('alphabets')}><TileIcon kind="alphabet" size={100} /><span>Alphabets</span></Btn>
        <Btn fkey="home-band" className="tile t-band" dim={ctx.bedtime} onSelect={() => ctx.go('band')}><TileIcon kind="band" size={100} /><span>Band</span></Btn>
        <Btn fkey="home-talk" className="tile t-talk" onSelect={() => ctx.go('talk')}><TileIcon kind="talk" size={100} /><span>Talk</span></Btn>
      </div>
      <div className="row small-row">
        <Btn fkey="home-avatar" label="My buddy" className="chip c-purple" onSelect={() => ctx.go('avatar')}><span className="emoji" aria-hidden="true">🧸</span>My buddy</Btn>
        <Btn fkey="home-help" className="chip c-blue" onSelect={() => ctx.go('help')}><TileIcon kind="help" size={44} />What can I do?</Btn>
        <Btn fkey="home-breathe" className="chip c-pink" onSelect={() => ctx.go('breathe')}><TileIcon kind="breathe" size={44} />Calm breaths</Btn>
      </div>
    </Panel>
  );
}

/* ============================== DANCE STUDIO ============================== */

export function Dance({ ctx }: { ctx: Ctx }) {
  useEffect(() => {
    if (ctx.charState !== 'DANCING' && ctx.charState !== 'ROBOT_DANCE') ctx.act({ intent: 'DANCE', params: {} });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const style = ctx.brain.machine.snapshot.style;
  const dancing = ctx.charState === 'DANCING' || ctx.charState === 'ROBOT_DANCE';
  const styles: [string, 'normal' | 'robot' | 'funny' | 'slow', string][] = [['Wiggle', 'normal', 'c-orange'], ['Robot', 'robot', 'c-teal'], ['Silly', 'funny', 'c-pink'], ['Slow', 'slow', 'c-purple']];
  return (
    <Panel title="Dance Studio" sub="Pick a dance, then make it faster or slower!" className="dance-panel">
      <div className="styles4">
        {styles.map(([label, s, c], i) => (
          <Btn key={s} fkey={`dance-${s}`} autoFocus={i === 0} className={`chip big ${c}${dancing && style === s ? ' active' : ''}`}
            onSelect={() => ctx.act({ intent: 'DANCE', params: { style: s } })}>{label}</Btn>
        ))}
      </div>
      <div className="speed">
        <Btn fkey="dance-slower" className="chip round c-white" label="Slower" onSelect={() => ctx.act({ intent: 'SLOWER', params: {} })}>−</Btn>
        <div className="flames" aria-label={`Speed ${ctx.speedIndex + 1} of ${SPEED_STEPS.length}`}>
          {SPEED_STEPS.map((_, i) => <Flame key={i} lit={i <= ctx.speedIndex} size={58 + i * 8} />)}
        </div>
        <Btn fkey="dance-faster" className="chip round c-white" label="Faster" onSelect={() => ctx.act({ intent: 'FASTER', params: {} })}>+</Btn>
      </div>
      <div className="row">
        <Btn fkey="dance-again" className="chip c-blue" onSelect={() => ctx.act({ intent: 'AGAIN', params: {} })}><CtlIcon kind="replay" />Again!</Btn>
        <Btn fkey="dance-stop" className="chip c-red" onSelect={() => ctx.act({ intent: 'STOP', params: {} })}><CtlIcon kind="stop" />Stop</Btn>
        <Btn fkey="dance-maker" className="chip c-teal" onSelect={() => ctx.go('maker')}><TileIcon kind="maker" size={44} />Dance Maker</Btn>
      </div>
    </Panel>
  );
}

/* ============================== RHYME ROOM ============================== */

function Karaoke({ ctx }: { ctx: Ctx }) {
  const [cur, setCur] = useState<{ line: number; word: number } | null>(null);
  const [line, setLine] = useState(-1);
  const [prog, setProg] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let raf = 0;
    let lastKey = '';
    let lastRun = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (now - lastRun < 45) return; // ~20 checks a second is plenty for lyrics, and leaves the CPU to the audio
      lastRun = now;
      const a = ctx.audio;
      // Lyrics follow the audio element's real position; nothing advances while it is paused.
      const c = a.rhymeCursor();
      const key = c ? `${c.line}:${c.word}` : '';
      if (key !== lastKey) { lastKey = key; setCur(c); setLine(a.rhymeLine()); }
      setProg(Math.round(a.rhymeProgress() * 200) / 200);
      setErr((e) => (e === a.rhymeError ? e : a.rhymeError));
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [ctx.audio]);
  const rhyme = RHYMES.find((r) => r.id === ctx.rhyme.id);
  if (!rhyme) return <div className="karaoke empty">Pick a song and I will sing it with you!</div>;
  // Long songs: show a window of four lines that follows the singing (the line before, the current one, then the next two).
  const SHOWN = 4;
  const first = Math.max(0, Math.min(rhyme.lines.length - SHOWN, line - 1));
  return (
    <div className="karaoke compact" style={{ borderColor: rhyme.color, background: `linear-gradient(135deg, #fff 60%, ${rhyme.color}22)` }}>
      <div className="k-title" style={{ color: rhyme.color }}>{rhyme.title}</div>
      {err && <div className="dev-error">Audio problem (settings): {err}</div>}
      {rhyme.lines.map((ln, li) => ({ ln, li })).slice(first, first + SHOWN).map(({ ln, li }) => (
        <div key={li} className={`k-line${line === li ? ' now' : ''}`}>
          {ln.words.map((w, wi) => {
            const sung = cur && (li < cur.line || (li === cur.line && wi <= cur.word));
            const now = cur && li === cur.line && wi === cur.word && ctx.rhyme.status === 'playing';
            return <span key={wi} className={`k-word${sung ? ' sung' : ''}${now ? ' bounce' : ''}`}>{w} </span>;
          })}
        </div>
      ))}
      <div className="k-bar"><div style={{ width: `${prog * 100}%`, background: rhyme.color }} /></div>
    </div>
  );
}

/** Scrolls a focused element into view inside its `.scroll-y` container (TV-safe, smooth). */
export function revealInScroller(el: HTMLElement | null) {
  const box = el?.closest<HTMLElement>('.scroll-y');
  if (!el || !box) return;
  const e = el.getBoundingClientRect(), b = box.getBoundingClientRect();
  const scale = b.height / box.clientHeight || 1; // the stage is CSS-scaled
  const margin = (Number(box.dataset.revealMargin) || 14) * scale; // a faded edge needs a bigger margin
  if (e.top < b.top + margin) box.scrollBy({ top: (e.top - b.top - margin) / scale, behavior: 'smooth' });
  else if (e.bottom > b.bottom - margin) box.scrollBy({ top: (e.bottom - b.bottom + margin) / scale, behavior: 'smooth' });
}

export function Rhymes({ ctx }: { ctx: Ctx }) {
  const st = ctx.rhyme.status;
  // Scroll cue: a visible track + thumb and a "more songs" pill, so it is obvious the list goes on below.
  const listRef = useRef<HTMLDivElement>(null);
  const [cue, setCue] = useState({ thumbTop: 0, thumbH: 100, above: 0, below: 0 });
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const update = () => {
      const max = el.scrollHeight - el.clientHeight;
      const h = max > 1 ? Math.max(18, (el.clientHeight / el.scrollHeight) * 100) : 100;
      const top = max > 1 ? (el.scrollTop / max) * (100 - h) : 0;
      const cards = Array.from(el.querySelectorAll<HTMLElement>('.rhyme-card'));
      const view = el.getBoundingClientRect();
      const below = cards.filter((c) => c.getBoundingClientRect().top > view.bottom - 24).length;
      const above = cards.filter((c) => c.getBoundingClientRect().bottom < view.top + 24).length;
      setCue((o) => (o.thumbTop === top && o.thumbH === h && o.above === above && o.below === below ? o : { thumbTop: top, thumbH: h, above, below }));
    };
    update();
    el.addEventListener('scroll', update, { passive: true });
    const t = setInterval(update, 400); // covers the smooth scroll and layout settling
    return () => { el.removeEventListener('scroll', update); clearInterval(t); };
  }, []);
  const missing = typeof window !== 'undefined' && !(window as unknown as { __ZORA_RHYMES__?: object }).__ZORA_RHYMES__;
  if (!RHYMES.length) return <Panel title="Rhyme Room"><div className="state-box">No songs yet. Ask a grown-up to add some!</div><div className="row"><Btn fkey="rhyme-back" autoFocus className="chip c-red" onSelect={() => ctx.go('home')}><CtlIcon kind="back" />Back</Btn></div></Panel>;
  return (
    <Panel title="Rhyme Room" sub="Pick a song and sing along!" className="rhyme-panel">
      {missing && <div className="dev-error">Song timings are missing from this build (settings: run npm run build).</div>}
      <div className="rhyme-shelf">
      {cue.above > 0 && <div className="more-pill up" aria-hidden="true">▲ {cue.above} more above</div>}
      <div className="scroll-y rhyme-scroll" data-reveal-margin="40" role="list" aria-label="Rhymes" ref={listRef}>
        <div className="rhyme-grid">
          {RHYMES.map((r, i) => {
            const active = ctx.rhyme.id === r.id;
            const playing = active && st === 'playing';
            return (
              <Btn key={r.id} fkey={`rhyme-${r.id}`} autoFocus={ctx.bedtime ? r.id === 'lullaby' : i === 0} label={`${r.title}. Play`}
                className={`rhyme-card${active ? ' active' : ''}${playing ? ' playing' : ''}`}
                style={{ ['--c' as string]: r.color, animationDelay: `${Math.min(i, 7) * 45}ms` }} onSelect={() => ctx.playRhyme(r.id)}>
                <span className="rc-art"><RhymeArt id={r.id} size={92} /></span>
                <span className="rc-text">
                  <span className="rc-name">{r.title}{ctx.bedtime && r.id === 'lullaby' ? ' · bedtime' : ''}</span>
                  <span className="rc-play">{playing ? <><i className="eq"><b /><b /><b /></i> Playing</> : active && st === 'paused' ? 'Paused' : '▶ Play'}</span>
                </span>
              </Btn>
            );
          })}
        </div>
      </div>
      <div className="shelf-track" aria-hidden="true"><i style={{ top: `${cue.thumbTop}%`, height: `${cue.thumbH}%` }} /></div>
      {cue.below > 0 && <div className="more-pill down" aria-hidden="true">▼ {cue.below} more {cue.below === 1 ? 'song' : 'songs'}</div>}
      </div>
      <Karaoke ctx={ctx} />
      <div className="row">
        <Btn fkey="rhyme-pause" className="chip c-orange" dim={st !== 'playing'} onSelect={() => st === 'playing' && ctx.pauseRhyme()}><CtlIcon kind="pause" />Pause</Btn>
        <Btn fkey="rhyme-resume" className="chip c-teal" dim={st !== 'paused'} onSelect={() => st === 'paused' && ctx.resumeRhyme()}><CtlIcon kind="play" />Resume</Btn>
        <Btn fkey="rhyme-restart" className="chip c-blue" dim={!ctx.rhyme.id} onSelect={ctx.restartRhyme}><CtlIcon kind="replay" />Replay</Btn>
        <Btn fkey="rhyme-back" className="chip c-red" onSelect={() => { ctx.stopRhyme(); ctx.go('home'); }}><CtlIcon kind="back" />Back</Btn>
      </div>
    </Panel>
  );
}

/* ============================== PLAY ROOM ============================== */

export function Play({ ctx }: { ctx: Ctx }) {
  const games: [string, string, 'shape' | 'simon' | 'animal' | 'maker', React.ReactNode, string][] = [
    ['Shape Match', 'Find the shape', 'shape', <ShapeIcon shape="star" size={110} color="#fff" />, 'c-orange'],
    [`${AVATARS[ctx.avatar].name} Says`, 'Copy my moves', 'simon', <MoveDemo move="wave" avatar={ctx.avatar} size={110} />, 'c-teal'],
    ['Animal Sounds', 'Who says that?', 'animal', <AnimalIcon animal="dog" size={110} />, 'c-blue'],
    ['Dance Maker', 'Make a dance', 'maker', <TileIcon kind="maker" size={110} />, 'c-purple'],
  ];
  return (
    <Panel title="Play Room" sub="Pick a game!">
      <div className="tiles">
        {games.map(([t, sub, id, icon, c], i) => (
          <Btn key={id} fkey={`play-${id}`} autoFocus={i === 0} className={`tile game ${c}`} dim={ctx.bedtime && id !== 'maker'} onSelect={() => ctx.go(id)}>
            {icon}<span>{t}</span><small>{sub}</small>
          </Btn>
        ))}
      </div>
    </Panel>
  );
}

function Finish({ ctx, score, total, onAgain, color }: { ctx: Ctx; score: number; total: number; onAgain: () => void; color: string }) {
  return (
    <div className="finish">
      <div className="finish-big">You did it!</div>
      <div className="finish-sub">{score} of {total} on the first try · you earned a shiny scale</div>
      <div className="finish-scale" style={{ background: color }} />
      <div className="row">
        <Btn fkey="finish-again" autoFocus className="chip big c-orange" onSelect={onAgain}><CtlIcon kind="replay" />Play again</Btn>
        <Btn fkey="finish-games" className="chip big c-blue" onSelect={() => ctx.go('play')}>Other games</Btn>
      </div>
    </div>
  );
}

/* ============================== SHAPE MATCH ============================== */

export function ShapeMatch({ ctx }: { ctx: Ctx }) {
  const timers = useTimers();
  const [g, setG] = useState<ChoiceGame<ShapeId>>(() => newChoiceGame(SHAPES, R));
  const [lock, setLock] = useState(false);
  const awarded = useRef(false);

  useEffect(() => { if (!g.finished) ctx.say(`Find the ${g.target}!`, 'happy'); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [g.round, g.finished]);

  const choose = (s: ShapeId) => {
    if (lock || g.finished) return;
    const next = answerChoice(g, s);
    setG(next);
    if (next.lastResult === 'correct') {
      setLock(true);
      ctx.sfx('correct'); ctx.anim('CELEBRATING', 1400); ctx.particles('sparkles', 10);
      ctx.say(line('correct', R), 'excited');
      later(() => {
        const n = nextChoiceRound(next, SHAPES, R);
        setG(n); setLock(false);
        if (n.finished && !awarded.current) { awarded.current = true; ctx.earnScale(SHAPE_COLOR.star); ctx.say(line('gameDone', R), 'excited'); }
      }, 1500, timers);
    } else {
      ctx.sfx('retry'); ctx.anim('SUPPORTIVE', 1500);
      ctx.say(`${line('goodTry', R)} Find the ${g.target}!`, 'caring');
    }
  };

  if (g.finished) return <Panel title="Shape Match"><Finish ctx={ctx} score={g.score} total={g.total} color={SHAPE_COLOR.star} onAgain={() => { awarded.current = false; setG(newChoiceGame(SHAPES, R)); }} /></Panel>;
  const hint = shouldHint(g);
  return (
    <Panel title="Shape Match">
      <div className="prompt" data-target={g.target}>Find the <b style={{ color: SHAPE_COLOR[g.target] }}>{g.target}</b>!</div>
      <div className="choices">
        {g.options.map((s, i) => (
          <Btn key={`${g.round}-${s}`} fkey={`shape-${i}`} autoFocus={i === 0} label={s}
            className={`choice${hint && s === g.target ? ' hint' : ''}${g.lastResult === 'correct' && s === g.target ? ' right' : ''}`}
            onSelect={() => choose(s)}>
            <ShapeIcon shape={s} size={200} />
          </Btn>
        ))}
      </div>
      <Dots total={g.total} done={g.round - 1} current={g.round - 1} />
    </Panel>
  );
}

/* ============================== ANIMAL SOUNDS ============================== */

/* ============================== MILO SAYS ============================== */

const MOVE_STATE: Record<Move, CharacterState> = { jump: 'JUMPING', wave: 'WAVING', clap: 'CLAPPING', spin: 'SPINNING' };
const SIMON_POSE: Record<Move, string> = { jump: 'jump', wave: 'wave', clap: 'handsup', spin: 'turn' };
const MOVE_SFX: Record<Move, string> = { jump: 'boing', wave: 'chime', clap: 'clap', spin: 'whoosh' };

export function SimonSays({ ctx }: { ctx: Ctx }) {
  const timers = useTimers();
  const [g, setG] = useState<SimonGame>(() => newSimon(R));
  const [showing, setShowing] = useState(-1);
  const awarded = useRef(false);

  // Watch phase: Zora Play performs the sequence, then it's the child's turn.
  useEffect(() => {
    if (g.phase !== 'watch') return;
    ctx.say(g.sequence.length > 1 ? 'Watch closely! Two moves!' : `Watch ${AVATARS[ctx.avatar].name}!`, 'happy');
    const gap = 1700;
    g.sequence.forEach((m, i) => later(() => { setShowing(i); ctx.anim(MOVE_STATE[m], 1500); ctx.sfx(MOVE_SFX[m]); }, 1200 + i * gap, timers));
    later(() => { setShowing(-1); setG((x) => simonStartAnswer(x)); ctx.say('Your turn! What did I do?', 'happy'); }, 1200 + g.sequence.length * gap, timers);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [g.phase, g.round, g.sequence]);

  const press = (m: Move) => {
    if (g.phase !== 'answer') return;
    const next = simonPress(g, m);
    setG(next);
    if (next.phase === 'answer') { ctx.sfx('pop'); return; }
    if (next.lastResult === 'correct') {
      ctx.sfx('correct'); ctx.anim('CELEBRATING', 1400); ctx.particles('sparkles', 10); ctx.say(line('correct', R), 'excited');
      later(() => {
        const n = simonNext(next, R);
        setG(n);
        if (n.phase === 'done' && !awarded.current) { awarded.current = true; ctx.earnScale('#2BB3A3'); ctx.say(line('gameDone', R), 'excited'); }
      }, 1600, timers);
    } else {
      ctx.sfx('retry'); ctx.anim('SUPPORTIVE', 1400); ctx.say('Good try! Watch again!', 'caring');
      later(() => setG(simonNext(next, R)), 1600, timers);
    }
  };

  if (g.phase === 'done') return <Panel title={`${AVATARS[ctx.avatar].name} Says`}><Finish ctx={ctx} score={g.score} total={g.total} color="#2BB3A3" onAgain={() => { awarded.current = false; setG(newSimon(R)); }} /></Panel>;
  const watching = g.phase !== 'answer';
  return (
    <Panel title={`${AVATARS[ctx.avatar].name} Says`}>
      <div className="prompt">{g.phase === 'watch' ? (showing >= 0 ? `Move ${showing + 1}...` : `Watch ${AVATARS[ctx.avatar].name}!`) : g.phase === 'answer' ? (g.sequence.length > 1 ? `Your turn! Move ${g.input.length + 1} of ${g.sequence.length}` : 'Your turn!') : g.lastResult === 'correct' ? 'Yes!' : 'Oops!'}</div>
      <div className="moves" data-seq={g.sequence.join(',')} data-phase={g.phase}>
        {MOVES.map((m, i) => (
          <Btn key={m} fkey={`simon-${m}`} autoFocus={i === 0} dim={watching} className="move-btn" label={m} onSelect={() => press(m)}>
            <MoveDemo move={SIMON_POSE[m]} avatar={ctx.avatar} size={150} /><span>{m}</span>
          </Btn>
        ))}
      </div>
      <div className="row">
        <Btn fkey="simon-replay" className="chip c-white" dim={g.phase !== 'answer'} onSelect={() => setG({ ...g, phase: 'watch', input: [] })}><CtlIcon kind="replay" />Show me again</Btn>
      </div>
      <Dots total={g.total} done={g.round - 1} current={g.round - 1} />
    </Panel>
  );
}

/* ============================== DANCE MAKER ============================== */

const MAKER_STATE: Record<MakerMove, [CharacterState, string]> = {
  wave: ['WAVING', 'normal'], jump: ['JUMPING', 'normal'], sidestep: ['SIDESTEPPING', 'normal'],
  turn: ['SPINNING', 'normal'], handsup: ['HANDSUP', 'normal'], bounce: ['BOUNCING', 'normal'],
};

export function DanceMaker({ ctx }: { ctx: Ctx }) {
  const [c, setC] = useState<Choreo>(emptyChoreo);
  const [playing, setPlaying] = useState(false);
  const [speedI, setSpeedI] = useState(2);
  const [cur, setCur] = useState(-1);

  useEffect(() => { ctx.say('Pick 4 moves, then press Go!', 'happy'); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!playing) return;
    const tl = choreoTimeline(c, SPEED_STEPS[speedI]);
    const start = performance.now();
    let lastSlot = -2;
    ctx.musicHold.current = true; // the song starts together with the dance and loops until Stop or leaving
    ctx.musicTempo.current = SPEED_STEPS[speedI]; // and follows the dance speed
    const id = setInterval(() => {
      const st = stepAt(tl, performance.now() - start);
      const slot = st ? st.slot : -1;
      if (st && slot !== lastSlot) {
        lastSlot = slot;
        setCur(slot);
        const [state, style] = MAKER_STATE[st.move];
        ctx.brain.machine.enter(state, performance.now(), { durationMs: st.durMs, style: style as 'normal' | 'robot' });
      }
    }, 50);
    return () => { clearInterval(id); ctx.musicHold.current = false; ctx.musicTempo.current = null; setCur(-1); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, c, speedI]);

  useEffect(() => () => { ctx.musicHold.current = false; ctx.musicTempo.current = null; }, [ctx.musicHold, ctx.musicTempo]);

  const toggle = () => {
    if (!choreoReady(c)) { ctx.say('Pick a move first!', 'puzzled'); return; }
    if (playing) { setPlaying(false); ctx.act({ intent: 'STOP', params: {} }); }
    else { setPlaying(true); ctx.say('Here comes YOUR dance!', 'excited'); ctx.particles('notes', 6); }
  };

  return (
    <Panel title="Dance Maker" sub="You are the choreographer!" className="maker-panel">
      <div className="slots">
        {c.map((m, i) => (
          <div key={i} className={`slot${m ? ' filled' : ''}${cur === i ? ' now' : ''}`}>{m ? <><MoveDemo move={m} avatar={ctx.avatar} size={92} /><small>{MAKER_LABEL[m]}</small></> : <span>{i + 1}</span>}</div>
        ))}
      </div>
      <div className="palette">
        {MAKER_MOVES.map((m, i) => (
          <Btn key={m} fkey={`maker-${m}`} autoFocus={i === 0} className="move-btn small" label={`${MAKER_LABEL[m]}: add to my dance`}
            onSelect={() => { setC((x) => addMove(x, m)); ctx.sfx('pop'); ctx.brain.machine.enter(MAKER_STATE[m][0], performance.now(), { durationMs: 1400 }); }}>
            <MoveDemo move={m} avatar={ctx.avatar} size={104} /><span>{MAKER_LABEL[m]}</span>
          </Btn>
        ))}
      </div>
      <div className="row maker-controls">
        <Btn fkey="maker-go" className={`chip big ${playing ? 'c-red' : 'c-orange'}`} onSelect={toggle}><CtlIcon kind={playing ? 'stop' : 'play'} />{playing ? 'Stop' : 'Go!'}</Btn>
        <Btn fkey="maker-undo" className="chip c-white" dim={!choreoReady(c)} onSelect={() => setC(removeLast)}><CtlIcon kind="undo" />Undo</Btn>
        <div className="speed compact">
          <Btn fkey="maker-slower" className="chip round c-white" label="Slower" onSelect={() => setSpeedI((s) => Math.max(0, s - 1))}>−</Btn>
          <div className="flames">{SPEED_STEPS.map((_, i) => <Flame key={i} lit={i <= speedI} size={26 + i * 4} />)}</div>
          <Btn fkey="maker-faster" className="chip round c-white" label="Faster" onSelect={() => setSpeedI((s) => Math.min(SPEED_STEPS.length - 1, s + 1))}>+</Btn>
        </div>
      </div>
    </Panel>
  );
}

/* ============================== TALK WHEEL ============================== */

const TALK: [string, string][] = [
  ['Dance!', 'c-orange'], ['Faster!', 'c-red'], ['Slower!', 'c-purple'], ['Again!', 'c-blue'],
  ['Stop!', 'c-red'], ['Jump!', 'c-teal'], ['Spin around!', 'c-teal'], ['Sing a song', 'c-purple'],
  ['Tell me a joke', 'c-pink'], ['Surprise me!', 'c-orange'], ["I'm sad", 'c-blue'], ['Say hello', 'c-pink'],
  ['Go to sleep', 'c-purple'], ['Wake up!', 'c-orange'], ["Let's play!", 'c-teal'], ['What can you do?', 'c-blue'],
];

export function Talk({ ctx }: { ctx: Ctx }) {
  const [said, setSaid] = useState<string | null>(null);
  const [dev, setDev] = useState('');
  const timers = useTimers();
  const wait = useRef<(() => void) | null>(null);
  useEffect(() => {
    ctx.say(TALK_GREETING.join(' '), 'happy');
    ctx.anim('WAVING', 1400);
    // Leaving Talk (or picking another chat) must not leave a voice line or a pending action behind.
    return () => { wait.current?.(); wait.current = null; speech.player.gapMs = 0; speech.cancel('leave talk'); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // One rule for every Talk press: whatever the last press left pending (follow-up action, joke, counting pace) dies first.
  const stopPending = () => {
    wait.current?.(); wait.current = null;
    timers.forEach(clearTimeout); timers.length = 0;
    speech.player.gapMs = 0;
    ctx.cancelJoke();
  };
  const chat = (c: TalkChat) => {
    stopPending();
    setSaid(c.prompt);
    ctx.anim(c.state, 3500);
    ctx.particles(c.particles, 6);
    speech.player.gapMs = c.gapMs ?? 0; // counting keeps a slow, even beat between the numbers
    ctx.say(chatLines(c, ctx.avatar).join(' '), c.mood); // one utterance: the clips play in order, never overlapping
    // Wait for the REAL end of the line (the grace covers the moment before the first clip starts), so a follow-up
    // such as the dance never cuts the sentence short.
    const then = c.then;
    wait.current = speech.whenIdle(() => {
      wait.current = null;
      speech.player.gapMs = 0;
      if (then) later(() => { if (then.go) ctx.go(then.go); else if (then.hear) ctx.hear(then.hear); }, 500, timers);
    }, 20000, 1500);
  };
  return (
    <Panel title={`Talk to ${AVATARS[ctx.avatar].name}`} sub="Pick what you want to say!">
      <div className="chat-row">
        {TALK_CHATS.map((c, i) => (
          <Btn key={c.id} fkey={`chat-${c.id}`} autoFocus={i === 0} className="talk-chip chat c-pink" onSelect={() => chat(c)}>{c.prompt}</Btn>
        ))}
      </div>
      <div className="talk-grid">
        {TALK.map(([t, c], i) => (
          <Btn key={t} fkey={`talk-${i}`} className={`talk-chip ${c}`} onSelect={() => { stopPending(); setSaid(t); ctx.hear(t); }}>{t}</Btn>
        ))}
      </div>
      <div className="you-said">{said ? <>You picked: <b>"{said}"</b></> : <small>{TALK_NO_MIC}</small>}</div>
      {!ctx.settings.voice && <div className="dev-error">Zora Play's voice is switched off in Settings, so you will only see the words.</div>}
      {ctx.settings.dev && (
        <form className="dev" onSubmit={(e) => { e.preventDefault(); if (dev.trim()) { stopPending(); setSaid(dev.trim()); ctx.hear(dev); setDev(''); } }}>
          <span className="dev-tag">DEV ONLY · typed text, not voice</span>
          <input data-focusable="" data-fkey="talk-dev" value={dev} maxLength={80} onChange={(e) => setDev(e.target.value)} placeholder="type a command, press Enter" />
        </form>
      )}
    </Panel>
  );
}

/* ============================== HELP ============================== */

export function Help({ ctx }: { ctx: Ctx }) {
  const groups: [string, string[]][] = [
    ['Move', ['Dance!', 'Dance like a robot', 'Jump', 'Wave', 'Clap', 'Spin']],
    ['Then say', ['Faster!', 'Slower!', 'Again!', 'Stop!']],
    ['Music & games', ['Sing a song', "Let's play", 'Guess the animal', 'Surprise me!']],
    ['Feelings', ["I'm sad", "I'm scared", `${AVATARS[ctx.avatar].name}'s breath`, 'Go to sleep']],
  ];
  return (
    <Panel title="What can Zora Play do?" sub={SAY.help[0]} className="help-panel">
      <div className="help-grid">
        {groups.map(([h, items]) => (
          <div key={h} className="help-card"><h3>{h}</h3>{items.map((it) => <div key={it} className="help-item">"{it}"</div>)}</div>
        ))}
      </div>
      <div className="row">
        <Btn fkey="help-talk" autoFocus className="chip big c-pink" onSelect={() => ctx.go('talk')}>Try it in Talk</Btn>
        <Btn fkey="help-home" className="chip big c-blue" onSelect={() => ctx.go('home')}><CtlIcon kind="back" />Back home</Btn>
      </div>
    </Panel>
  );
}

/* ============================== DRAGON BREATH ============================== */

export function Breathe({ ctx }: { ctx: Ctx }) {
  const timers = useTimers();
  const [ph, setPh] = useState(breathPhase(0));
  const [runId, setRunId] = useState(0);
  useEffect(() => {
    const start = performance.now();
    ctx.breathStart.current = start;
    const total = (BREATH.inMs + BREATH.outMs) * BREATH.cycles;
    ctx.anim('BREATHING', total + 300);
    let last = '';
    const id = setInterval(() => {
      const p = breathPhase(performance.now() - start);
      setPh(p);
      const key = `${p.phase}${p.cycle}`;
      if (key !== last) {
        last = key;
        if (p.phase === 'in') ctx.sfx('breathIn');
        if (p.phase === 'out') { ctx.sfx('breathOut'); later(() => ctx.particles('bubbles', 7), 400, timers); }
        if (p.phase === 'done') { ctx.anim('HAPPY', 1800); ctx.say('Ahh. All calm. You did great!', 'caring'); ctx.particles('hearts', 6); }
      }
    }, 60);
    ctx.say('Breathe in through your nose... and blow out slowly.', 'caring');
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId]);
  const scale = ph.phase === 'in' ? 0.55 + ph.progress * 0.45 : ph.phase === 'out' ? 1 - ph.progress * 0.45 : 0.55;
  return (
    <Panel title={`${AVATARS[ctx.avatar].name}'s Breath`} sub={`Breathe with ${AVATARS[ctx.avatar].name}`}>
      <div className="breath">
        <div className="breath-ring" style={{ transform: `scale(${scale})` }} />
        <div className="breath-text">{ph.phase === 'in' ? 'Breathe in...' : ph.phase === 'out' ? 'Blow out slowly...' : 'All calm!'}</div>
      </div>
      <Dots total={BREATH.cycles} done={ph.phase === 'done' ? BREATH.cycles : ph.cycle - 1} current={ph.cycle - 1} />
      <div className="row">
        <Btn fkey="breathe-again" className="chip c-pink" dim={ph.phase !== 'done'} onSelect={() => setRunId((x) => x + 1)}><CtlIcon kind="replay" />Again</Btn>
        <Btn fkey="breathe-home" autoFocus className="chip c-blue" onSelect={() => ctx.go('home')}><CtlIcon kind="home" />Home</Btn>
      </div>
    </Panel>
  );
}

/* ============================== GROWN-UPS ============================== */

export function Parents({ ctx }: { ctx: Ctx }) {
  const s = ctx.settings;
  const set = (patch: Partial<typeof s>) => ctx.setSettings({ ...s, ...patch });
  const cycle = <T,>(arr: readonly T[], v: T) => arr[(arr.indexOf(v) + 1) % arr.length];
  const rows: [string, string, () => void][] = [
    ['Sound', s.sound ? 'On' : 'Off', () => set({ sound: !s.sound })],
    ['Volume', s.volume, () => set({ volume: cycle(['low', 'medium', 'high'] as const, s.volume) })],
    ['Zora Play speaks', s.voice ? 'On' : 'Off', () => set({ voice: !s.voice })],
    // only offered once the device voice has been verified (or in developer mode): a row that does nothing is confusing
    ...(s.dev || readTtsVerified() ? [['Device voice', !readTtsVerified() ? 'Not verified' : s.systemTts ? 'On' : 'Off', () => { if (readTtsVerified()) set({ systemTts: !s.systemTts }); else ctx.say(SAY.sayWhat[0]); }] as [string, string, () => void]] : []),
    ['Motion', s.motion === 'full' ? 'Full' : 'Gentle', () => set({ motion: s.motion === 'full' ? 'gentle' : 'full' })],
    ['Wind-down timer', s.windDownMin ? `${s.windDownMin} min` : 'Off', () => set({ windDownMin: cycle([0, 15, 30, 45] as const, s.windDownMin) })],
  ];
  return (
    <Panel title="Settings" className="parents">
      <div className="parents-grid">
        <div className="settings">
          {rows.map(([label, val, fn], i) => (
            <Btn key={label} fkey={`set-${i}`} autoFocus={i === 0} className="setting" onSelect={fn}><span>{label}</span><b>{val}</b></Btn>
          ))}
          {s.dev && <Btn fkey="set-diag" className="setting" onSelect={() => ctx.go('diagnostics')}><span>Audio diagnostics</span><b>Open</b></Btn>}
          <Btn fkey="set-reset" className="setting warn" onSelect={ctx.resetSession}><span>Reset this session</span><b>Reset</b></Btn>
          <Btn fkey="set-done" className="setting done" onSelect={() => ctx.go('home')}><span>Back to Zora Play</span><b>Done</b></Btn>
        </div>
        <div className="privacy">
          <h3>Privacy & safety</h3>
          <ul>
            <li>No account, no ads, no analytics, no chat with strangers, no web browsing.</li>
            <li>Works fully offline. Nothing is sent anywhere.</li>
            <li>Zora Play only says lines from a fixed, reviewed list.</li>
            <li>If a child shares a name, address or number, Zora Play says it's private. Nothing is kept.</li>
            <li>Almost nothing is saved. Settings and shiny scales reset when the app closes. Only your chosen buddy is remembered on this TV.</li>
          </ul>
          <h3>Voice</h3>
          <p>Talking out loud isn't available on this device yet (no supported microphone access for apps). Children use the <b>Talk</b> buttons, which use the same understanding engine.</p>
          <h3>Credits</h3>
          <p>Songs and dance music made with Suno. Lyrics written with ChatGPT.</p>
          <h3>About this gate</h3>
          <p>"Hold OK for 3 seconds" keeps little hands from wandering in by accident. It is not a lock.</p>
          <p className="muted">Sound status: {ctx.audio.available ? 'available' : 'not available on this device (visual-only mode)'}</p>
          <p className="muted build-stamp">Build {BUILD.version} · {BUILD.hash}</p>
        </div>
      </div>
    </Panel>
  );
}

/* ============================== AUDIO DIAGNOSTICS (dev) ============================== */

const STATUS_CLASS: Record<string, string> = { pass: 'ok', fail: 'bad', unsupported: 'bad', skipped: 'meh' };

export function Diagnostics({ ctx }: { ctx: Ctx }) {
  const [results, setResults] = useState<ProbeResult[] | null>(null);
  const [running, setRunning] = useState(false);
  const [tick, setTick] = useState(0);
  const phrases = allPhrases();
  const cov = speech.coverage(speech.character, phrases.map((p) => p.id));
  useEffect(() => speech.queue.onChange(() => setTick((t) => t + 1)), []);
  const start = async () => {
    if (running) return;
    ctx.audio.stopAll(); speech.cancel('diagnostics');
    setRunning(true); setResults([]);
    const r = await runAudioProbe((partial) => setResults(partial));
    writeTtsVerified(r.find((x) => x.id === 'tts')?.status === 'pass');
    setRunning(false);
  };
  const recent = speech.queue.history.slice(-5).reverse();
  void tick;
  const last = recent[0];
  return (
    <Panel title="Audio diagnostics" className="diag">
      <div className="row">
        <Btn fkey="diag-run" autoFocus className="chip c-orange" onSelect={start}>{running ? 'Running...' : results ? 'Run again' : 'Run audio tests'}</Btn>
        <Btn fkey="diag-say" className="chip c-blue" onSelect={() => ctx.say(SAY.greet[0])}>Test a line</Btn>
        <div className="diag-chips">
          <span className={cov.have.length === phrases.length ? 'ok' : 'bad'}>Voice clips ({speech.character}): <b>{cov.have.length}/{phrases.length}</b></span>
          <span className={last?.state === 'completed' || last?.state === 'speaking' ? 'ok' : last?.state === 'failed' ? 'bad' : ''}>
            Last line: <b>{last ? last.state : 'none'}</b>
          </span>
        </div>
      </div>
      {last?.reason && <div className="diag-note">Last line: "{last.text.slice(0, 48)}" · {last.reason.slice(0, 110)}</div>}
      <div className="diag-results">
        {(results ?? []).map((r) => (
          <div key={r.id} className={`diag-row ${STATUS_CLASS[r.status]}`}><b>{r.status.toUpperCase()}</b> {r.label}<small>{r.detail} · {r.ms} ms</small></div>
        ))}
        {!results && <div className="diag-row meh">Press "Run audio tests" (about 10 s). Listen while it runs: a voice, four short beeps, then a higher beep.</div>}
      </div>
      <p className="diag-foot">Passing = the runtime reported real playback. Also listened? Report what you heard. Missing clip ids: npm run voice:report</p>
    </Panel>
  );
}
