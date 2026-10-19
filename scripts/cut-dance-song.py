#!/usr/bin/env python3
"""Prepares one of the owner's own songs as a looping dance track: ONE seamless loop of the whole song.

Usage: python3 scripts/cut-dance-song.py "/path/to/song.mp3" [name] [bars]
  Dance Studio:  "Wiggle with Milo.mp3"       song   (default name, 20 bars)
  Dance Maker:   "Silly Face, Silly Toes.mp3" maker  (as many whole bars as fit)
Writes public/audio/music/dance-<name>.mp3: a whole number of bars (found from the song's own beat, about 108 bpm) with
the end crossfaded into the start, so the loop has no click or gap.
"""
import subprocess, sys, tempfile, wave
from pathlib import Path
import numpy as np

SRC = sys.argv[1]
OUT = Path(__file__).resolve().parent.parent / 'public/audio/music'
NAMES = [sys.argv[2] if len(sys.argv) > 2 else 'song']   # one loop for every dance style
BARS_ARG = sys.argv[3] if len(sys.argv) > 3 else '20'
XFADE = 0.05

tmp = Path(tempfile.mkdtemp())
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', SRC, '-ac', '2', '-ar', '44100', str(tmp / 'full.wav')], check=True)
def read(p):
    w = wave.open(str(p)); sr = w.getframerate(); ch = w.getnchannels()
    return np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float64).reshape(-1, ch) / 32768, sr
x, sr = read(tmp / 'full.wav')
mono = x.mean(axis=1)

# tempo + beat phase from the onset envelope
hop = 512
env = np.array([np.sqrt(np.mean(mono[i * hop:(i + 1) * hop] ** 2)) for i in range(len(mono) // hop)])
on = np.maximum(0, np.diff(env)); on -= np.convolve(on, np.ones(20) / 20, 'same'); on = np.maximum(on, 0)
fps = sr / hop
ac = np.correlate(on, on, 'full')[len(on) - 1:]
lo, hi = int(fps * 60 / 140), int(fps * 60 / 80)
lag = lo + int(np.argmax(ac[lo:hi]))
beat = lag / fps
phase = max(range(lag), key=lambda p: on[p::lag].sum())
bar = beat * 4
# the first bar line: the beat phase, moved to the strongest of the first four beats
cands = [phase / fps + k * beat for k in range(4)]
t0 = max(cands, key=lambda t: on[int(t * fps):int(t * fps) + 2].sum() if int(t * fps) + 2 < len(on) else 0)
print(f'beat {beat:.3f}s ({60 / beat:.1f} bpm), bar {bar:.3f}s, first bar line {t0:.2f}s')

total = len(x) / sr
BARS = int((total - t0 - XFADE) // bar) if BARS_ARG == 'auto' else int(BARS_ARG)
seg = bar * BARS
if t0 + seg + XFADE > total:
    t0 = max(0.0, total - XFADE - seg)
OUT.mkdir(parents=True, exist_ok=True)
for i, name in enumerate(NAMES):
    s = int(round((t0 + i * seg) * sr)); e = int(round((t0 + (i + 1) * seg) * sr)); f = int(XFADE * sr)
    part = x[s:e].copy()
    fade = np.linspace(0, 1, f)[:, None]
    part[:f] = part[:f] * fade + x[e:e + f] * (1 - fade)   # the tail flows into the head: seamless loop
    wav = tmp / f'{name}.wav'
    with wave.open(str(wav), 'wb') as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(sr); w.writeframes((np.clip(part, -1, 1) * 32767).astype(np.int16).tobytes())
    mp3 = OUT / f'dance-{name}.mp3'
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(wav), '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11', '-ar', '44100', '-c:a', 'libmp3lame', '-b:a', '128k', str(mp3)], check=True)
    print(f'{mp3.name}: {(e - s) / sr:.2f}s from {t0 + i * seg:.2f}s')
