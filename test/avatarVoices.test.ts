import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AVATARS, AVATAR_IDS } from '../src/core/avatars.ts';
import { allPhrases, segment } from '../src/core/phrases.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const V = JSON.parse(readFileSync(join(root, 'public/audio/voice/clips.json'), 'utf8')).voices as Record<string, Record<string, { file: string; ms: number }>>;
const profiles = JSON.parse(readFileSync(join(root, 'voice/profiles.json'), 'utf8')).characters as Record<string, { pitch: number; tempo: number }>;

test('each avatar has its own name and its own voice profile', () => {
  assert.equal(new Set(AVATAR_IDS.map((id) => AVATARS[id].name)).size, 4, 'four different names');
  assert.deepEqual(AVATAR_IDS.map((id) => AVATARS[id].name), ['Zora', 'Mimi', 'Bruno', 'Teddy']);
  const prof = AVATAR_IDS.map((id) => `${profiles[id].pitch}/${profiles[id].tempo}`);
  assert.equal(new Set(prof).size, 4, 'four different pitch/speed profiles');
});

test('every avatar can speak every catalog line, with its own recording', () => {
  const phrases = allPhrases();
  for (const id of AVATAR_IDS) {
    for (const p of phrases) {
      const c = V[id]?.[p.id];
      assert.ok(c && existsSync(join(root, 'public', c.file)), `${id}: missing clip "${p.text}"`);
    }
  }
  const dinoFiles = new Set(Object.values(V.dino).map((c) => c.file));
  for (const id of ['cat', 'dog', 'bear']) for (const c of Object.values(V[id])) assert.ok(!dinoFiles.has(c.file), 'no shared files between voices');
  // the voices really differ: same line, different length per avatar
  const line = segment("Let's sing some rhymes!").phrases[0].id;
  assert.equal(new Set(AVATAR_IDS.map((id) => V[id][line].ms)).size > 1, true, 'same sentence has different timing per voice');
});

test('each avatar introduces itself by name (spoken in its own voice)', () => {
  for (const id of AVATAR_IDS) {
    assert.ok(AVATARS[id].intro.includes(AVATARS[id].name));
    const seg = segment(AVATARS[id].intro);
    assert.deepEqual(seg.missing, []);
    for (const p of seg.phrases) assert.ok(V[id][p.id], `${id} intro clip`);
  }
});

test('the app uses the selected avatar\'s voice for speech and for singing', () => {
  const app = readFileSync(join(root, 'src/web/App.tsx'), 'utf8');
  assert.match(app, /speech\.character = avatar/);
  assert.match(app, /speech\.character = id/);
  assert.match(app, /audio\.playRhyme\(id, brain\.machine\.speed, onEnd, avatarRef\.current\)/);
  assert.match(readFileSync(join(root, 'src/web/audio.ts'), 'utf8'), /replace\('\{avatar\}', avatar\)/);
});

test('the buddy section is named My buddy with an emoji', () => {
  const s = readFileSync(join(root, 'src/web/screens.tsx'), 'utf8');
  assert.match(s, /🧸<\/span>My buddy/);
  assert.match(readFileSync(join(root, 'src/web/screensNew.tsx'), 'utf8'), /title="🧸 My buddy"/);
});
