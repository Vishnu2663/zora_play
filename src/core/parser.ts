// Deterministic intent parser. No LLM, no network, no eval.
// parseCommand(text, context) -> { intent, params, confidence }

import type { CommandParams, DanceStyle, Feeling, GameId, Intent, ParsedCommand } from './types.ts';
import { editDistance, looksPrivate, normalize } from './normalize.ts';
import { APPROVED_PHRASES } from './responses.ts';

export interface ParseContext {
  /** Last action Milo performed, used to resolve "again"/"faster" etc. */
  lastIntent?: Intent;
  /** Current game, if any (lets "again" restart a game). */
  game?: GameId;
}

type Candidate = { intent: Intent; score: number; params: CommandParams };

const has = (text: string, phrase: string) => new RegExp(`(^|\\s)${phrase}(\\s|$)`).test(text);
const anyOf = (text: string, phrases: string[]) => phrases.some((p) => has(text, p));

/** Fuzzy token match: tolerates one typo / mis-hearing on words of 4+ letters. */
function fuzzy(tokens: string[], word: string): boolean {
  // Only words of 5+ letters get typo tolerance: short words ("wave" vs "have") collide too easily.
  return tokens.some((t) => t === word || (word.length >= 5 && t.length >= 4 && editDistance(t, word) === 1));
}

const ACTION_INTENTS: Intent[] = ['DANCE', 'SING', 'JUMP', 'WAVE', 'CLAP', 'SPIN', 'SLEEP', 'PLAY', 'BREATHE', 'LAUGH'];

function detectStyle(text: string): DanceStyle | undefined {
  if (anyOf(text, ['robot', 'robots', 'robotic', 'beep boop'])) return 'robot';
  if (anyOf(text, ['funny', 'silly', 'crazy', 'wiggly', 'goofy', 'wacky'])) return 'funny';
  if (anyOf(text, ['slow', 'slowly', 'sleepy', 'gentle', 'calm'])) return 'slow';
  return undefined;
}

function detectGame(text: string, tokens: string[]): GameId | undefined {
  if (anyOf(text, ['shape', 'shapes', 'shape game', 'find the shape'])) return 'shape';
  if (anyOf(text, ['simon', 'simon says', 'milo says', 'zora play says', 'zora says', 'copy me', 'copy game', 'copy cat'])) return 'simon';
  if (anyOf(text, ['animal', 'animals', 'animal sounds', 'guess the animal']) || fuzzy(tokens, 'animal')) return 'animal';
  if (anyOf(text, ['dance maker', 'make a dance', 'my dance', 'build a dance'])) return 'maker';
  return undefined;
}

function detectFeeling(text: string): Feeling | undefined {
  const feel = (words: string[]) =>
    words.some((w) => has(text, `im ${w}`) || has(text, `i feel ${w}`) || has(text, `feeling ${w}`) || text === w);
  if (feel(['sad', 'upset', 'crying', 'lonely', 'unhappy']) || has(text, 'i want to cry')) return 'sad';
  if (feel(['scared', 'afraid', 'frightened', 'nervous', 'worried'])) return 'scared';
  if (feel(['angry', 'mad', 'grumpy', 'cross', 'frustrated'])) return 'angry';
  if (feel(['tired', 'sleepy'])) return 'tired';
  if (feel(['bored'])) return 'bored';
  if (feel(['happy', 'glad', 'excited', 'great', 'good'])) return 'happy';
  return undefined;
}

function detectPhrase(text: string): string | undefined {
  // "say hello", "repeat after me thank you", "can you say good night"
  const m = text.match(/(?:^|\s)(?:repeat after me|say|repeat)\s+(.*)$/);
  if (!m) return undefined;
  const wanted = m[1].trim();
  return APPROVED_PHRASES.find((p) => p.replace(/[^a-z ]/g, '') === wanted || wanted.startsWith(p.replace(/[^a-z ]/g, '')));
}

export function parseCommand(input: string, ctx: ParseContext = {}): ParsedCommand {
  const n = normalize(input);
  const { text, tokens } = n;

  if (looksPrivate(n.raw)) return { intent: 'PRIVATE', params: {}, confidence: 1 };
  if (!text) {
    if (has(n.raw.replace(/[^a-z\s]/g, ' ').trim(), 'milo') || has(n.raw.replace(/[^a-z\s]/g, ' ').trim(), 'zora')) return { intent: 'GREET', params: {}, confidence: 0.9 };
    return { intent: 'UNKNOWN', params: {}, confidence: 0 };
  }

  const c: Candidate[] = [];
  const add = (intent: Intent, score: number, params: CommandParams = {}) => c.push({ intent, score, params });

  // --- Control words (highest priority, short utterances) ---
  if (anyOf(text, ['stop', 'freeze', 'enough', 'quiet', 'be quiet', 'shh', 'shush', 'no more', 'stop it', 'stop singing', 'stop dancing']))
    add('STOP', 0.97);
  if (anyOf(text, ['pause', 'hold on', 'wait'])) add('PAUSE', 0.9);
  if (anyOf(text, ['resume', 'keep going', 'continue', 'go on', 'unpause'])) add('RESUME', 0.9);

  // --- Feelings & safety ---
  const feeling = detectFeeling(text);
  if (feeling) add('FEELING', 0.93, { feeling });

  // --- Follow-ups ---
  const slowerWord = anyOf(text, ['slower', 'slow down', 'too fast']) || fuzzy(tokens, 'slower');
  const fasterWord = !slowerWord && (anyOf(text, ['faster', 'quicker', 'speed up', 'super fast', 'fast']) || fuzzy(tokens, 'faster'));
  const againWord = anyOf(text, ['again', 'one more time', 'more', 'do it again', 'once more', 'encore']) ||
    (has(text, 'repeat') && !has(text, 'repeat after me') && !detectPhrase(text));

  // --- Actions ---
  const style = detectStyle(text);
  const game = detectGame(text, tokens);
  const singWords = anyOf(text, ['sing', 'song', 'songs', 'rhyme', 'rhymes', 'music', 'la la', 'lullaby', 'karaoke']) || fuzzy(tokens, 'sing');

  if (anyOf(text, ['dance', 'dancing', 'boogie', 'groove', 'wiggle', 'shake', 'bust a move']) || fuzzy(tokens, 'dance')) {
    if (game === 'maker') add('PLAY', 0.95, { game });
    else add('DANCE', 0.95, {
      ...(style ? { style } : {}),
      ...(fasterWord ? { speed: 'faster' } : slowerWord ? { speed: 'slower' } : {}),
      ...(againWord ? { again: true } : {}),
    });
  }

  if (singWords) add('SING', 0.93, againWord ? { again: true } : {});

  if (anyOf(text, ['play', 'game', 'games', 'lets play', 'play with me', 'quiz']) || game) {
    // "play a song" / "play music" is singing, not a game.
    if (!(singWords && !game)) add('PLAY', game ? 0.95 : 0.88, game ? { game } : {});
  }

  if (anyOf(text, ['jump', 'hop', 'bounce', 'jumping']) || fuzzy(tokens, 'jump')) add('JUMP', 0.92);
  if (anyOf(text, ['wave', 'waving', 'say bye', 'bye bye', 'goodbye']) || fuzzy(tokens, 'wave')) add('WAVE', 0.9);
  if (anyOf(text, ['clap', 'clapping', 'applause', 'high five']) || fuzzy(tokens, 'clap')) add('CLAP', 0.9);
  if (anyOf(text, ['spin', 'twirl', 'turn around', 'spin around', 'spinning']) || fuzzy(tokens, 'spin')) add('SPIN', 0.9);
  if (anyOf(text, ['sleep', 'nap', 'go to bed', 'night night', 'goodnight', 'good night', 'take a nap']) && !feeling)
    add('SLEEP', 0.9);
  if (anyOf(text, ['wake up', 'wakey wakey', 'get up', 'rise and shine'])) add('WAKE', 0.95);
  if (anyOf(text, ['laugh', 'giggle', 'joke', 'tell me a joke', 'funny face', 'silly face', 'make me laugh', 'tickle']))
    add('LAUGH', 0.9);
  if (anyOf(text, ['breathe', 'breath', 'dragon breath', 'calm down', 'relax', 'deep breath'])) add('BREATHE', 0.92);

  const phrase = detectPhrase(text);
  if (phrase) add('SAY', 0.95, { phrase });
  else if (has(text, 'repeat after me') || /(^|\s)say\s/.test(text)) add('SAY', 0.75, {});

  if (anyOf(text, ['what can you do', 'what can i say', 'help', 'help me', 'what do i do', 'how do i play', 'what are you'])) add('HELP', 0.95);
  if (anyOf(text, ['surprise', 'surprise me', 'anything', 'random', 'you choose', 'you pick'])) add('SURPRISE', 0.92);
  if (anyOf(text, ['hi', 'hello', 'hey', 'how are you', 'good morning', 'howdy', 'hiya']) && !phrase) add('GREET', 0.8);

  // Bare follow-ups (no action word in the utterance).
  const hasAction = c.some((x) => ACTION_INTENTS.includes(x.intent));
  if (!hasAction) {
    if (fasterWord) add('FASTER', 0.93);
    if (slowerWord) add('SLOWER', 0.93);
    if (againWord && !has(text, 'play again')) add('AGAIN', 0.9);
    if (has(text, 'play again')) add('AGAIN', 0.92);
  }

  if (c.length === 0) return { intent: 'UNKNOWN', params: {}, confidence: 0.2 };

  // Priority: STOP and safety beat everything; then the highest score.
  const stop = c.find((x) => x.intent === 'STOP');
  if (stop) return { intent: 'STOP', params: {}, confidence: stop.score };
  const feel = c.find((x) => x.intent === 'FEELING');
  if (feel) return { intent: 'FEELING', params: feel.params, confidence: feel.score };

  // Two different actions at once ("dance and sing") -> ask the child to choose.
  const actions = c.filter((x) => ACTION_INTENTS.includes(x.intent));
  const distinct = [...new Set(actions.map((a) => a.intent))];
  if (distinct.length >= 2) {
    return { intent: 'CLARIFY', params: { options: distinct.slice(0, 3) }, confidence: 0.6 };
  }

  c.sort((a, b) => b.score - a.score);
  const best = c[0];
  // A greeting plus an action ("hi milo, dance") is the action.
  const pick = best.intent === 'GREET' && actions.length ? actions[0] : best;
  void ctx; // context is resolved by the brain; parser stays stateless
  return { intent: pick.intent, params: pick.params, confidence: pick.score };
}
