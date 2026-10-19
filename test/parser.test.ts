import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalize, looksPrivate } from '../src/core/normalize.ts';
import { parseCommand } from '../src/core/parser.ts';
import { validate } from '../src/core/registry.ts';

const P = (t: string) => parseCommand(t);

test('normalize: case, punctuation, fillers, lead-ins', () => {
  assert.equal(normalize('Milo, DANCE!!!').text, 'dance');
  assert.equal(normalize('Hey Milo, can you please jump?').text, 'jump');
  assert.equal(normalize("Let's play!").text, 'lets play');
  assert.equal(normalize("I'm sad").text, 'im sad');
  assert.equal(normalize('   ').text, '');
  assert.equal(normalize('x'.repeat(5000)).raw.length, 200, 'input is bounded');
});

test('dance commands with styles and speed', () => {
  assert.deepEqual(P('Milo, dance!'), { intent: 'DANCE', params: {}, confidence: 0.95 });
  assert.equal(P('dance like a robot').params.style, 'robot');
  assert.equal(P('do a funny dance').params.style, 'funny');
  assert.equal(P('dance slowly').params.style, 'slow');
  assert.equal(P('dance faster').params.speed, 'faster');
  assert.equal(P('dance faster').intent, 'DANCE');
  assert.equal(P('dnace').intent, 'DANCE', 'tolerates a typo / mis-hearing');
});

test('follow-ups', () => {
  assert.equal(P('Faster!').intent, 'FASTER');
  assert.equal(P('slower please').intent, 'SLOWER');
  assert.equal(P('too fast').intent, 'SLOWER');
  assert.equal(P('Again!').intent, 'AGAIN');
  assert.equal(P('one more time').intent, 'AGAIN');
  assert.equal(P('Stop!').intent, 'STOP');
  assert.equal(P('stop singing').intent, 'STOP', 'stop beats the action word');
  assert.equal(P('surprise me').intent, 'SURPRISE');
  assert.equal(P('what can you do?').intent, 'HELP');
});

test('singing vs playing', () => {
  assert.equal(P('sing a song').intent, 'SING');
  assert.equal(P('play a rhyme').intent, 'SING', '"play a rhyme" is singing, not a game');
  assert.equal(P('sing again').params.again, true);
  assert.equal(P("let's play").intent, 'PLAY');
  assert.deepEqual(P('play the shape game').params, { game: 'shape' });
  assert.deepEqual(P('guess the animal').params, { game: 'animal' });
  assert.deepEqual(P("let's play simon says").params, { game: 'simon' });
  assert.deepEqual(P('make a dance').params, { game: 'maker' });
});

test('character actions', () => {
  for (const [t, i] of [['jump', 'JUMP'], ['wave', 'WAVE'], ['clap your hands', 'CLAP'], ['spin around', 'SPIN'], ['go to sleep', 'SLEEP'], ['wake up', 'WAKE'], ['laugh', 'LAUGH'], ['tell me a joke', 'LAUGH'], ['dragon breath', 'BREATHE']] as const) {
    assert.equal(P(t).intent, i, t);
  }
  assert.equal(P('i have a cat').intent, 'UNKNOWN', 'short words do not fuzzy-match ("have" is not "wave")');
});

test('repeat-after-me only echoes approved phrases', () => {
  assert.deepEqual(P('say hello').params, { phrase: 'hello' });
  assert.deepEqual(P('repeat after me thank you').params, { phrase: 'thank you' });
  const bad = P('say something rude words');
  assert.equal(bad.intent, 'SAY');
  assert.equal(bad.params.phrase, undefined, 'unapproved text is never echoed');
});

test('feelings get supportive handling', () => {
  assert.deepEqual(P("I'm sad").params, { feeling: 'sad' });
  assert.equal(P('i feel scared').params.feeling, 'scared');
  assert.equal(P("i'm tired").params.feeling, 'tired');
  assert.equal(P('im sleepy').intent, 'FEELING', 'sleepy feeling is not a dance style');
});

test('privacy guard: personal info is recognised and never parsed further', () => {
  assert.equal(P('my name is Sam').intent, 'PRIVATE');
  assert.equal(P('I live on Oak street').intent, 'PRIVATE');
  assert.equal(P('my phone is 555 1234').intent, 'PRIVATE');
  assert.equal(looksPrivate('i like dancing'), false);
});

test('ambiguous input asks the child to choose', () => {
  const r = P('dance and sing');
  assert.equal(r.intent, 'CLARIFY');
  assert.deepEqual(r.params.options, ['DANCE', 'SING']);
});

test('unsupported input is UNKNOWN, never executed', () => {
  assert.equal(P('open youtube').intent, 'UNKNOWN');
  assert.equal(P('rm -rf / ; eval(x)').intent, 'UNKNOWN');
  assert.equal(P('').intent, 'UNKNOWN');
  assert.equal(validate(P('open youtube')).ok, true, 'UNKNOWN validates only to the safe "I don\'t know" reply');
});

test('registry allowlist rejects unknown intents, params and low confidence', () => {
  assert.equal(validate({ intent: 'DANCE', params: { style: 'robot' }, confidence: 0.9 }).ok, true);
  assert.equal(validate({ intent: 'DANCE', params: { style: 'breakdance' as never }, confidence: 0.9 }).ok, false);
  assert.equal(validate({ intent: 'JUMP', params: { game: 'shape' }, confidence: 0.9 }).ok, false);
  assert.equal(validate({ intent: 'LAUNCH_ROCKET' as never, params: {}, confidence: 1 }).ok, false);
  assert.equal(validate({ intent: 'DANCE', params: {}, confidence: 0.3 }).ok, false);
});
