// Renders the Band instrument notes to small audio files (public/audio/band/<instrument>-<Hz>.mp3).
// The Band used to synthesize these live with Web Audio, which some TV WebViews (the Vega one) do not provide;
// plain <audio> files play everywhere. Same recipes as before: layered oscillators, a plucked string, noise bursts.
// Run: node scripts/make-instruments.mjs   (needs ffmpeg)
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { INSTRUMENTS, INSTRUMENT_TUNE, instrumentNote } from '../src/core/band.ts';

const SR = 22050, OUT = 'public/audio/band';
mkdirSync(OUT, { recursive: true });
const osc = { sine: (p) => Math.sin(p), triangle: (p) => 2 / Math.PI * Math.asin(Math.sin(p)), sawtooth: (p) => 2 * ((p / (2 * Math.PI)) % 1) - 1, square: (p) => (Math.sin(p) >= 0 ? 1 : -1) };
let seed = 7; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;

function lowpass(buf, hz) { const a = 1 - Math.exp(-2 * Math.PI * hz / SR); let y = 0; for (let i = 0; i < buf.length; i++) { y += a * (buf[i] - y); buf[i] = y; } }
function tone(out, o) {
  const n = Math.floor(o.dur * SR), at = Math.floor((o.at ?? 0) * SR), b = new Float32Array(n);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    let f = o.freq; if (o.to) f = o.freq * Math.pow(o.to / o.freq, t / o.dur);
    if (o.vibrato) f += o.vibrato * Math.sin(2 * Math.PI * 6 * t);
    ph += 2 * Math.PI * f / SR;
    const atk = o.attack ?? 0.01, peak = o.gain ?? 0.3;
    const env = t < atk ? peak * Math.pow(0.0001 / peak, 1 - t / atk) : peak * Math.pow(0.0001 / peak, (t - atk) / Math.max(0.001, o.dur - atk));
    b[i] = osc[o.type ?? 'sine'](ph) * env;
  }
  if (o.filter) lowpass(b, o.filter);
  for (let i = 0; i < n && at + i < out.length; i++) out[at + i] += b[i];
}
function noise(out, o) {
  const n = Math.floor(o.dur * SR), at = Math.floor((o.at ?? 0) * SR), b = new Float32Array(n);
  for (let i = 0; i < n; i++) b[i] = rnd() * (o.gain ?? 0.4) * Math.pow(0.0001 / (o.gain ?? 0.4), i / n);
  // crude band-pass: high-pass minus low-pass around the centre
  const lo = new Float32Array(b), hi = new Float32Array(b);
  lowpass(lo, (o.freq ?? 1500) * 1.5); lowpass(hi, (o.freq ?? 1500) * 0.6);
  for (let i = 0; i < n && at + i < out.length; i++) out[at + i] += (lo[i] - hi[i]) * 2;
}
function pluck(out, freq, dur, gain, at = 0) {
  const len = Math.floor(SR * dur), N = Math.max(2, Math.round(SR / freq)), d = new Float32Array(len);
  for (let i = 0; i < N && i < len; i++) d[i] = rnd();
  for (let i = N; i < len; i++) d[i] = 0.497 * (d[i - N] + d[i - N + 1]);
  for (let i = 0; i < Math.min(N, len); i++) d[i] *= i / N;
  const s = Math.floor(at * SR);
  for (let i = 0; i < len && s + i < out.length; i++) out[s + i] += d[i] * gain * 2.2;
}

function render(id, f) {
  const out = new Float32Array(Math.floor(SR * 2.1));
  switch (id) {
    case 'piano': tone(out, { freq: f, dur: 1.4, type: 'triangle', gain: 0.3, attack: 0.004, filter: 2600 }); tone(out, { freq: f * 2, dur: 0.6, gain: 0.09, attack: 0.004 }); tone(out, { freq: f * 3, dur: 0.25, gain: 0.04, attack: 0.003 }); break;
    case 'guitar': pluck(out, f, 1.6, 0.5); break;
    case 'xylo': tone(out, { freq: f, dur: 0.7, gain: 0.32, attack: 0.002 }); tone(out, { freq: f * 3.93, dur: 0.12, gain: 0.08, attack: 0.001 }); noise(out, { dur: 0.02, freq: 3500, gain: 0.08 }); break;
    case 'trumpet': tone(out, { freq: f * 0.97, to: f, dur: 0.06, type: 'sawtooth', gain: 0.1, attack: 0.02, filter: 1400 }); tone(out, { freq: f, dur: 0.75, type: 'sawtooth', gain: 0.17, attack: 0.04, filter: 2200, vibrato: f * 0.012 }); tone(out, { freq: f * 2, dur: 0.6, type: 'square', gain: 0.025, attack: 0.05, filter: 3000 }); break;
    case 'drum': tone(out, { freq: f * 0.9, to: f * 0.42, dur: 0.38, gain: 0.55, attack: 0.002 }); tone(out, { freq: f * 1.8, to: f * 0.9, dur: 0.12, type: 'triangle', gain: 0.15, attack: 0.001 }); noise(out, { dur: 0.05, freq: 1800, gain: 0.22 }); break;
    case 'flute': tone(out, { freq: f, dur: 0.95, gain: 0.24, attack: 0.09, vibrato: f * 0.007 }); tone(out, { freq: f * 2, dur: 0.6, gain: 0.035, attack: 0.1 }); noise(out, { dur: 0.55, freq: f * 2.2, gain: 0.04 }); break;
    case 'harp': pluck(out, f, 2.0, 0.42); tone(out, { freq: f * 2, dur: 1.1, gain: 0.04, attack: 0.004 }); break;
    case 'maracas': noise(out, { at: 0, dur: 0.07, freq: 6500, gain: 0.24 }); noise(out, { at: 0.1, dur: 0.09, freq: 7200, gain: 0.2 }); break;
    case 'bells': tone(out, { freq: f, dur: 1.8, gain: 0.2, attack: 0.002 }); tone(out, { freq: f * 2.76, dur: 0.7, gain: 0.07, attack: 0.002 }); tone(out, { freq: f * 5.4, dur: 0.25, gain: 0.035, attack: 0.001 }); break;
    case 'tambourine': noise(out, { at: 0, dur: 0.14, freq: 8200, gain: 0.26 }); noise(out, { at: 0.03, dur: 0.1, freq: 5200, gain: 0.12 }); tone(out, { freq: 320, to: 200, dur: 0.06, type: 'triangle', gain: 0.07, attack: 0.002 }); break;
  }
  return out;
}

const tmp = `${OUT}/_tmp.wav`;
for (const inst of INSTRUMENTS) {
  const pitched = !['maracas', 'tambourine'].includes(inst.id);
  const freqs = pitched ? [...new Set(INSTRUMENT_TUNE.map((_, i) => Math.round(instrumentNote(inst.id, i))))] : [0];
  for (const hz of freqs) {
    const f = pitched ? instrumentNote(inst.id, INSTRUMENT_TUNE.findIndex((_, i) => Math.round(instrumentNote(inst.id, i)) === hz)) : 440;
    const s = render(inst.id, f);
    let peak = 0, last = s.length; for (let i = 0; i < s.length; i++) peak = Math.max(peak, Math.abs(s[i]));
    while (last > 1 && Math.abs(s[last - 1]) < 0.002) last--;
    const n = Math.min(s.length, last + 200), gain = 0.9 / (peak || 1), pcm = Buffer.alloc(n * 2);
    for (let i = 0; i < n; i++) pcm.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(s[i] * gain * 32767))), i * 2);
    const h = Buffer.alloc(44); h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVEfmt ', 8); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(SR, 24); h.writeUInt32LE(SR * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
    writeFileSync(tmp, Buffer.concat([h, pcm]));
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', tmp, '-codec:a', 'libmp3lame', '-b:a', '64k', `${OUT}/${inst.id}-${hz}.mp3`]);
  }
}
rmSync(tmp, { force: true });
console.log('done');
