// Milo's approved response catalog. Every line Milo can "say" lives here.
// No free-form generation: children only ever see these reviewed strings.

import type { DanceStyle, Feeling, Intent } from './types.ts';
import { JOKES_GENERATED, RIDDLES } from './generatedLines.ts';

export type Rng = () => number;
export const pick = <T,>(arr: readonly T[], rng: Rng): T => arr[Math.floor(rng() * arr.length) % arr.length];

/** The only phrases Milo will repeat back. "Repeat after me" never echoes arbitrary text. */
export const APPROVED_PHRASES = [
  'hello',
  'good morning',
  'good night',
  'thank you',
  'i love you',
  'you are awesome',
  'lets play',
  'bye bye',
  'i can do it',
  'happy birthday',
  'well done',
  'roar',
] as const;

export const PHRASE_REPLY: Record<string, string> = {
  hello: 'Hello! Hello, my friend!',
  'good morning': 'Good morning, sunshine!',
  'good night': 'Good night! Sweet dreams.',
  'thank you': 'Thank you! You are so kind.',
  'i love you': 'Aww! Big warm hug!',
  'you are awesome': 'YOU are awesome!',
  'lets play': "Let's play!",
  'bye bye': 'Bye bye! Wave wave!',
  'i can do it': 'I can do it! And so can you!',
  'happy birthday': 'Happy birthday to you!',
  'well done': 'Well done! High five!',
  roar: 'RAWR! ...that was a tiny roar.',
};

export const SAY: Record<string, readonly string[]> = {
  welcome: ["Hi! I'm Zora Play! Want to play?", 'Hello, friend! What shall we do?', "Zora Play's here! Pick something fun!"],
  welcomeMorning: ['Good morning! I just woke up. Yawn!'],
  welcomeNight: ["It's nearly night-time. Let's do something cosy!"],
  greet: ['Hi hi! Happy to see you!', 'Hello there! Wave wave!', "Hey! I'm ready to play!"],
  danceNormal: ["Let's wiggle!", 'Dance party!', 'Shake your tail!'],
  danceRobot: ['Beep boop! Robot mode!', 'I am... a dancing robot!'],
  danceFunny: ['Silly wiggles!', 'Wobble wobble!', 'Noodle dance!'],
  danceSlow: ['Nice and slow...', 'Floaty dance...'],
  faster: ['Super-speed wiggles!', 'Zoom zoom!', 'Faster faster!'],
  fastest: ["That's my fastest! Whoosh!"],
  slower: ['Slowing down...', 'Easy does it...'],
  slowest: ["That's my slowest. Sloooow."],
  again: ['One more time!', 'Again! Again!', 'Here we go again!'],
  stop: ['Okay, stopping now!', 'Freeze!', 'All stopped!'],
  pause: ['Pausing!'],
  resume: ['And back we go!'],
  sing: ['La la la! Song time!', "Let's sing together!"],
  jump: ['Boing!', 'Up I go!', 'Hop hop!'],
  wave: ['Wave wave!', 'Hiii!'],
  clap: ['Clap clap clap!', 'Yay!'],
  spin: ['Wheee!', 'Round and round!'],
  sleep: ['Yawn... nap time. Zzz.', 'Night night... Zzz.'],
  wake: ["I'm awake! Good morning!", 'Yawn! I feel sparkly!'],
  alreadyAwake: ["I'm already awake! Silly!"],
  laugh: ['Hee hee hee!', 'Ha ha! That tickles!'],
  play: ["Let's play! Pick a game!", 'Game time!'],
  help: ['I can dance, sing, play games, and take big calm breaths!'],
  surprise: ['Surprise!', 'Ta-da!'],
  breathe: ["Let's take calm breaths. In... and out."],
  unknown: ["Hmm, I don't know that one yet. Try dance, sing or play!", 'Ooh, I can dance, sing or play. Which one?'],
  clarify: ['Ooh, two things! Which first?'],
  nothingToRepeat: ['What should I do again? Try dance!'],
  nothingToSpeedUp: ['Faster at what? Ask me to dance first!'],
  sayWhat: ['I can say hello, thank you, good night, or roar!'],
  private: ["That's private. Let's keep it for your grown-up, okay?"],
  sleepingHint: ['Zzz... (say "wake up!")'],
  goodTry: ["Good try! Let's try another one.", 'Almost! Try again!', 'Ooh, close one! Again?'],
  correct: ['Yes! You got it!', 'Wow, great job!', 'Super smart!', 'Brilliant!'],
  gameDone: ['You did it! You earned a shiny scale!', 'All done! Here is a shiny scale!'],
  bedtime: ["I'm getting sleepy... time to rest our eyes soon."],
};

export const FEELING_REPLY: Record<Feeling, readonly string[]> = {
  sad: ["I'm sorry you're feeling sad. Want to take a deep breath, or play a little game?"],
  scared: ["It's okay to feel scared. A grown-up can help too. Shall we take a slow, calm breath?"],
  angry: ['Feeling grumpy is okay. Let\'s blow it out with a big calm breath!'],
  tired: ['Sleepy? Me too. Maybe a quiet song?'],
  bored: ["Bored? Let's play a game!"],
  happy: ["Yay! Happy dance!"],
};

/** Gentle, age-appropriate jokes only. */
const JOKES_BASE = [
  'Why did the cat sit on the computer? To watch the mouse!',
  "What is a puppy's favorite snack? Pup-corn!",
  'Why did the chicken cross the road? To get to the other side!',
  'What do you call a bear with no teeth? A gummy bear!',
  'What goes up when the rain comes down? An umbrella!',
];
/** Hand-written jokes plus approved AI-written jokes and riddles (src/core/generatedLines.ts). */
export const JOKES: string[] = [...JOKES_BASE, ...JOKES_GENERATED, ...RIDDLES];

export const DANCE_LINE: Record<DanceStyle, string> = {
  normal: 'danceNormal',
  robot: 'danceRobot',
  funny: 'danceFunny',
  slow: 'danceSlow',
};

export const INTENT_LABEL: Partial<Record<Intent, string>> = {
  DANCE: 'Dance',
  SING: 'Sing',
  PLAY: 'Play',
  JUMP: 'Jump',
  WAVE: 'Wave',
  CLAP: 'Clap',
  SPIN: 'Spin',
  SLEEP: 'Sleep',
  BREATHE: 'Calm breaths',
  LAUGH: 'Laugh',
};

export function line(key: keyof typeof SAY, rng: Rng): string {
  return pick(SAY[key], rng);
}

/** The welcome lines say the selected buddy's own name (Zora, Mimi, Bruno, Teddy) instead of the app name. */
export const withBuddyName = (text: string, name: string): string => text.replace(/Zora Play/g, name);

/** Said on Home after the greeting, while the buddy points at the choices. */
export const PICK_LINE = 'Pick any one of these!';

/** Said by the buddy, in its own voice, right after a joke has been told. */
export const LAUGH_LINE = 'Ha, ha, ha, ha!';
