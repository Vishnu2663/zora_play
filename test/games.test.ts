import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SHAPES, ANIMALS, ANIMAL_CLUE, newChoiceGame, answerChoice, nextChoiceRound, shouldHint,
  newSimon, simonStartAnswer, simonPress, simonNext, simonLength,
  emptyChoreo, addMove, removeLast, choreoTimeline, stepAt, choreoReady, MOVE_BEAT_MS,
  breathPhase, BREATH,
} from '../src/core/games.ts';
import { RHYMES, Sequencer, noteToFreq, timeline } from '../src/core/rhymes.ts';

// Seeded RNG so games are reproducible.
function seeded(seed: number) {
  let s = seed;
  return () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
}

test('shape match: 3 distinct options always include the target', () => {
  const rng = seeded(1);
  let g = newChoiceGame(SHAPES, rng);
  for (let i = 0; i < 5; i++) {
    assert.equal(g.options.length, 3);
    assert.equal(new Set(g.options).size, 3);
    assert.ok(g.options.includes(g.target));
    g = answerChoice(g, g.target);
    g = nextChoiceRound(g, SHAPES, rng);
  }
  assert.equal(g.finished, true);
  assert.equal(g.score, 5);
});

test('shape match: wrong answer retries same round, no point, hint after two misses', () => {
  const rng = seeded(2);
  let g = newChoiceGame(SHAPES, rng);
  const wrong = g.options.find((o) => o !== g.target)!;
  g = answerChoice(g, wrong);
  assert.equal(g.lastResult, 'wrong');
  assert.equal(g.round, 1);
  assert.equal(shouldHint(g), false);
  g = answerChoice(g, wrong);
  assert.equal(shouldHint(g), true);
  g = answerChoice(g, g.target);
  assert.equal(g.lastResult, 'correct');
  assert.equal(g.score, 0, 'only first-try answers score');
});

test('shape match: choices not on screen are ignored', () => {
  const rng = seeded(3);
  const g = newChoiceGame(SHAPES, rng);
  const offscreen = SHAPES.find((s) => !g.options.includes(s))!;
  assert.deepEqual(answerChoice(g, offscreen), g);
});

test('animal game uses the same engine and every animal has a silent text clue', () => {
  const g = newChoiceGame(ANIMALS, seeded(4));
  assert.ok(ANIMALS.includes(g.target));
  for (const a of ANIMALS) assert.ok(ANIMAL_CLUE[a].length > 0);
});

test('milo says: single moves then two-move combos', () => {
  assert.equal(simonLength(1), 1);
  assert.equal(simonLength(4), 2);
  const rng = seeded(5);
  let g = newSimon(rng);
  let rounds = 0;
  while (g.phase !== 'done') {
    g = simonStartAnswer(g);
    for (const m of g.sequence) g = simonPress(g, m);
    assert.equal(g.lastResult, 'correct');
    g = simonNext(g, rng);
    rounds++;
  }
  assert.equal(rounds, 5);
  assert.equal(g.score, 5);
});

test('milo says: wrong move replays the same sequence, presses ignored while watching', () => {
  const rng = seeded(6);
  let g = newSimon(rng);
  const seq = g.sequence;
  assert.deepEqual(simonPress(g, 'jump'), g, 'cannot answer during watch phase');
  g = simonStartAnswer(g);
  const wrong = (['jump', 'wave', 'clap', 'spin'] as const).find((m) => m !== seq[0])!;
  g = simonPress(g, wrong);
  assert.equal(g.lastResult, 'wrong');
  g = simonNext(g, rng);
  assert.equal(g.phase, 'watch');
  assert.deepEqual(g.sequence, seq);
  assert.equal(g.round, 1);
});

test('dance maker: fill slots, undo, timeline scales with speed and loops', () => {
  let c = emptyChoreo();
  assert.equal(choreoReady(c), false);
  c = addMove(c, 'jump');
  c = addMove(c, 'turn');
  c = addMove(c, 'bounce');
  c = removeLast(c);
  c = addMove(c, 'handsup');
  assert.deepEqual(c, ['jump', 'turn', 'handsup', null]);
  const t1 = choreoTimeline(c, 1);
  assert.equal(t1.length, 3);
  assert.equal(t1[1].startMs, MOVE_BEAT_MS);
  const t2 = choreoTimeline(c, 2);
  assert.equal(t2[1].startMs, MOVE_BEAT_MS / 2, 'faster speed really shortens each move');
  assert.equal(stepAt(t1, 10)!.move, 'jump');
  assert.equal(stepAt(t1, MOVE_BEAT_MS * 3 + 10)!.move, 'jump', 'loops');
  assert.equal(stepAt(t1, MOVE_BEAT_MS * 3 + 10, false), null);
  // full choreo: extra move replaces last slot
  c = addMove(addMove(c, 'wave'), 'bounce');
  assert.deepEqual(c, ['jump', 'turn', 'handsup', 'bounce']);
});

test('dragon breath phases', () => {
  assert.equal(breathPhase(0).phase, 'in');
  assert.equal(breathPhase(BREATH.inMs + 10).phase, 'out');
  assert.equal(breathPhase(BREATH.inMs + 10).cycle, 1);
  assert.equal(breathPhase((BREATH.inMs + BREATH.outMs) * 1.5).cycle, 2);
  assert.equal(breathPhase((BREATH.inMs + BREATH.outMs) * 3).phase, 'done');
});

test('rhymes: every word has exactly one note; notes are valid', () => {
  for (const r of RHYMES) for (const l of r.lines) {
    assert.equal(l.words.length, l.notes.length, `${r.id}: "${l.words.join(' ')}"`);
    for (const [n] of l.notes) assert.ok(noteToFreq(n) > 200 && noteToFreq(n) < 600, n);
  }
  assert.equal(Math.round(noteToFreq('A4')), 440);
  assert.equal(Math.round(noteToFreq('C4')), 262);
});

test('sequencer: play, pause holds position, resume continues, stop resets', () => {
  const s = new Sequencer(RHYMES[0]);
  const mpb = s.msPerBeat();
  s.play(0);
  assert.deepEqual(s.cursor(0), { line: 0, word: 0 });
  s.pause(mpb * 2.2);
  const held = s.beatAt(mpb * 50);
  assert.ok(Math.abs(held - 2.2) < 1e-9, 'paused position does not advance');
  assert.deepEqual(s.due(mpb * 50), [], 'nothing scheduled while paused');
  s.resume(10000);
  assert.ok(Math.abs(s.beatAt(10000 + mpb) - 3.2) < 1e-9);
  s.stop();
  assert.equal(s.status, 'stopped');
  assert.equal(s.beatAt(99999), 0);
  assert.deepEqual(s.due(99999), [], 'stopped sequencer schedules nothing (cancellation)');
});

test('sequencer: due() hands each note out once, in order, and finishes', () => {
  const s = new Sequencer(RHYMES[1]);
  const total = timeline(RHYMES[1]).events.length;
  s.play(0);
  let seen = 0;
  for (let t = 0; t < 60000 && s.status === 'playing'; t += 50) seen += s.due(t).length;
  assert.equal(seen, total);
  assert.equal(s.status, 'finished');
});

test('sequencer: tempo change keeps position and changes speed', () => {
  const s = new Sequencer(RHYMES[0]);
  s.play(0);
  const mpb = s.msPerBeat();
  s.setTempo(mpb * 4, 2);
  assert.ok(Math.abs(s.beatAt(mpb * 4) - 4) < 1e-9);
  assert.ok(Math.abs(s.beatAt(mpb * 5) - 6) < 1e-9, 'twice as fast after the change');
  s.setTempo(0, 99);
  assert.equal(s.tempo, 2.2, 'tempo clamped');
});
