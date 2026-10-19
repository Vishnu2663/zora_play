#!/usr/bin/env python3
"""Drop-in for the Piper CLI used by scripts/gen-voice.py: `--model M --output_file out.wav`, text on stdin."""
import os, sys, wave
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from piper_lite import Voice
a = sys.argv[1:]
model = a[a.index('--model') + 1]; out = a[a.index('--output_file') + 1]
v = Voice(model)
if '--length_scale' in a: v.scales[1] = float(a[a.index('--length_scale') + 1])
audio, sr = v.synth(sys.stdin.read().strip())
with wave.open(out, 'wb') as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr); w.writeframes((np.clip(audio, -1, 1) * 32767).astype(np.int16).tobytes())
