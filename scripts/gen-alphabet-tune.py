#!/usr/bin/env python3
"""Renders the Alphabets background tune: public/audio/music/alphabet-tune.mp3 (original, generated, CC0).
Gentle, playful 104 bpm marimba tune over C - Am - F - G with a soft shaker and a bouncing bass; 8 bars, loops without a bump.
Usage: python3 scripts/gen-alphabet-tune.py   (needs numpy + ffmpeg)"""
import os, subprocess, tempfile, wave
import numpy as np

SR = 44100
BPM = 104
BEAT = 60 / BPM
BARS = 8
L = int(SR * BEAT * 4 * BARS)
buf = np.zeros(L, np.float32)
rng = np.random.default_rng(3)

def hz(n): return 440 * 2 ** ((n - 69) / 12)

def add(x, at_beats, gain=1.0):
    i = int(at_beats * BEAT * SR)
    np.add.at(buf, (np.arange(len(x)) + i) % L, x * gain)

def marimba(f, dur=0.6):
    n = int(dur * SR); t = np.arange(n) / SR
    w = np.sin(2 * np.pi * f * t) + 0.35 * np.sin(2 * np.pi * f * 4.0 * t) * np.exp(-t * 30) + 0.2 * np.sin(2 * np.pi * f * 2 * t)
    return (w * np.minimum(1, t / 0.003) * np.exp(-t * 6)).astype(np.float32)

def soft(f, dur, d=2.5):
    n = int(dur * SR); t = np.arange(n) / SR
    return (np.sin(2 * np.pi * f * t) * np.minimum(1, t / 0.03) * np.exp(-t * d)).astype(np.float32)

def shaker():
    n = int(0.05 * SR); w = rng.standard_normal(n).astype(np.float32)
    w = w - np.convolve(w, np.ones(10) / 10, 'same')
    return w * np.exp(-np.arange(n) / SR * 80)

prog = [(48, [60, 64, 67]), (45, [57, 60, 64]), (41, [57, 60, 65]), (43, [55, 59, 62])]
for bar in range(BARS):
    root, ch = prog[(bar // 2) % 4]
    b0 = bar * 4
    for beat in range(4):
        add(shaker(), b0 + beat + 0.5, 0.18)
        if beat % 2 == 0: add(soft(hz(root), 0.5, 5), b0 + beat, 0.28)            # bass on 1 and 3
        else: add(soft(hz(root + 7), 0.35, 7), b0 + beat, 0.16)                     # fifth on 2 and 4
    for n in ch: add(soft(hz(n), 1.6, 1.8), b0, 0.05)                              # warm pad per bar
# the tune: a bouncy stepwise pentatonic melody (C D E G A), answering phrases
tune = [(0, 72, .5), (.5, 74, .5), (1, 76, 1), (2, 74, .5), (2.5, 72, .5), (3, 69, 1),
        (4, 67, .5), (4.5, 69, .5), (5, 72, 1), (6, 74, 1), (7, 72, 1),
        (8, 69, .5), (8.5, 72, .5), (9, 74, 1), (10, 72, .5), (10.5, 69, .5), (11, 67, 1),
        (12, 69, .5), (12.5, 67, .5), (13, 64, 1), (14, 67, 1), (15, 72, 1)]
for start in (0, 16):
    for b, n, d in tune:
        add(marimba(hz(n), 0.8), start + b, 0.3)
        add(marimba(hz(n + 12), 0.4), start + b + 0.25 * 0, 0.06)
mix = np.tanh(buf * 1.4) / np.tanh(1.4)
mix = mix / max(1e-6, np.abs(mix).max()) * 0.9
out = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'public/audio/music')
os.makedirs(out, exist_ok=True)
with tempfile.TemporaryDirectory() as t:
    w = os.path.join(t, 'a.wav')
    with wave.open(w, 'wb') as f:
        f.setnchannels(1); f.setsampwidth(2); f.setframerate(SR); f.writeframes((mix * 32767).astype(np.int16).tobytes())
    subprocess.run(['ffmpeg', '-y', '-v', 'error', '-i', w, '-af', 'loudnorm=I=-17:TP=-1.5:LRA=7', '-ac', '1', '-codec:a', 'libmp3lame', '-b:a', '96k', os.path.join(out, 'alphabet-tune.mp3')], check=True)
print('wrote alphabet-tune.mp3', round(L / SR, 2), 's')
