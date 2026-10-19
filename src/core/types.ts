// Shared types for Milo's platform-agnostic core.
// Uses string unions (not TS enums) so files run under Node's type stripping.

export type Intent =
  | 'DANCE'
  | 'SING'
  | 'JUMP'
  | 'WAVE'
  | 'CLAP'
  | 'SPIN'
  | 'SLEEP'
  | 'WAKE'
  | 'LAUGH'
  | 'SAY'
  | 'PLAY'
  | 'BREATHE'
  | 'AGAIN'
  | 'FASTER'
  | 'SLOWER'
  | 'STOP'
  | 'PAUSE'
  | 'RESUME'
  | 'SURPRISE'
  | 'HELP'
  | 'GREET'
  | 'FEELING'
  | 'PRIVATE' // child tried to share personal info — never stored
  | 'CLARIFY' // ambiguous: ask the child to pick
  | 'UNKNOWN';

export type DanceStyle = 'normal' | 'robot' | 'funny' | 'slow';
export type GameId = 'shape' | 'simon' | 'animal' | 'maker';
export type Feeling = 'sad' | 'happy' | 'scared' | 'angry' | 'tired' | 'bored';

export interface CommandParams {
  style?: DanceStyle;
  speed?: 'faster' | 'slower';
  game?: GameId;
  phrase?: string; // only ever an entry from the approved phrase list
  feeling?: Feeling;
  again?: boolean;
  options?: Intent[]; // for CLARIFY
}

export interface ParsedCommand {
  intent: Intent;
  params: CommandParams;
  confidence: number; // 0..1
}

export type CharacterState =
  | 'IDLE'
  | 'LISTENING'
  | 'THINKING'
  | 'SPEAKING'
  | 'HAPPY'
  | 'LAUGHING'
  | 'DANCING'
  | 'ROBOT_DANCE'
  | 'SINGING'
  | 'JUMPING'
  | 'WAVING'
  | 'CLAPPING'
  | 'SPINNING'
  | 'SIDESTEPPING'
  | 'HANDSUP'
  | 'POINTING'
  | 'FLYING'
  | 'SOMERSAULT'
  | 'TAILCHASE'
  | 'BEARHUG'
  | 'BOUNCING'
  | 'SLEEPING'
  | 'CELEBRATING'
  | 'CONFUSED'
  | 'SUPPORTIVE'
  | 'BREATHING'
  | 'STOPPING';

export type Screen =
  | 'home'
  | 'dance'
  | 'rhymes'
  | 'play'
  | 'shape'
  | 'simon'
  | 'animal'
  | 'maker'
  | 'talk'
  | 'alphabets'
  | 'band'
  | 'avatar'
  | 'breathe'
  | 'help'
  | 'parents'
  | 'diagnostics';

export type Mood = 'calm' | 'happy' | 'excited' | 'sleepy' | 'caring' | 'puzzled';
