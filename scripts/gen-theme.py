#!/usr/bin/env python3
"""Renders the energetic Home theme loop: public/audio/music/home-theme.mp3 (original, generated, CC0).
126 bpm, 8 bars, C - G - Am - F (twice): four-on-the-floor kick, claps, hi-hats, bouncy bass, chord stabs, a catchy
pentatonic hook and a bell sparkle. Notes wrap round the end of the loop, so it repeats without a bump.
Usage: python3 scripts/gen-theme.py   (needs numpy + ffmpeg)"""
import os, subprocess, tempfile, wave
import numpy as np

SR = 44100
BPM = 126
BEAT = 60 / BPM
BARS = 8
L = int(SR * BEAT * 4 * BARS)
buf = np.zeros(L, np.float32)

def hz(n):  # midi -> Hz
    return 440 * 2 ** ((n - 69) / 12)

def add(x, at_beats, gain=1.0):
    i = int(at_beats * BEAT * SR)
    idx = (np.arange(len(x)) + i) % L        # wrap round the loop end
    np.add.at(buf, idx, x * gain)

def env(n, a=0.005, d=3.0):
    t = np.arange(n) / SR
    return np.minimum(1, t / a) * np.exp(-t * d)

def tone(f, dur, shape='tri', a=0.005, d=3.0):
    n = int(dur * SR); t = np.arange(n) / SR
    if shape == 'tri': w = 2 / np.pi * np.arcsin(np.sin(2 * np.pi * f * t))
    elif shape == 'saw': w = 2 * ((f * t) % 1) - 1
    elif shape == 'sq': w = np.sign(np.sin(2 * np.pi * f * t)) * 0.6
    else: w = np.sin(2 * np.pi * f * t)
    return (w * env(n, a, d)).astype(np.float32)

def kick():
    n = int(0.28 * SR); t = np.arange(n) / SR
    f = 150 * np.exp(-t * 18) + 42
    return (np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 11)).astype(np.float32)

rng = np.random.default_rng(7)
def noise(dur, hp=0.0, d=40):
    n = int(dur * SR); w = rng.standard_normal(n).astype(np.float32)
    if hp: w = w - np.convolve(w, np.ones(int(hp)) / hp, 'same')
    return w * np.exp(-np.arange(n) / SR * d)

chords = [(48, [60, 64, 67]), (43, [59, 62, 67]), (45, [57, 60, 64]), (41, [57, 60, 65])]  # (bass root, chord)
for bar in range(BARS):
    root, ch = chords[(bar // 2) % 4]
    b0 = bar * 4
    for beat in range(4):
        add(kick(), b0 + beat, 0.9)                                   # kick on every beat
        if beat in (1, 3):                                             # clap on 2 and 4
            add(noise(0.16, 30, 22) * 0.5, b0 + beat, 0.55); add(tone(190, 0.1, 'sin', d=30), b0 + beat, 0.08)
        add(noise(0.05, 12, 90), b0 + beat + 0.5, 0.22)               # off-beat hat
        add(noise(0.03, 12, 120), b0 + beat + 0.25, 0.08); add(noise(0.03, 12, 120), b0 + beat + 0.75, 0.08)
        # bouncy bass: root on the beat, octave on the 'and'
        add(tone(hz(root), 0.22, 'saw', d=9), b0 + beat, 0.20)
        add(tone(hz(root + 12), 0.16, 'saw', d=12), b0 + beat + 0.5, 0.13)
        # chord stab on the off-beat
        for n in ch: add(tone(hz(n), 0.2, 'sq', a=0.004, d=10), b0 + beat + 0.5, 0.045)
# the hook (C major pentatonic), two 4-bar phrases that answer each other
hook = [(0, 76, .5), (.5, 79, .5), (1, 81, 1), (2.5, 79, .5), (3, 76, 1),
        (4, 74, .5), (4.5, 76, .5), (5, 79, 1.5), (7, 76, .5), (7.5, 74, .5),
        (8, 72, .5), (8.5, 74, .5), (9, 76, 1), (10.5, 79, .5), (11, 81, 1),
        (12, 79, .5), (12.5, 76, .5), (13, 74, 1), (14, 72, 2)]
for start in (0, 16):
    for b, n, d in hook:
        add(tone(hz(n), d * BEAT * 0.95 + 0.25, 'tri', a=0.006, d=4.5), start + b, 0.17)
        add(tone(hz(n + 12), 0.5, 'sin', a=0.002, d=7), start + b, 0.035)   # bell sparkle
# gentle sidechain pump so the kick breathes
pump = np.ones(L, np.float32)
for beat in range(BARS * 4):
    i = int(beat * BEAT * SR); m = int(0.16 * SR)
    pump[i:i + m] = np.minimum(pump[i:i + m], np.linspace(0.55, 1, m))
mix = buf * pump
mix = np.tanh(mix * 1.5) / np.tanh(1.5)
mix = mix / max(1e-6, np.abs(mix).max()) * 0.9
out = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'public/audio/music')
os.makedirs(out, exist_ok=True)
with tempfile.TemporaryDirectory() as t:
    w = os.path.join(t, 'a.wav')
    with wave.open(w, 'wb') as f:
        f.setnchannels(1); f.setsampwidth(2); f.setframerate(SR); f.writeframes((mix * 32767).astype(np.int16).tobytes())
    subprocess.run(['ffmpeg', '-y', '-v', 'error', '-i', w, '-af', 'loudnorm=I=-16:TP=-1.5:LRA=7', '-ac', '1', '-codec:a', 'libmp3lame', '-b:a', '96k', os.path.join(out, 'home-theme.mp3')], check=True)
print('wrote home-theme.mp3', round(L / SR, 2), 's')
