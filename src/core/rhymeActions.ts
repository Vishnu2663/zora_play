// What the buddy does while a rhyme plays: each lyric line is matched to one of the buddy's moves by what the words say
// ("Clap, clap" -> clapping, "Reach up high" -> arms up, "Slow to the left" -> a gentle side step...). Lines with no
// action word keep the normal singing sway. Only short, bounded moves are used, so the buddy always returns to singing.

import type { CharacterState } from './types.ts';

/** First matching rule wins. */
const RULES: [RegExp, CharacterState][] = [
  [/\bclap/i, 'CLAPPING'],
  [/\bwave|hello/i, 'WAVING'],
  [/\bspin|twirl|turn around/i, 'SPINNING'],
  [/\bjump|\bhop\b|ready|here we go/i, 'JUMPING'],
  [/reach up|stretch up|up high|up slowly|reeeach|to the sky|hands up|arms up/i, 'HANDSUP'],
  [/\btoes|knees|lower your|arms fall|\bmarch|\bstep\b|step-step|\btap\b|click|beep/i, 'BOUNCING'],
  [/\bleft|\bright\b|side|\bsway|float|\bcloud|\bkite|slow|wiggle|dancing/i, 'SIDESTEPPING'],
  [/freeze|hold a pose|\bbreath|smile/i, 'HAPPY'],
];

/** The move for a lyric line, or null to keep singing. */
export function actionForLine(text: string): CharacterState | null {
  for (const [re, state] of RULES) if (re.test(text)) return state;
  return null;
}

/** Moves used to fill the beats of a line that has no action word of its own (and the later beats of long lines). */
const FILLERS: CharacterState[] = ['SIDESTEPPING', 'BOUNCING', 'HANDSUP', 'WAVING', 'CLAPPING', 'JUMPING'];

/** The move for one ~1.7 s beat of line `li`: the first beat does what the words say, the others keep the buddy busy. */
export function rhymeBeatAction(text: string, li: number, beat: number): CharacterState {
  const said = actionForLine(text);
  if (beat === 0 && said) return said;
  return FILLERS[(li * 2 + beat + (said ? 1 : 0)) % FILLERS.length];
}

const ACTION_STATES = new Set<CharacterState>([...RULES.map(([, s]) => s), ...FILLERS]);
export const isRhymeActionState = (s: CharacterState): boolean => ACTION_STATES.has(s);
