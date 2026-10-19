#!/usr/bin/env python3
"""Minimal Piper inference (onnxruntime + espeak-ng CLI) for machines where the piper-tts wheel's bundled
espeak data path is broken (observed on macOS arm64, piper-tts 1.3-1.8). Same model and voice as scripts/gen-voice.py.
Usage: from piper_lite import Voice; Voice(model_onnx).synth("Hello!")  -> float32 numpy array, sample_rate"""
import json, subprocess
import numpy as np
import onnxruntime as ort

class Voice:
    def __init__(self, model, speed=1.0, noise=0.667, noise_w=0.8):
        self.cfg = json.load(open(model + '.json', encoding='utf-8'))
        self.sess = ort.InferenceSession(model, providers=['CPUExecutionProvider'])
        self.sr = self.cfg['audio']['sample_rate']
        self.ids = self.cfg['phoneme_id_map']
        self.scales = np.array([noise, 1.0 / speed, noise_w], dtype=np.float32)

    def phonemes(self, text):
        out = subprocess.run(['espeak-ng', '-q', '--ipa', '-v', 'en-us', text], capture_output=True, text=True, check=True).stdout
        return ' '.join(l.strip() for l in out.splitlines() if l.strip()).replace('‍', '').replace('_', ' ')

    def synth(self, text):
        ph = self.phonemes(text)
        ids = list(self.ids['^'])
        for ch in ph:
            if ch in self.ids:
                ids += self.ids[ch] + self.ids['_']
        ids += self.ids['$']
        x = np.array([ids], dtype=np.int64)
        audio = self.sess.run(None, {'input': x, 'input_lengths': np.array([x.shape[1]], dtype=np.int64), 'scales': self.scales})[0]
        return np.squeeze(audio).astype(np.float32), self.sr
