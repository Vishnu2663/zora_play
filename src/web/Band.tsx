// Zora Play's Band: ten instruments in three columns. Press one and it plays the next note of a little tune
// (audio.playInstrument), with its own animation, flying notes, and the buddy bops along.
// (The old step grid + its Play/tempo/Clear controls were removed on request; the scheduler stays in src/core/band.ts.)
import React, { useEffect, useRef, useState } from 'react';
import { INSTRUMENTS, INSTRUMENT_STATE, instrumentNote, type InstrumentId } from '../core/band.ts';
import { line } from '../core/responses.ts';
import { Btn, Panel, type Ctx } from './ui.tsx';
import { InstrumentArt } from './instrumentArt.tsx';

const BAND_COLOR = '#EF5440';

const NoteGlyph = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4v11.2A3.5 3.5 0 1 0 11 18V8h7V4z" fill="currentColor" /></svg>
);

export function Band({ ctx }: { ctx: Ctx }) {
  useEffect(() => { ctx.audio.warmBand(); }, [ctx.audio]);
  useEffect(() => { ctx.say('Press an instrument to play it!', 'happy'); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => () => { ctx.audio.stopBand(); }, [ctx.audio]);

  // Each press plays the next note of a little tune, re-runs the pad's animation and lets notes fly.
  const [presses, setPresses] = useState<Record<string, number>>({});
  const [bursts, setBursts] = useState<{ id: number; inst: InstrumentId; dx: number }[]>([]);
  const burstId = useRef(0);
  const rewarded = useRef(false);
  const playInstrument = (id: InstrumentId) => {
    ctx.audio.unlock();
    const n = presses[id] ?? 0;
    ctx.audio.playInstrument(id, instrumentNote(id, n));
    const next = { ...presses, [id]: n + 1 };
    setPresses(next);
    const b = { id: ++burstId.current, inst: id, dx: Math.round(Math.random() * 70 - 35) };
    setBursts((bs) => [...bs.slice(-10), b]);
    setTimeout(() => setBursts((bs) => bs.filter((x) => x.id !== b.id)), 1200);
    ctx.anim(INSTRUMENT_STATE[id], 1100); // the buddy plays it its own way: drums with both arms, strums, blows, shakes...
    // Reward: every instrument tried at least once.
    if (!rewarded.current && INSTRUMENTS.every((i) => (next[i.id] ?? 0) > 0)) {
      rewarded.current = true;
      ctx.earnScale(BAND_COLOR);
      ctx.say(line('gameDone', Math.random), 'excited');
    }
  };

  return (
    <Panel title="Zora Play's Band" sub="Press an instrument to play it!" className="band-panel">
      <div className="scroll-y band-scroll">
        <div className="band-inst" role="group" aria-label="Instruments">
          {INSTRUMENTS.map((inst, i) => {
            const n = presses[inst.id] ?? 0;
            return (
              <Btn key={inst.id} fkey={`inst-${inst.id}`} autoFocus={i === 0} label={`${inst.label}. Press to play`}
                className={`inst inst-${inst.id}${n ? ' hit' : ''}`} onSelect={() => playInstrument(inst.id)}>
                <span key={n} className="inst-art"><InstrumentArt id={inst.id} lit={Math.max(0, n - 1)} /></span>
                <span className="inst-name">{inst.label}</span>
                {n > 0 && <span key={`r${n}`} className="inst-ripple" />}
                {bursts.filter((b) => b.inst === inst.id).map((b) => (
                  <span key={b.id} className="inst-note" style={{ ['--dx' as string]: `${b.dx}px` }}><NoteGlyph /></span>
                ))}
              </Btn>
            );
          })}
        </div>
      </div>
    </Panel>
  );
}
