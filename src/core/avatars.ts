// Central avatar registry: one entry per selectable character. The renderer (src/web/Milo.tsx) draws any
// avatar from this data on the shared animation rig, so Dance, Sing, Play, Alphabets and Talk all show
// whichever character is selected. Voice: each avatar has its own voice profile (voice/profiles.json) on the
// shared Piper base voice, used for dialogue AND for singing.

export const AVATAR_IDS = ['dino', 'cat', 'dog', 'bear'] as const;
export type AvatarId = (typeof AVATAR_IDS)[number];
export const DEFAULT_AVATAR: AvatarId = 'dino';
export const AVATAR_STORAGE_KEY = 'zora.avatar';

/** Animation states the registry promises for every avatar (all drawn by the shared rig). */
export const AVATAR_STATES = ['idle', 'speaking', 'singing', 'dancing', 'celebrating', 'listening'] as const;
export type AvatarState = (typeof AVATAR_STATES)[number];

export interface Skin {
  bodyLight: string; bodyMid: string; bodyDark: string; // body/head gradient
  belly: string; bellyLine: string; hand: string; arm: string; feet: string;
  muzzle: string; nose: string; cheek: string; inner: string; // inner = inner-ear / accent
  crest: string; // dino crest / cat-dog-bear ear colour
  wings: boolean; horns: boolean;
  ears: 'none' | 'pointy' | 'floppy' | 'round';
  face: 'dino' | 'cat' | 'dog' | 'bear';
  tail: 'dino' | 'cat' | 'dog' | 'bear';
}

export interface AvatarDef {
  id: AvatarId;
  /** The character's own name. */
  name: string;
  /** What kind of friend it is (Dino, Cat, Dog, Bear). */
  species: string;
  /** Said in this avatar's voice when the child picks it. */
  intro: string;
  tagline: string;
  skin: Skin;
  /** This buddy's own special move, shown when it is picked and now and then on Home. */
  special: { state: 'FLYING' | 'SOMERSAULT' | 'TAILCHASE' | 'BEARHUG'; ms: number; label: string };
  /** Which animation states exist for this avatar and how. All use the shared rig with this skin. */
  animations: Record<AvatarState, 'rig'>;
}

const anim = { idle: 'rig', speaking: 'rig', singing: 'rig', dancing: 'rig', celebrating: 'rig', listening: 'rig' } as const;

export const AVATARS: Record<AvatarId, AvatarDef> = {
  dino: {
    special: { state: 'FLYING', ms: 3600, label: 'flies a loop' },
    id: 'dino', name: 'Zora', species: 'Dino', intro: "Hi! I'm Zora the dino!", tagline: 'A baby dragon who loves to dance!', animations: anim,
    skin: { bodyLight: '#FFB766', bodyMid: '#FF9638', bodyDark: '#E87A22', belly: '#FFE6BD', bellyLine: '#F5C98E', hand: '#FFEED2', arm: '#F58A2B', feet: '#E87A22',
      muzzle: '#FFCE94', nose: '#9A4E12', cheek: '#E88A93', inner: '#C99A6A', crest: '#2BB3A3', wings: true, horns: true, ears: 'none', face: 'dino', tail: 'dino' },
  },
  cat: {
    special: { state: 'SOMERSAULT', ms: 2300, label: 'does a somersault' },
    id: 'cat', name: 'Mimi', species: 'Cat', intro: "Hi! I'm Mimi the cat!", tagline: 'A cuddly kitten with a swishy tail!', animations: anim,
    skin: { bodyLight: '#9096B8', bodyMid: '#7A80A6', bodyDark: '#5F6588', belly: '#D9C3A0', bellyLine: '#C4AC88', hand: '#E3D2B2', arm: '#6F7599', feet: '#5F6588',
      muzzle: '#D9C3A0', nose: '#B04268', cheek: '#E8A0A8', inner: '#D6798F', crest: '#7A80A6', wings: false, horns: false, ears: 'pointy', face: 'cat', tail: 'cat' },
  },
  dog: {
    special: { state: 'TAILCHASE', ms: 3000, label: 'chases its tail' },
    id: 'dog', name: 'Bruno', species: 'Dog', intro: "Hi! I'm Bruno the dog!", tagline: 'A friendly pup with a wagging tail!', animations: anim,
    skin: { bodyLight: '#F0C98A', bodyMid: '#DDA95C', bodyDark: '#B9803A', belly: '#F8E9CC', bellyLine: '#E8D2A8', hand: '#FBEFD8', arm: '#D29C4E', feet: '#B9803A',
      muzzle: '#F8E9CC', nose: '#3A241A', cheek: '#F0A0A8', inner: '#9A6232', crest: '#9A6232', wings: false, horns: false, ears: 'floppy', face: 'dog', tail: 'dog' },
  },
  bear: {
    special: { state: 'BEARHUG', ms: 3600, label: 'thumps its chest and gives a big hug' },
    id: 'bear', name: 'Teddy', species: 'Bear', intro: "Hi! I'm Teddy the bear!", tagline: 'A big cuddly bear who loves hugs!', animations: anim,
    skin: { bodyLight: '#7A4C33', bodyMid: '#5C3825', bodyDark: '#442618', belly: '#D9BF99', bellyLine: '#C4A57C', hand: '#E3CBA4', arm: '#58341F', feet: '#442618',
      muzzle: '#D9BF99', nose: '#1F120C', cheek: '#D98A94', inner: '#C99A6A', crest: '#5C3825', wings: false, horns: false, ears: 'round', face: 'bear', tail: 'bear' },
  },
};

export function parseAvatarId(v: unknown): AvatarId {
  return typeof v === 'string' && (AVATAR_IDS as readonly string[]).includes(v) ? (v as AvatarId) : DEFAULT_AVATAR;
}

interface StorageLike { getItem(k: string): string | null; setItem(k: string, v: string): void }

/** Reads the saved avatar; any failure or invalid value falls back to Dino. */
export function loadAvatar(storage?: StorageLike | null): AvatarId {
  try { return parseAvatarId(storage ? storage.getItem(AVATAR_STORAGE_KEY) : null); } catch { return DEFAULT_AVATAR; }
}
export function saveAvatar(id: AvatarId, storage?: StorageLike | null): boolean {
  try { if (!storage) return false; storage.setItem(AVATAR_STORAGE_KEY, id); return true; } catch { return false; }
}

import type { CharacterState } from './types.ts';
/** Which of the six avatar animation states a character machine state belongs to. */
export function avatarStateOf(s: CharacterState): AvatarState {
  switch (s) {
    case 'SPEAKING': case 'POINTING': return 'speaking';
    case 'SINGING': return 'singing';
    case 'DANCING': case 'ROBOT_DANCE': case 'JUMPING': case 'SPINNING': case 'FLYING': case 'SOMERSAULT': case 'TAILCHASE': case 'BEARHUG': case 'CLAPPING': case 'WAVING': return 'dancing';
    case 'CELEBRATING': case 'HAPPY': case 'LAUGHING': return 'celebrating';
    case 'LISTENING': case 'THINKING': return 'listening';
    default: return 'idle';
  }
}
