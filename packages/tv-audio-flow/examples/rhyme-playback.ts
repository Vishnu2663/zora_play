// Rhyme playback: intro line -> pause -> rhyme title -> pause -> song.
// Each spoken line must really finish before the pause starts; the song starts exactly once.
// Then the same flow is started again and "navigated away from" mid-way: nothing plays after that.
// Run: npm run build && node examples/rhyme-playback.ts
import { AudioChannel, AudioSequence, clip, delay } from 'tv-audio-flow';
import { ConsoleAdapter } from './console-adapter.ts';

const adapter = new ConsoleAdapter({
  'voice/lets-sing.mp3': 120,
  'voice/title-twinkle.mp3': 90,
  'songs/twinkle.mp3': 300,
});

const rhyme = (title: string, song: string) => new AudioSequence(adapter, [
  clip('voice/lets-sing.mp3', 'intro'),
  delay(60, 'intro-pause'),
  clip(title, 'title'),
  delay(80, 'song-pause'),
  clip(song, 'song'),
], { name: 'rhyme' });

const channel = new AudioChannel(); // one audible sequence at a time

const first = rhyme('voice/title-twinkle.mp3', 'songs/twinkle.mp3');
first.on('state', ({ status }) => adapter.log(`  [${status}] step ${first.stepIndex} ${first.currentStep?.label ?? ''}`));
const r1 = await channel.play(first);
adapter.log(`result: ${r1.status}`);

// Start again and leave the screen during the title pause.
const second = rhyme('voice/title-twinkle.mp3', 'songs/twinkle.mp3');
const pending = channel.play(second);
setTimeout(() => { adapter.log('navigate away -> channel.cancel()'); channel.cancel('navigate'); }, 240);
const r2 = await pending;
adapter.log(`result: ${r2.status} (${r2.error?.code}) at step ${r2.stepIndex}`);
if (r1.status !== 'completed' || r2.status !== 'cancelled') process.exitCode = 1;
