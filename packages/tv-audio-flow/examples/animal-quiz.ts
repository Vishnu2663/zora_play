// Animal-sound quiz: (intro on the first round) -> pause -> animal sound -> pause -> question -> show options.
// Shows: typed errors for a missing recording, and the no-overlap policy when the child skips ahead.
// Run: npm run build && node examples/animal-quiz.ts
import { AudioChannel, AudioSequence, action, clip, delay, type Step } from 'tv-audio-flow';
import { ConsoleAdapter } from './console-adapter.ts';

const adapter = new ConsoleAdapter({
  'voice/intro.mp3': 100,
  'voice/which-animal.mp3': 80,
  'sounds/cow.mp3': 150,
  'sounds/duck.mp3': 120,
  // 'sounds/lion.mp3' is deliberately missing
});
const channel = new AudioChannel({ policy: 'interrupt' });

function round(animal: string, first: boolean): AudioSequence<string> {
  const steps: Step<string>[] = [];
  if (first) steps.push(clip('voice/intro.mp3', 'intro'), delay(50, 'intro-pause'));
  steps.push(
    clip(`sounds/${animal}.mp3`, 'sound'),
    delay(60, 'after-sound'),
    clip('voice/which-animal.mp3', 'question'),
    action(() => adapter.log(`  options shown for ${animal}`), 'options'),
  );
  return new AudioSequence(adapter, steps, { name: `round:${animal}` });
}

const results: string[] = [];

// Round 1 plays through.
const r1 = await channel.play(round('cow', true));
results.push(r1.status);
adapter.log(`round cow: ${r1.status}`);

// Round 2: the child presses "next" while the duck is still quacking -> round 3 interrupts it.
const r2 = channel.play(round('duck', false));
await new Promise((r) => setTimeout(r, 50));
adapter.log('child skips ahead');
const r3 = channel.play(round('lion', false));
const [res2, res3] = await Promise.all([r2, r3]);
adapter.log(`round duck: ${res2.status}; round lion: ${res3.status} -> ${res3.error?.code}: ${res3.error?.message}`);
results.push(res2.status, res3.status);

if (results.join() !== 'completed,cancelled,failed') process.exitCode = 1;
