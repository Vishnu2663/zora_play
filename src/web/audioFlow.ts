// One shared tv-audio-flow channel for every spoken/recorded sequence in the app (rhyme intro + song,
// animal questions, alphabet). Starting any sequence cancels the one that was playing, and navigation
// cancels whatever is left, so two sequences can never be heard at once.
import { AudioChannel } from 'tv-audio-flow';

export const audioChannel = new AudioChannel({ policy: 'interrupt' });
