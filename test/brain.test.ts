import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MiloBrain } from '../src/core/brain.ts';
import { CharacterMachine, ALL_STATES, STATE_INFO, SPEED_STEPS, DEFAULT_SPEED_INDEX } from '../src/core/character.ts';

const rng = () => 0; // deterministic
const brain = () => new MiloBrain(rng, 0);

test('dance -> faster -> again -> stop (the spec demo flow)', () => {
  const b = brain();
  let r = b.hear('Milo, dance!', 0);
  assert.equal(r.accepted, true);
  assert.equal(b.machine.snapshot.state, 'DANCING');
  assert.equal(b.machine.speed, SPEED_STEPS[DEFAULT_SPEED_INDEX]);

  r = b.hear('faster!', 100);
  assert.equal(r.intent, 'FASTER');
  assert.ok(b.machine.speed > 1, 'speed actually increased');
  assert.deepEqual(r.effects, [{ type: 'tempo', speed: b.machine.speed }]);

  r = b.hear('stop', 200);
  assert.ok(r.effects.some((e) => e.type === 'stopAll'));
  assert.equal(b.machine.snapshot.state, 'STOPPING');
  b.machine.tick(700);
  assert.equal(b.machine.snapshot.state, 'IDLE');

  r = b.hear('again', 800);
  assert.equal(r.intent, 'DANCE');
  assert.equal(b.machine.snapshot.state, 'DANCING');
});

test('robot dance enters ROBOT_DANCE and "again" keeps the style', () => {
  const b = brain();
  b.hear('dance like a robot', 0);
  assert.equal(b.machine.snapshot.state, 'ROBOT_DANCE');
  b.hear('stop', 10); b.machine.tick(1000);
  b.hear('again', 1100);
  assert.equal(b.machine.snapshot.state, 'ROBOT_DANCE');
});

test('speed is clamped and Milo says so at the limit', () => {
  const b = brain();
  b.hear('dance', 0);
  for (let i = 0; i < 6; i++) b.hear('faster', i);
  assert.equal(b.machine.speed, SPEED_STEPS[SPEED_STEPS.length - 1]);
  const r = b.hear('faster', 10);
  assert.match(r.say, /fastest/i);
});

test('faster and slower with nothing going on do DIFFERENT things (quick dance vs slow floaty dance)', () => {
  const f = brain(); const rf = f.hear('faster', 0);
  const s = brain(); const rs = s.hear('slower', 0);
  assert.equal(rf.accepted, true); assert.equal(rs.accepted, true);
  assert.ok(f.machine.isDancing && s.machine.isDancing, 'both start dancing');
  assert.ok(f.machine.speed > s.machine.speed, 'faster is quicker than slower');
  assert.equal(f.machine.speed, SPEED_STEPS[3]); assert.equal(s.machine.speed, SPEED_STEPS[0]);
  assert.equal(s.machine.snapshot.style, 'slow'); assert.equal(f.machine.snapshot.style, 'normal');
  assert.notEqual(rf.say, rs.say);
});

test('again with no history offers choices instead of inventing', () => {
  const r = brain().hear('again', 0);
  assert.equal(r.accepted, false);
  assert.ok(r.choices && r.choices.length > 0);
});

test('bounded actions return to IDLE on their own', () => {
  const b = brain();
  b.hear('jump', 0);
  assert.equal(b.machine.snapshot.state, 'JUMPING');
  b.machine.tick(1000);
  assert.equal(b.machine.snapshot.state, 'JUMPING');
  b.machine.tick(1700);
  assert.equal(b.machine.snapshot.state, 'IDLE');
});

test('sleeping blocks actions until "wake up"', () => {
  const b = brain();
  b.hear('go to sleep', 0);
  assert.equal(b.machine.snapshot.state, 'SLEEPING');
  const r = b.hear('dance', 10);
  assert.equal(r.accepted, false);
  assert.equal(b.machine.snapshot.state, 'SLEEPING');
  assert.deepEqual(r.choices, ['WAKE']);
  b.hear('wake up', 20);
  assert.equal(b.machine.snapshot.state, 'HAPPY');
});

test('sing navigates to Rhyme Room and plays; "sing again" replays the same rhyme', () => {
  const b = brain();
  const r1 = b.hear('sing a song', 0);
  const play1 = r1.effects.find((e) => e.type === 'rhyme');
  assert.ok(r1.effects.some((e) => e.type === 'navigate' && e.screen === 'rhymes'));
  b.screen = 'rhymes';
  b.hear('stop', 5);
  const r2 = b.hear('sing again', 10);
  const play2 = r2.effects.find((e) => e.type === 'rhyme');
  assert.deepEqual(play1, play2);
  const r3 = b.hear('sing a song', 20);
  assert.notDeepEqual(r3.effects.find((e) => e.type === 'rhyme'), play2, 'a new request moves to the next rhyme');
});

test('pause/resume only affect an active rhyme', () => {
  const b = brain();
  b.hear('sing', 0);
  assert.deepEqual(b.hear('pause', 1).effects, [{ type: 'rhyme', action: 'pause' }]);
  assert.deepEqual(b.hear('keep going', 2).effects, [{ type: 'rhyme', action: 'resume' }]);
});

test('play routes to the right screen', () => {
  const b = brain();
  assert.ok(b.hear("let's play", 0).effects.some((e) => e.type === 'navigate' && e.screen === 'play'));
  assert.ok(b.hear('play the shape game', 0).effects.some((e) => e.type === 'navigate' && e.screen === 'shape'));
});

test('"again" inside a game restarts that game', () => {
  const b = brain();
  b.screen = 'shape';
  assert.deepEqual(b.hear('again', 0).effects, [{ type: 'game', action: 'restart' }]);
});

test('sad -> supportive state with gentle choices', () => {
  const b = brain();
  const r = b.hear("I'm sad", 0);
  assert.equal(b.machine.snapshot.state, 'SUPPORTIVE');
  assert.match(r.say, /sorry you're feeling sad/i);
  assert.deepEqual(r.choices, ['BREATHE', 'PLAY']);
});

test('personal info: polite deflection, nothing remembered', () => {
  const b = brain();
  const r = b.hear('my name is Sam and I live at 12 Oak street', 0);
  assert.equal(r.intent, 'PRIVATE');
  assert.equal(JSON.stringify(b).includes('Sam'), false, 'the brain never stores the transcript');
});

test('unknown command: confused, safe reply, offers choices', () => {
  const b = brain();
  const r = b.hear('order a pizza', 0);
  assert.equal(r.accepted, false);
  assert.equal(b.machine.snapshot.state, 'CONFUSED');
  assert.deepEqual(r.choices, ['DANCE', 'SING', 'PLAY']);
});

test('repeat after me with an unapproved phrase does not echo it', () => {
  const r = brain().hear('repeat after me banana pants', 0);
  assert.equal(r.accepted, false);
  assert.doesNotMatch(r.say, /banana/);
});

test('character machine: every state has a finite safety cap except IDLE', () => {
  for (const s of ALL_STATES) {
    if (s === 'IDLE') continue;
    assert.ok(Number.isFinite(STATE_INFO[s].maxMs), `${s} must not get stuck`);
  }
});

test('character machine: looping states time out to IDLE (never stuck dancing/listening)', () => {
  const m = new CharacterMachine(0);
  m.enter('LISTENING', 0, { durationMs: null });
  m.tick(STATE_INFO.LISTENING.maxMs + 1);
  assert.equal(m.snapshot.state, 'IDLE');
  m.enter('DANCING', 0, { durationMs: null });
  m.tick(STATE_INFO.DANCING.maxMs + 1);
  assert.equal(m.snapshot.state, 'IDLE');
});

test('character machine: ANY -> STOPPING -> IDLE, and seq increments for re-entry', () => {
  const m = new CharacterMachine(0);
  for (const s of ALL_STATES) {
    m.enter('IDLE', 0, {});
    m.enter(s, 0, {});
    m.stop(1);
    assert.equal(m.snapshot.state, 'STOPPING', `${s} -> STOPPING`);
    m.tick(1000);
    assert.equal(m.snapshot.state, 'IDLE');
  }
  const seq = m.snapshot.seq;
  m.enter('JUMPING', 0, {});
  m.enter('JUMPING', 0, {});
  assert.equal(m.snapshot.seq, seq + 2);
});
