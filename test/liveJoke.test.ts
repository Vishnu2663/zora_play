// The live "fresh joke": every reply from the joke service is checked again on the device before it is spoken.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isCleanJoke, parseLiveJoke } from '../src/core/liveJoke.ts';

const audio = 'A'.repeat(400); // looks like base64 audio

test('a short clean joke is accepted', () => {
  assert.equal(isCleanJoke('What do you call a sleeping bull?', 'A bulldozer!'), true);
  assert.equal(isCleanJoke('Why did the cat wear a bowtie?', 'To look pawsome!'), true);
});

test('unsafe, odd or wrongly shaped jokes are refused', () => {
  assert.equal(isCleanJoke('Why did the monster come?', 'To scare you!'), false, 'scary word');
  assert.equal(isCleanJoke('Why? Why?', 'Because it was funny!'), false, 'two question marks');
  assert.equal(isCleanJoke('Tell me a joke', 'Here it is!'), false, 'no question mark');
  assert.equal(isCleanJoke('What is 2 plus 2?', 'Four, of course!'), false, 'digit');
  assert.equal(isCleanJoke('Why did the cat go to the very big and loud circus on the hill?', 'Because it wanted to see all of the many funny clowns!'), false, 'too long');
  assert.equal(isCleanJoke('Why did the girl kiss him?', 'Love!'), false, 'romance');
  assert.equal(isCleanJoke('What is <b>this</b>?', 'Bold text!'), false, 'markup');
});

test('a whole reply needs the text and both audio clips', () => {
  const ok = { question: 'What do you call a sleeping bull?', answer: 'A bulldozer!', audioQuestion: audio, audioAnswer: audio };
  assert.ok(parseLiveJoke(ok));
  assert.equal(parseLiveJoke({ ...ok, audioAnswer: undefined }), null);
  assert.equal(parseLiveJoke({ ...ok, audioQuestion: '' }), null);
  assert.equal(parseLiveJoke({ ...ok, audioQuestion: 'not base64 !!' + audio }), null);
  assert.equal(parseLiveJoke({ ...ok, answer: 'A monster!' }), null);
  assert.equal(parseLiveJoke(null), null);
  assert.equal(parseLiveJoke('text'), null);
  assert.equal(parseLiveJoke({ error: 'no joke' }), null);
});

test('curly apostrophes are normalised so the line can be matched and spoken', () => {
  const j = parseLiveJoke({ question: 'What’s a pig’s best song?', answer: 'Oink and roll!', audioQuestion: audio, audioAnswer: audio });
  assert.ok(j);
  assert.equal(j!.question, "What's a pig's best song?");
});

/* ---- ages 3 to 8, and when to try the live joke at all ---- */
import { BLOCKED_WORDS, shouldTryLiveJoke, syllables } from '../src/core/liveJoke.ts';
import { BLOCKED_WORDS as PIPELINE_BLOCKED } from '../scripts/lib/bedrock-lib.mjs';
import { BLOCKED_WORDS as SERVICE_BLOCKED, isJokeForAges3to8 } from '../infra/joke-service/rules.mjs';

test('hard words are refused (a 3 year old cannot follow them)', () => {
  assert.equal(syllables('bulldozer'), 3);
  assert.equal(isCleanJoke('Why did the astronomer wave?', 'To say hello to the stars!'), false, 'astronomer has four syllables');
  assert.equal(isCleanJoke('What do you call a sleeping bull?', 'A bulldozer!'), true);
  assert.equal(isCleanJoke('Why did the cow go to school?', 'To learn about moo-sic!'), false, 'school is not a topic for this age');
  assert.equal(isCleanJoke('What is your name?', 'Tell me please!'), false, 'asking a child for personal facts');
});

test('the app, the joke service and the build pipeline all use the same blocked words', () => {
  assert.deepEqual([...new Set(BLOCKED_WORDS)].sort(), [...new Set(PIPELINE_BLOCKED)].sort());
  assert.deepEqual([...new Set(SERVICE_BLOCKED)].sort(), [...new Set(PIPELINE_BLOCKED)].sort());
});

test('the app and the joke service give the same verdict on the same jokes', () => {
  const corpus: [string, string][] = [
    ['What do you call a sleeping bull?', 'A bulldozer!'], ['Why did the cat wear a bowtie?', 'To look pawsome!'],
    ['Why did the monster come?', 'To scare you!'], ['Why? Why?', 'Because it was funny!'], ['Tell me a joke', 'Here it is!'],
    ['What is 2 plus 2?', 'Four, of course!'], ['Why did the astronomer wave?', 'To say hello to the stars!'],
    ['What is your name?', 'Tell me please!'], ['Why did the chicken join the jazz band?', 'He loved drumsticks!'],
    ['What do you call a dog with a fever?', 'A hot dog!'], ['Why did the girl kiss him?', 'Love!'],
  ];
  for (const [q, a] of corpus) assert.equal(isCleanJoke(q, a), isJokeForAges3to8(q, a), `${q} ${a}`);
});

test('connected means ask the service every time; no connection or switched off means a stored joke', () => {
  assert.equal(shouldTryLiveJoke({ enabled: true, online: true }), true);
  assert.equal(shouldTryLiveJoke({ enabled: true, online: false }), false, 'no wifi');
  assert.equal(shouldTryLiveJoke({ enabled: false, online: true }), false, 'switched off in Settings');
  assert.equal(shouldTryLiveJoke({ enabled: false, online: false }), false);
});
