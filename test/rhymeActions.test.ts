import test from 'node:test';
import assert from 'node:assert/strict';
import { RHYMES } from '../src/core/rhymes.ts';
import { actionForLine, isRhymeActionState } from '../src/core/rhymeActions.ts';
import { STATE_INFO } from '../src/core/character.ts';

test('lyric lines map to the move they describe', () => {
  assert.equal(actionForLine('Clap, clap, dragon tap,'), 'CLAPPING');
  assert.equal(actionForLine('Clap your hands and sway side to side,'), 'CLAPPING');
  assert.equal(actionForLine('Wave one hand, then wave the other,'), 'WAVING');
  assert.equal(actionForLine('Reach up high, then touch your toes,'), 'HANDSUP');
  assert.equal(actionForLine('Slow to the left, slow to the right,'), 'SIDESTEPPING');
  assert.equal(actionForLine('Tap your knees along with me.'), 'BOUNCING');
  assert.equal(actionForLine("Milo's ready, here we go!"), 'JUMPING');
  assert.equal(actionForLine('Milo moves slowly, soft as a cloud,'), 'SIDESTEPPING');
});

test('every rhyme has actions for most lines, and only short bounded moves are used', () => {
  for (const r of RHYMES) {
    const acts = r.lines.map((l) => actionForLine(l.words.join(' ')));
    assert.ok(acts.filter(Boolean).length >= Math.ceil(r.lines.length / 2), `${r.id}: most lines should have an action`);
    for (const a of acts) if (a) { assert.ok(isRhymeActionState(a)); assert.equal(STATE_INFO[a].loops, false, `${a} must not loop (the buddy has to return to singing)`); }
  }
});

test('a line with no action word keeps singing', () => {
  assert.equal(actionForLine('La la la'), null);
});

import { rhymeBeatAction } from '../src/core/rhymeActions.ts';
import { INSTRUMENTS, INSTRUMENT_STATE } from '../src/core/band.ts';
import { AVATARS, AVATAR_IDS } from '../src/core/avatars.ts';

test('every beat of every line has a bounded move, and long lines vary', () => {
  for (const r of RHYMES) {
    r.lines.forEach((l, li) => {
      const text = l.words.join(' ');
      const moves = [0, 1, 2].map((b) => rhymeBeatAction(text, li, b));
      for (const m of moves) { assert.ok(isRhymeActionState(m)); assert.equal(STATE_INFO[m].loops, false); }
      assert.ok(new Set(moves).size >= 2, `${r.id} line ${li}: the beats should differ`);
    });
  }
});

test('every instrument has its own playing move, and every buddy has a special move for the songs', () => {
  const states = INSTRUMENTS.map((i) => INSTRUMENT_STATE[i.id]);
  assert.equal(new Set(states).size, INSTRUMENTS.length, 'ten instruments, ten different moves');
  for (const s of states) assert.equal(STATE_INFO[s].loops, false);
  for (const id of AVATAR_IDS) assert.ok(STATE_INFO[AVATARS[id].special.state], `${id} has a special move`);
});
