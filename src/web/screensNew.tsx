// Alphabets (A-Z) and Avatar selection screens.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ALPHABET, ALPHABET_DONE, ALPHABET_INTRO, ALPHABET_SPEEDS, DEFAULT_ALPHABET_SPEED, alphabetSteps } from '../core/alphabet.ts';
import { animalQuestionSteps } from '../core/animalSteps.ts';
import { AVATAR_IDS, AVATARS, type AvatarId } from '../core/avatars.ts';
import { StepSequence } from '../core/stepSequence.ts';
import { AvatarFace, CtlIcon, Flame } from './icons.tsx';
import { LetterArt } from './alphabetArt.tsx';
import { speech } from './speech.ts';
import { audioChannel } from './audioFlow.ts';
import { ANIMALS, ANIMAL_CLUE, ANIMAL_CONFIG, ANIMAL_QUESTION, ANIMAL_TRY_AGAIN, animalCorrect, animalFact, answerChoice, newChoiceGame, nextChoiceRound, shouldHint, type ChoiceGame, type PlayableAnimal } from '../core/games.ts';
import { line } from '../core/responses.ts';
import { AnimalIcon } from './icons.tsx';
import { Btn, Dots, Panel, type Ctx } from './ui.tsx';

/** Real speech + timers; every spoken line is also shown in the speech bubble. */
const depsFor = (ctx: Ctx) => ({
  speak: (text: string, done: (r: 'completed' | 'failed' | 'cancelled', reason?: string) => void) => { ctx.bubble(text, 'happy'); return speech.speakAndWait(text, done); },
  wait: (ms: number, cb: () => void) => { const t = setTimeout(cb, ms); return () => clearTimeout(t); },
  channel: audioChannel,
});

export function Alphabets({ ctx }: { ctx: Ctx }) {
  const [idx, setIdx] = useState<number | null>(null); // null = intro still being spoken
  const [paused, setPaused] = useState(false);
  const [finished, setFinished] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [speedI, setSpeedI] = useState(DEFAULT_ALPHABET_SPEED);
  const seq = useRef<StepSequence | null>(null);
  const idxRef = useRef<number | null>(null);
  const speedRef = useRef(speedI);
  speedRef.current = speedI;

  // Speed: how long each pause is, how fast the buddy talks and how fast the background tune plays.
  useEffect(() => {
    const sp = ALPHABET_SPEEDS[speedI];
    speech.player.rate = sp.rate;
    ctx.audio.setThemeRate(sp.rate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speedI]);

  const start = useCallback((from: number, withIntro: boolean) => {
    seq.current?.cancel(false);
    setPaused(false); setFinished(false); setErr(null);
    if (withIntro) { setIdx(null); idxRef.current = null; }
    const s = new StepSequence(depsFor(ctx), {
      onError: (m) => { setErr(m); },
    });
    seq.current = s;
    s.run(alphabetSteps(from, withIntro, (i) => { idxRef.current = i; setIdx(i); ctx.anim('SPEAKING', 1600); ctx.particles('sparkles', 3); }, () => { setFinished(true); ctx.anim('CELEBRATING', 2500); ctx.particles('sparkles', 10); }, () => ALPHABET_SPEEDS[speedRef.current].pause));
  }, [ctx]);

  useEffect(() => {
    ctx.anim('WAVING', 1500);
    start(0, true);
    return () => { seq.current?.cancel(false); seq.current = null; speech.cancel('leave alphabets'); speech.player.rate = 1; ctx.audio.setThemeRate(1); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cur = idx === null ? null : ALPHABET[idx];
  const go = (i: number) => { const n = Math.max(0, Math.min(ALPHABET.length - 1, i)); start(n, false); };
  const pause = () => { seq.current?.cancel(false); speech.cancel('pause'); setPaused(true); };
  const resume = () => start(idxRef.current ?? 0, idxRef.current === null);
  const sp = ALPHABET_SPEEDS[speedI];

  return (
    <Panel title="Alphabets" sub={cur ? (ALPHABET.length - 1 - idx! === 0 ? 'The last letter!' : `${ALPHABET.length - 1 - idx!} more ${ALPHABET.length - 1 - idx! === 1 ? 'letter' : 'letters'} to go!`) : finished ? 'You learned all 26 letters!' : "Let's learn the alphabet!"} className="abc-panel">
      <div className={`abc-card${cur ? ' has-letter' : ''}`} key={cur?.letter ?? 'intro'}>
        {cur ? (
          <>
            <div className="abc-big"><span>{cur.letter}</span><small>{cur.lower}</small></div>
            <div className="abc-art"><LetterArt art={cur.art} size={170} /></div>
            <div className="abc-phrase">{cur.phrase.replace(/\.$/, '')}</div>
          </>
        ) : (
          <div className="abc-intro">{finished ? ALPHABET_DONE : ALPHABET_INTRO}</div>
        )}
      </div>
      {finished && cur && <div className="abc-done">{ALPHABET_DONE}</div>}
      {err && <div className="dev-error">Audio problem (settings): {err}</div>}
      <div className="abc-controls">
        <Btn fkey="abc-prev" className="chip c-blue" dim={idx === null || idx === 0} onSelect={() => idx !== null && go(idx - 1)}>Previous</Btn>
        <Btn fkey="abc-replay" autoFocus className="chip c-orange" onSelect={() => (finished ? start(0, true) : go(idx ?? 0))}>Replay</Btn>
        {paused ? <Btn fkey="abc-resume" className="chip c-teal" onSelect={resume}>Resume</Btn> : <Btn fkey="abc-pause" className="chip c-purple" dim={finished} onSelect={pause}>Pause</Btn>}
        <Btn fkey="abc-next" className="chip c-blue" dim={idx === null || idx >= ALPHABET.length - 1} onSelect={() => idx !== null && go(idx + 1)}>Next</Btn>
        <Btn fkey="abc-back" className="chip c-red" onSelect={() => ctx.go('home')}>Back</Btn>
      </div>
      <div className="abc-speed" role="group" aria-label={`Speed: ${sp.label}`}>
        <Btn fkey="abc-slower" className="chip round c-white" label="Slower" dim={speedI === 0} onSelect={() => { setSpeedI((v) => Math.max(0, v - 1)); ctx.sfx('pop'); }}>−</Btn>
        <div className="abc-speed-mid"><span className="abc-speed-label">Speed · {sp.label}</span><div className="flames">{ALPHABET_SPEEDS.map((_, i) => <Flame key={i} lit={i <= speedI} size={26 + i * 6} />)}</div></div>
        <Btn fkey="abc-faster" className="chip round c-white" label="Faster" dim={speedI === ALPHABET_SPEEDS.length - 1} onSelect={() => { setSpeedI((v) => Math.min(ALPHABET_SPEEDS.length - 1, v + 1)); ctx.sfx('pop'); }}>+</Btn>
      </div>
      <div className="abc-grid" role="group" aria-label="Pick a letter">
        {ALPHABET.map((l, i) => (
          <Btn key={l.letter} fkey={`abc-${l.letter}`} label={`Letter ${l.letter}`} className={`abc-key${idx === i ? ' sel' : ''}`} onSelect={() => go(i)}>{l.letter}</Btn>
        ))}
      </div>
    </Panel>
  );
}

export function AvatarPicker({ ctx }: { ctx: Ctx }) {
  const [just, setJust] = useState<AvatarId | null>(null);
  useEffect(() => { ctx.anim('WAVING', 1200); return () => { speech.cancel('leave avatars'); }; /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);
  const pick = (id: AvatarId) => {
    ctx.setAvatar(id);
    setJust(id);
    ctx.say(AVATARS[id].intro, 'excited'); // spoken in the newly chosen buddy's own voice
    ctx.anim(AVATARS[id].special.state, AVATARS[id].special.ms); // every buddy has its own special move (Zora flies a loop...)
    ctx.particles('hearts', 6);
    ctx.sfx('correct');
  };
  return (
    <Panel title="🧸 My buddy" sub="Pick your buddy. Each one has its own name and voice!">
      <div className="avatar-grid">
        {AVATAR_IDS.map((id, i) => (
          <Btn key={id} fkey={`avatar-${id}`} autoFocus={ctx.avatar === id || (i === 0 && !AVATAR_IDS.includes(ctx.avatar))} label={`${AVATARS[id].name} the ${AVATARS[id].species}`}
            className={`avatar-card${ctx.avatar === id ? ' chosen' : ''}`} onSelect={() => pick(id)}>
            <AvatarFace avatar={id} size={104} />
            <span className="avatar-name">{AVATARS[id].name}</span>
            <small className="avatar-species">{AVATARS[id].species}</small>
            <small>{ctx.avatar === id ? (just === id ? 'Chosen!' : 'Your buddy') : AVATARS[id].tagline}</small>
          </Btn>
        ))}
      </div>
      <div className="row"><Btn fkey="avatar-back" className="chip c-blue" onSelect={() => ctx.go('home')}><CtlIcon kind="back" />Back</Btn></div>
    </Panel>
  );
}

const R = Math.random;

export function AnimalGuess({ ctx }: { ctx: Ctx }) {
  const [g, setG] = useState<ChoiceGame<PlayableAnimal>>(() => newChoiceGame(ANIMALS, R, 5, 4));
  const [ready, setReady] = useState(false); // options shown and selectable
  const [busy, setBusy] = useState(false); // a response is being spoken
  const [err, setErr] = useState<string | null>(null);
  const seq = useRef<StepSequence | null>(null);
  const first = useRef(true);
  const awarded = useRef(false);
  const gRef = useRef(g);
  gRef.current = g;

  const stopAll = useCallback(() => { seq.current?.cancel(false); seq.current = null; ctx.audio.stopAnimal(); speech.cancel('animal stop'); }, [ctx.audio]);

  const playRecording = useCallback((h: { onEnd: () => void; onError: (m: string) => void }) => {
    ctx.audio.playAnimal(gRef.current.target, { onEnd: h.onEnd, onError: h.onError });
  }, [ctx.audio]);

  /** intro (first only) -> pause -> real recording -> pause -> question -> options. */
  const ask = useCallback((target: PlayableAnimal, withIntro: boolean) => {
    stopAll();
    setReady(false); setBusy(false); setErr(null);
    const s = new StepSequence(depsFor(ctx), { onError: (m) => { setErr(m); setReady(true); } });
    seq.current = s;
    ctx.anim('LISTENING', 6000);
    s.run(animalQuestionSteps(target, withIntro, playRecording, () => ctx.audio.stopAnimal(), () => { setReady(true); ctx.particles('question', 3); }));
  }, [ctx, playRecording, stopAll]);

  useEffect(() => {
    if (g.finished) return;
    ask(g.target, first.current);
    first.current = false;
    return () => stopAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [g.round, g.finished]);

  /** Replay only the recording (and wait for it), never over speech. */
  const hearAgain = () => {
    if (busy) return;
    seq.current?.cancel(false); speech.cancel('replay'); ctx.audio.stopAnimal();
    const s = new StepSequence(depsFor(ctx), { onError: (m) => setErr(m) });
    seq.current = s;
    s.run([{ type: 'sound', start: playRecording, stop: () => ctx.audio.stopAnimal() }]);
  };

  const respond = (text: string, after: () => void) => {
    seq.current?.cancel(false); ctx.audio.stopAnimal();
    setBusy(true);
    const s = new StepSequence(depsFor(ctx), { onError: () => { setBusy(false); after(); } });
    seq.current = s;
    s.run([{ type: 'speak', text }, { type: 'wait', ms: ANIMAL_CONFIG.afterResponsePauseMs }, { type: 'do', fn: () => { setBusy(false); after(); } }]);
  };

  const choose = (a: PlayableAnimal) => {
    if (!ready || busy || g.finished) return;
    const next = answerChoice(g, a); // correctness is decided by animal id, not position
    setG(next);
    if (next.lastResult === 'correct') {
      ctx.sfx('correct'); ctx.anim('CELEBRATING', 2200); ctx.particles('sparkles', 10);
      respond(`${animalCorrect(a)} ${animalFact(a, R)}`, () => {
        const n = nextChoiceRound(next, ANIMALS, R, 4);
        setG(n);
        if (n.finished && !awarded.current) { awarded.current = true; ctx.earnScale('#4FA3D9'); ctx.say(line('gameDone', R), 'excited'); }
      });
    } else {
      ctx.sfx('retry'); ctx.anim('SUPPORTIVE', 1800);
      respond(ANIMAL_TRY_AGAIN, () => { hearAgain(); });
    }
  };

  if (g.finished) return <Panel title="Animal Sounds"><AnimalFinish ctx={ctx} score={g.score} total={g.total} onAgain={() => { awarded.current = false; first.current = false; setG(newChoiceGame(ANIMALS, R, 5, 4)); }} /></Panel>;
  const showClue = !!err || g.attempts >= 2;
  return (
    <Panel title="Animal Sounds" sub={`Question ${g.round} of ${g.total} · ${g.score} right so far`}>
      <div className="prompt-row" data-target={g.target}>
        <Btn fkey="animal-hear" autoFocus={!ready} className="chip c-orange" dim={!ready && !err} onSelect={hearAgain}><CtlIcon kind="hear" />Hear it again</Btn>
        <div className={`clue${showClue ? ' show' : ''}`}>{ready ? (showClue ? `"${ANIMAL_CLUE[g.target]}"` : ANIMAL_QUESTION) : 'Listen...'}</div>
      </div>
      {err && <div className="dev-error">Audio problem (settings): {err}</div>}
      <div className={`choices${ready ? ' shown' : ' hidden'}`}>
        {g.options.map((a, i) => (
          <Btn key={`${g.round}-${a}`} fkey={`animal-${i}`} autoFocus={ready && i === 0} label={a} dim={!ready || busy}
            className={`choice${shouldHint(g) && a === g.target ? ' hint' : ''}${g.lastResult === 'correct' && a === g.target ? ' right' : ''}`}
            onSelect={() => choose(a)}>
            <AnimalIcon animal={a} size={130} /><span className="choice-label">{a}</span>
          </Btn>
        ))}
      </div>
      <Dots total={g.total} done={g.round - 1} current={g.round - 1} />
    </Panel>
  );
}

function AnimalFinish({ ctx, score, total, onAgain }: { ctx: Ctx; score: number; total: number; onAgain: () => void }) {
  return (
    <div className="finish">
      <div className="finish-big">You did it!</div>
      <div className="finish-sub">{score} of {total} on the first try · you earned a shiny scale</div>
      <div className="finish-scale" style={{ background: '#4FA3D9' }} />
      <div className="row">
        <Btn fkey="finish-again" autoFocus className="chip big c-orange" onSelect={onAgain}><CtlIcon kind="replay" />Play again</Btn>
        <Btn fkey="finish-games" className="chip big c-blue" onSelect={() => ctx.go('play')}>Other games</Btn>
      </div>
    </div>
  );
}
