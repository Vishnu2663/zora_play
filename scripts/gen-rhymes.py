#!/usr/bin/env python3
"""Renders every rhyme for EVERY avatar voice: public/audio/rhymes/<avatar>/<id>.mp3, plus one lyric-timing file
public/audio/rhymes/<id>.json holding the word timings of every avatar (under "avatars"; the top-level "lines" are the
default avatar's, for older readers).

RHYTHMIC CHANT vocals, chosen for clarity: each lyric LINE is spoken whole by Piper, so words keep their natural
flow, then run through the exact ffmpeg profile chain scripts/gen-voice.py uses for dialogue. The buddy therefore
sings in the very same voice it talks in. Lines are fitted to their bar by Piper's own speaking rate (natural slow
speech, not stretching); only a line that is still too long is time-compressed a little (pitch kept).
Music: a generated backing band (ukulele chords fitted to the melody, bass, glockenspiel playing the tune,
drums), styled per rhyme (see backing()), one bar of intro and a ringing last chord, mixed under the voice.

Word timings: Piper's base model gives no alignments, so each word boundary is estimated from the word's own
spoken length and snapped to the quietest point nearby (the gap between words).

Env PIPER_MODEL = path to the .onnx (its .onnx.json next to it). Env FFMPEG = ffmpeg binary (optional).
Requires: numpy, and either the piper-tts package or (fallback) onnxruntime + espeak-ng for scripts/piper_lite.py;
ffmpeg on PATH, in FFMPEG, or from the imageio-ffmpeg package.
Usage: python3 scripts/gen-rhymes.py [rhyme-id ...]      (env AVATARS=dino,cat to limit voices)
"""
import json, os, shutil, subprocess, sys, tempfile, wave
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'public/audio/rhymes')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
PROFILES = json.load(open(os.path.join(ROOT, 'voice/profiles.json')))['characters']
DEFAULT_AVATAR = 'dino'
OUT_SR = 44100
SEMI = {'C': -9, 'D': -7, 'E': -5, 'F': -4, 'G': -2, 'A': 0, 'B': 2}
VOCAL_RMS = 0.11      # every line at the same level
FIT = 0.9             # a spoken line fills this share of its bar; the rest is a breath before the next line
SLOWEST, FASTEST = 1.55, 0.85  # Piper length_scale range: slower is clearer for kids, past ~1.6 it drags


def ffmpeg_exe():
    exe = os.environ.get('FFMPEG') or shutil.which('ffmpeg')
    if exe: return exe
    import imageio_ffmpeg
    return imageio_ffmpeg.get_ffmpeg_exe()

FFMPEG = ffmpeg_exe()

def run(*a): subprocess.run([FFMPEG, *a], check=True, capture_output=True)


class Tts:
    """Piper base voice. Uses the piper-tts package when it works, else the minimal piper_lite runner."""
    def __init__(self, model):
        self.model = model
        try:
            from piper import PiperVoice, SynthesisConfig
            self.voice, self.Cfg = PiperVoice.load(model), SynthesisConfig
            self.sr = self.voice.config.sample_rate
        except ImportError:
            from piper_lite import Voice
            self.voice, self.Cfg = None, None
            self.sr = Voice(model).sr

    def synth(self, text, length_scale=1.0):
        if self.voice is not None:
            chunks = self.voice.synthesize(text, syn_config=self.Cfg(length_scale=length_scale))
            return np.concatenate([c.audio_float_array for c in chunks]).astype(np.float32)
        from piper_lite import Voice
        return Voice(self.model, speed=1.0 / length_scale).synth(text)[0]

TTS = Tts(os.environ['PIPER_MODEL'])
SR = TTS.sr  # 22050


def freq(note):
    n, o = note[0], int(note[-1])
    return 440 * 2 ** ((SEMI[n] + (o - 4) * 12) / 12)

def read_wav(p):
    with wave.open(p) as w:
        return np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32) / 32768

def write_wav(p, x, sr=None):
    with wave.open(p, 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr or SR)
        w.writeframes((np.clip(x, -1, 1) * 32767).astype(np.int16).tobytes())

def profile_filter(pitch, tempo):
    """Identical to apply_profile() in scripts/gen-voice.py, so rhymes and dialogue are the same voice."""
    atempo = max(0.5, min(2.0, tempo / pitch))
    return (f"asetrate={int(SR * pitch)},aresample={SR},atempo={atempo:.4f},"
            "silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.05,"
            "areverse,silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.08,areverse,"
            "loudnorm=I=-18:TP=-2:LRA=11")

def wsola(x, factor, frame=None, search=None):
    """Waveform-similarity overlap-add time stretch: output length = len(x) * factor, pitch unchanged."""
    frame = frame or int(SR * 0.03); search = search or int(SR * 0.008)
    if abs(factor - 1) < 0.02 or len(x) < frame * 3: return x
    hop_out = frame // 2
    hop_in = hop_out / factor
    n_out = int(len(x) * factor)
    y = np.zeros(n_out + frame * 2, np.float32); norm = np.zeros_like(y)
    win = np.hanning(frame).astype(np.float32)
    y[:frame] += x[:frame] * win; norm[:frame] += win
    prev_in = 0
    k = 0
    while True:
        k += 1
        o = k * hop_out
        if o + frame >= len(y): break
        c = int(k * hop_in)
        lo, hi = max(0, c - search), min(len(x) - frame, c + search)
        if hi <= lo: break
        ref_at = prev_in + hop_out
        ref = x[ref_at:ref_at + frame] if ref_at + frame <= len(x) else x[lo:lo + frame]
        best, bs = lo, -1e18
        for s in range(lo, hi, 2):
            sc = float(np.dot(x[s:s + frame], ref))
            if sc > bs: bs, best = sc, s
        y[o:o + frame] += x[best:best + frame] * win; norm[o:o + frame] += win
        prev_in = best
    norm[norm < 1e-3] = 1
    return (y / norm)[:n_out]

def trim(x, thr=0.01):
    idx = np.where(np.abs(x) > thr)[0]
    return x[idx[0]:idx[-1] + 1] if len(idx) else x


CACHE = {}
def spoken(avatar, text, length_scale, tmp):
    """`text` in the avatar's dialogue voice at the given Piper speaking rate."""
    key = (avatar, text, round(length_scale, 3))
    if key not in CACHE:
        p = PROFILES[avatar]
        raw, out = os.path.join(tmp, 'raw.wav'), os.path.join(tmp, 'prof.wav')
        write_wav(raw, TTS.synth(text, length_scale))
        run('-y', '-v', 'error', '-i', raw, '-af', profile_filter(p['pitch'], p['tempo']), '-ac', '1', '-ar', str(SR), out)
        CACHE[key] = read_wav(out)
    return CACHE[key]

def word_bounds(avatar, words, x, length_scale, tmp):
    """Start/end sample of each word inside the spoken line `x`."""
    weights = [max(1, len(trim(TTS.synth(w, length_scale)))) for w in words]
    total = float(sum(weights)); n = len(x)
    w = int(SR * 0.015)
    env = np.convolve(np.abs(x), np.ones(w) / w, 'same')
    cuts, acc = [0], 0.0
    for wt in weights[:-1]:
        acc += wt
        guess = int(n * acc / total)
        r = int(min(SR * 0.09, n * 0.08))
        lo, hi = max(cuts[-1] + int(SR * 0.05), guess - r), min(n - int(SR * 0.05), guess + r)
        cuts.append(lo + int(np.argmin(env[lo:hi])) if hi > lo else max(cuts[-1] + 1, min(n - 1, guess)))
    cuts.append(n)
    return [(cuts[i], cuts[i + 1]) for i in range(len(words))]

def line_vocal(avatar, words, slot_s, tmp):
    """The spoken line fitted to its bar, its RMS level evened out, plus per-word (start, end) samples."""
    text = ' '.join(words)
    want = slot_s * FIT
    natural = len(spoken(avatar, text, 1.0, tmp)) / SR
    ls = min(SLOWEST, max(FASTEST, want / natural)) if natural > 0 else 1.0
    x = spoken(avatar, text, ls, tmp)
    if len(x) > slot_s * SR * 0.98: x = wsola(x, max(0.8, slot_s * SR * 0.96 / len(x)))
    bounds = word_bounds(avatar, words, x, ls, tmp)
    rms = float(np.sqrt(np.mean(x ** 2))) or 1e-4
    x = (x * (VOCAL_RMS / rms)).astype(np.float32)
    n = int(SR * 0.008)
    if len(x) > 2 * n: x[:n] *= np.linspace(0, 1, n); x[-n:] *= np.linspace(1, 0, n)
    return x, bounds

# ---- backing band: ukulele chords, bass, glockenspiel tune and light drums (all generated, original) ----
INTRO_BEATS, OUTRO_BEATS = 4, 3   # one bar of music before the singing, a ringing last chord after it
PC = {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}
CHORDS = {'C': ['C3', 'E3', 'G3', 'C4'], 'F': ['F3', 'A3', 'C4', 'F4'], 'G': ['G3', 'B3', 'D4', 'G4'],
          'Am': ['A3', 'C4', 'E4', 'A4'], 'Dm': ['D3', 'F3', 'A3', 'D4'], 'Em': ['E3', 'G3', 'B3', 'E4']}
PREFER = {'C': .3, 'G': .2, 'F': .2, 'Am': .1, 'Dm': 0, 'Em': 0}  # every rhyme is in C: home chords win ties
RNG = np.random.default_rng(7)
_PLUCK = {}

def add(buf, x, at):
    i = int(at * SR)
    if i >= len(buf): return
    j = min(len(buf), i + len(x)); buf[i:j] += x[:j - i]

def env(n, attack, decay):
    t = np.arange(n) / SR
    return (np.minimum(1, t / attack) * np.exp(-t * decay)).astype(np.float32)

def pluck(f, dur):
    """Karplus-Strong string: a warm ukulele pluck."""
    key = (round(f, 2), round(dur, 2))
    if key not in _PLUCK:
        N = max(2, int(SR / f)); L = int(SR * dur)
        y = np.zeros(L + N + 1, np.float32)
        y[:N] = np.convolve(RNG.uniform(-1, 1, N), [.5, .5], 'same')  # soft pick
        y[N] = y[0]
        n = N + 1
        while n < len(y):  # a block of up to N samples only reads samples written before it
            m = min(N, len(y) - n)
            y[n:n + m] = 0.498 * (y[n - N:n - N + m] + y[n - N - 1:n - N - 1 + m])
            n += m
        _PLUCK[key] = y[N:N + L] * env(L, 0.002, 1.2)
    return _PLUCK[key]

def bell(f, dur):
    """Glockenspiel: bright and short, an octave above the voice so it never covers the words."""
    n = int(SR * min(dur + 0.4, 1.2)); t = np.arange(n) / SR
    y = np.sin(2 * np.pi * f * t) + 0.3 * np.sin(2 * np.pi * f * 2.76 * t) * np.exp(-t * 9)
    return (y * env(n, 0.002, 4.5)).astype(np.float32)

def bass(f, dur):
    n = int(SR * dur * 0.9); t = np.arange(n) / SR
    y = np.sin(2 * np.pi * f * t) + 0.35 * np.sin(4 * np.pi * f * t)
    e = np.minimum(1, t / 0.008) * np.exp(-t * 2.2) * np.minimum(1, (n - np.arange(n)) / (SR * 0.03))
    return (y * e).astype(np.float32)

def kick():
    n = int(SR * 0.22); t = np.arange(n) / SR
    ph = 2 * np.pi * np.cumsum(50 + 90 * np.exp(-t * 30)) / SR  # pitch drops: a soft thump
    return (np.sin(ph) * env(n, 0.001, 16)).astype(np.float32)

def noise_hit(dur, decay, hp):
    n = int(SR * dur); x = RNG.standard_normal(n).astype(np.float32)
    k = max(1, int(SR / hp)); low = np.convolve(x, np.ones(k) / k, 'same')
    return ((x - low) * env(n, 0.001, decay)).astype(np.float32)  # high-passed noise

CLAP, HAT, SHAKE = noise_hit(0.16, 22, 1200), noise_hit(0.05, 70, 6000), noise_hit(0.09, 35, 4000)

def chord_at(events, b0, b1, prev):
    """Best-fitting chord for the melody notes sounding between beats b0 and b1."""
    w = {}
    for s, d, n in events:
        o = min(b1, s + d) - max(b0, s)
        if o > 0: w[PC[n[0]]] = w.get(PC[n[0]], 0) + o
    if not w: return prev
    def score(c):
        tones = {PC[t[0]] for t in CHORDS[c]}
        return (sum(v for p, v in w.items() if p in tones) - 0.6 * sum(v for p, v in w.items() if p not in tones)
                + 0.4 * w.get(PC[CHORDS[c][0][0]], 0) + PREFER[c] + (0.15 if c == prev else 0))
    return max(CHORDS, key=score)

def pad(f, dur):
    """Soft warm pad: slow swell, two slightly detuned voices (gently shimmering)."""
    n = int(SR * dur); t = np.arange(n) / SR
    y = sum(np.sin(2 * np.pi * f * k * dt * t) / k ** 1.4 for k in (1, 2, 3) for dt in (0.997, 1.003))
    e = np.minimum(1, t / 0.35) * np.minimum(1, (n - np.arange(n)) / (SR * 0.3))
    return (y * e * 0.5).astype(np.float32)

def snare():
    n = int(SR * 0.14); t = np.arange(n) / SR
    body = np.sin(2 * np.pi * 190 * t) * np.exp(-t * 40)
    return (noise_hit(0.14, 28, 1800) * 0.8 + body * 0.5).astype(np.float32)

SNARE = snare()

# Each rhyme gets the music that suits it; anything not listed falls back on its mood.
STYLE = {'dance': 'party', 'shapes': 'march', 'lantern': 'musicbox', 'clouds': 'dreamy', 'space': 'dreamy', 'kind': 'dreamy'}
MOOD_STYLE = {'bouncy': 'band', 'calm': 'dreamy', 'sleepy': 'musicbox'}
MUSIC_RMS = {'band': 0.34, 'party': 0.38, 'march': 0.34, 'dreamy': 0.28, 'musicbox': 0.26}  # music level vs the voice

def style_of(r): return STYLE.get(r['id']) or MOOD_STYLE.get(r.get('mood'), 'band')

def backing(r, spb, total):
    """The band as one track; the singing starts after INTRO_BEATS.
    band     - ukulele strums with an off-beat up-strum, bass with a walk-up, kick / clap / hi-hat
    party    - the band plus a four-on-the-floor kick and busier hi-hats, for dancing
    march    - snare on every beat with a roll into each bar, oom-pah bass, short strums
    dreamy   - soft swelling pads and a slow plucked arpeggio, kick only on the bar
    musicbox - a tinkling music-box arpeggio over a low hum, no drums (lullabies)"""
    style = style_of(r)
    events, beat = [], INTRO_BEATS
    for ln in r['lines']:
        for n, d in ln['notes']: events.append((beat, d, n)); beat += d
        beat += 1
    end = int(np.ceil(beat))
    music = np.zeros(int(total * SR), np.float32)
    chord = chord_at(events, INTRO_BEATS, INTRO_BEATS + 2, 'C')
    for k in range(end + 1):
        t = k * spb
        if k == end:  # final ringing chord on the home key
            home = [freq(n) for n in CHORDS['C']]
            if style == 'musicbox':
                for i, f in enumerate(home): add(music, bell(f * 4, spb * 2) * 0.5, t + i * 0.12)
            else:
                for i, f in enumerate(home): add(music, pluck(f, spb * OUTRO_BEATS) * 0.9, t + i * 0.03)
            if style == 'dreamy': add(music, sum(pad(f, spb * OUTRO_BEATS) for f in home[:3]) * 0.35, t)
            add(music, bass(freq('C3') / 2, spb * OUTRO_BEATS) * (0.6 if style == 'musicbox' else 1), t)
            break
        if k % 2 == 0 and k >= INTRO_BEATS: chord = chord_at(events, k, k + 2, chord)
        tones = [freq(n) for n in CHORDS[chord]]
        if style == 'musicbox':
            for h in (0, .5): add(music, bell(tones[(2 * k + int(h * 2)) % 4] * 4, spb) * 0.32, t + h * spb)
            if k % 4 == 0: add(music, pad(tones[0] / 2, spb * 4) * 0.5, t)
            continue
        if style == 'dreamy':
            if k % 2 == 0: add(music, sum(pad(f, spb * 2) for f in tones[:3]) * 0.3, t)
            add(music, pluck(tones[k % 4] * 2, spb * 1.5) * 0.45, t)
            if k % 4 == 0: add(music, bass(tones[0] / 2, spb * 3.5) * 0.8, t); add(music, kick() * 0.6, t)
            if k % 2 == 1: add(music, SHAKE * 0.14, t)
            continue
        if style == 'march':
            for i, f in enumerate(tones[:3]): add(music, pluck(f, spb * 0.7) * 0.6, t + i * 0.008)
            add(music, bass(tones[0] / 2 if k % 2 == 0 else tones[2] / 2, spb * 0.8), t)  # oom-pah
            add(music, SNARE * (0.45 if k % 4 == 0 else 0.3), t)
            if k % 4 == 3:
                for q in (0.5, 0.75): add(music, SNARE * 0.2, t + q * spb)  # roll into the next bar
            if k % 4 == 0: add(music, kick() * 0.8, t)
            continue
        # band / party
        for i, f in enumerate(tones): add(music, pluck(f, spb * 1.6) * 0.7, t + i * 0.012)
        for i, f in enumerate(tones[:0:-1]): add(music, pluck(f, spb * 0.6) * 0.35, t + spb / 2 + i * 0.01)
        if k % 2 == 0: add(music, bass(tones[0] / 2, spb), t)
        if k % 4 == 3: add(music, bass(tones[2] / 2, spb * 0.5) * 0.7, t + spb / 2)  # walk-up
        if style == 'party':
            add(music, kick(), t)
            if k % 2 == 1: add(music, CLAP * 0.6, t)
            for q in (0, .25, .5, .75): add(music, HAT * (0.22 if q in (0, .5) else 0.12), t + q * spb)
        else:
            if k % 2 == 0: add(music, kick() * 0.9, t)
            if k % 2 == 1: add(music, CLAP * 0.5, t)
            for q in (0, .5): add(music, HAT * (0.22 if q == 0 else 0.14), t + q * spb)
    for s, d, n in events:  # the tune on the glockenspiel (the music box plays it itself)
        add(music, bell(freq(n) * 2, d * spb) * (0.18 if style == 'musicbox' else 0.32), s * spb)
    return music, style

def render(avatar, r, tmp):
    spb = 60 / r['bpm']
    bars, beat = [], float(INTRO_BEATS)
    for ln in r['lines']:
        b = sum(d for _, d in ln['notes'])
        bars.append((beat * spb, b * spb)); beat += b + 1
    total = (np.ceil(beat) + OUTRO_BEATS) * spb + 0.8
    voc = np.zeros(int(total * SR), np.float32)
    lines = []
    for ln, (start, slot) in zip(r['lines'], bars):
        x, bounds = line_vocal(avatar, ln['words'], slot, tmp)
        add(voc, x, start)
        lines.append({'text': ' '.join(ln['words']), 'start': round(start, 3), 'end': round(start + len(x) / SR + 0.25, 3),
                      'words': [{'w': w, 's': round(start + a / SR, 3), 'e': round(start + b / SR, 3)} for w, (a, b) in zip(ln['words'], bounds)]})
    music, style = backing(r, spb, total)
    m_rms = float(np.sqrt(np.mean(music[np.abs(music) > 1e-3] ** 2))) or 1e-4
    mix = voc + music * (VOCAL_RMS * MUSIC_RMS[style] / m_rms)
    mix /= max(0.05, float(np.abs(mix).max())) / 0.9   # plain peak normalise: no limiter colouring the voice
    return mix, lines

def main():
    data = json.load(open(os.path.join(ROOT, 'voice/rhymes.json')))['rhymes']
    only = set(sys.argv[1:])
    avatars = [a for a in os.environ.get('AVATARS', ','.join(PROFILES)).split(',') if a]
    with tempfile.TemporaryDirectory() as tmp:
        for r in data:
            if only and r['id'] not in only: continue
            meta_path = os.path.join(OUT, r['id'] + '.json')
            meta = json.load(open(meta_path)) if os.path.exists(meta_path) else {}
            per = meta.get('avatars', {})
            for av in avatars:
                os.makedirs(os.path.join(OUT, av), exist_ok=True)
                mix, lines = render(av, r, tmp)
                w = os.path.join(tmp, 'mix.wav'); write_wav(w, mix)
                mp3 = os.path.join(OUT, av, r['id'] + '.mp3')
                run('-y', '-v', 'error', '-i', w, '-ar', str(OUT_SR), '-ac', '1', '-af', 'loudnorm=I=-15:TP=-1.5:LRA=7',
                    '-codec:a', 'libmp3lame', '-b:a', '96k', mp3)
                dur = len(mix) / SR
                per[av] = {'durationMs': int(dur * 1000), 'lines': lines}
                print(av, r['id'], round(dur, 1), 's', flush=True)
            base = per.get(DEFAULT_AVATAR) or next(iter(per.values()))
            meta = {'id': r['id'], 'title': r['title'], 'audio': f'audio/rhymes/{{avatar}}/{r["id"]}.mp3',
                    'durationMs': base['durationMs'], 'vocals': 'spoken-chant',
                    'voice': 'per-avatar profile on the Piper base voice (same chain as dialogue)',
                    'lines': base['lines'], 'avatars': per}
            json.dump(meta, open(meta_path, 'w'), indent=1)

if __name__ == '__main__': main()
