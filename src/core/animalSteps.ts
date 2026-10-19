// The ordered steps of one Animal Sounds question (pure, so the order can be tested without a browser).
import { ANIMAL_CONFIG, ANIMAL_INTRO, ANIMAL_QUESTION, type PlayableAnimal } from './games.ts';
import type { Step } from './stepSequence.ts';

/** Steps for one Animal Sounds question. Pure: used by tests. intro only on the first question. */
export function animalQuestionSteps(target: PlayableAnimal, first: boolean, play: (h: { onEnd: () => void; onError: (m: string) => void }) => void, stopSound: () => void, ready: () => void): Step[] {
  const steps: Step[] = [];
  if (first) steps.push({ type: 'speak', text: ANIMAL_INTRO, label: 'intro' }, { type: 'wait', ms: ANIMAL_CONFIG.introPauseMs, label: 'intro-pause' });
  steps.push({ type: 'sound', start: play, stop: stopSound, label: `sound-${target}` });
  steps.push({ type: 'wait', ms: ANIMAL_CONFIG.afterSoundPauseMs, label: 'after-sound-pause' });
  steps.push({ type: 'speak', text: ANIMAL_QUESTION, label: 'question' });
  steps.push({ type: 'do', fn: ready, label: 'options' });
  return steps;
}
