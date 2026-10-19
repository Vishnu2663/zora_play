// Talk section: remote-controlled conversation prompts. Every reply is a fixed, reviewed line
// (so each one has a recorded voice clip). No microphone or AI is involved.

import { AVATAR_IDS, type AvatarId } from './avatars.ts';
import { TALK_REPLIES_GENERATED } from './generatedLines.ts';

export interface TalkChat {
  id: string;
  prompt: string; // button label (what the child "says")
  lines: string[]; // what Zora Play says, in order, as one utterance
  state: 'DANCING' | 'SINGING' | 'CLAPPING' | 'WAVING' | 'CELEBRATING' | 'IDLE';
  mood: 'happy' | 'excited' | 'calm' | 'caring';
  particles: 'notes' | 'sparkles' | 'hearts' | 'question';
  /** Optional follow-up the app performs after the reply. */
  then?: { go?: 'play' | 'rhymes' | 'dance'; hear?: string };
  /** Pause between the spoken sentences (ms). Counting uses a slow, even beat. */
  gapMs?: number;
}

/** Each buddy has its own favourite colour, matching how it looks. */
export const FAVOURITE_COLOUR: Record<AvatarId, string> = {
  dino: 'My favourite colour is orange, like my scales!',
  cat: 'My favourite colour is pink, like my little nose!',
  dog: 'My favourite colour is brown, like my floppy ears!',
  bear: 'My favourite colour is yellow, like sweet honey!',
};

/** What the buddy says for a chat: the colour chat uses the selected buddy\'s own colour. */
export function chatLines(c: TalkChat, avatar: AvatarId): string[] {
  return c.id === 'colour' ? [FAVOURITE_COLOUR[avatar], ...c.lines.slice(1)] : c.lines;
}

export const TALK_GREETING = ['Hi friend! Let us have a chat.', 'Pick something to talk about.'];
export const TALK_NO_MIC = 'This TV has no microphone for me, so pick what you want to say with your remote.';
export const TALK_UNAVAILABLE = 'I cannot answer that one yet. Try one of the buttons!';

export const TALK_CHATS: TalkChat[] = [
  { id: 'animals', prompt: "Let's learn about animals!", state: 'WAVING', mood: 'excited', particles: 'sparkles',
    lines: ['Yes! Let us learn about animals!', 'A dog says bow wow.', 'A cat says meow.', 'Shall we play Animal Sounds?'], then: { go: 'play' } },
  { id: 'count', prompt: 'Can you count to five with me?', state: 'CLAPPING', mood: 'happy', particles: 'sparkles',
    lines: ['Yes! Count with me!', 'One.', 'Two.', 'Three.', 'Four.', 'Five!', 'Great counting!'], gapMs: 1100 },
  { id: 'colour', prompt: 'What is your favourite colour?', state: 'WAVING', mood: 'happy', particles: 'hearts',
    lines: ['My favourite colour is orange, like my scales!', 'What is your favourite colour?'] },
  { id: 'dance', prompt: 'Shall we dance together?', state: 'DANCING', mood: 'excited', particles: 'notes',
    lines: ['Yes! Let us dance together!'], then: { hear: 'Dance!' } },
  { id: 'rhyme', prompt: 'Would you like to hear a rhyme?', state: 'SINGING', mood: 'happy', particles: 'notes',
    lines: ['Yes please! Let us sing a rhyme.'], then: { go: 'rhymes' } },
];

/** Every line the Talk section can speak, for the voice catalog. */
export const TALK_LINES: string[] = [...new Set([...TALK_GREETING, TALK_NO_MIC, TALK_UNAVAILABLE, ...TALK_CHATS.flatMap((c) => c.lines), ...AVATAR_IDS.map((id) => FAVOURITE_COLOUR[id]), ...TALK_REPLIES_GENERATED])];
