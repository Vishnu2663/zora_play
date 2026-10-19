// Audio capability probe. Runs REAL playback in whatever runtime hosts the page
// (the Vega WebView on the simulator/device, or a desktop browser) and records
// what actually happened: events fired, time advanced, bytes loaded.
//
// Limits, stated honestly: a page cannot hear its own speaker. "pass" means the
// runtime reported successful playback (start/end events, advancing clock). A
// person listening must confirm it was audible. Results are shown on the
// Diagnostics screen and logged as `[milo-probe] {...}` for `vega` device logs.

export type ProbeStatus = 'pass' | 'fail' | 'unsupported' | 'skipped';
export interface ProbeResult { id: string; label: string; status: ProbeStatus; detail: string; ms: number }

const TONE = 'audio/probe/tone-440'; // relative to index.html => file:///pkg/assets/audio/probe/... on Vega

function timeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timed out after ${ms} ms waiting for ${what}`)), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

async function run(id: string, label: string, fn: () => Promise<{ status?: ProbeStatus; detail: string }>): Promise<ProbeResult> {
  const t0 = performance.now();
  try {
    const r = await fn();
    return { id, label, status: r.status ?? 'pass', detail: r.detail, ms: Math.round(performance.now() - t0) };
  } catch (e) {
    return { id, label, status: 'fail', detail: e instanceof Error ? e.message : String(e), ms: Math.round(performance.now() - t0) };
  }
}

/** Play a bundled file through HTMLAudioElement and wait for 'ended'. */
function playElement(src: string, mime: string) {
  return async () => {
    const a = new Audio();
    const can = a.canPlayType(mime);
    if (!can) return { status: 'unsupported' as const, detail: `canPlayType("${mime}") = ""` };
    a.preload = 'auto';
    a.src = src;
    let maxTime = 0;
    a.addEventListener('timeupdate', () => { maxTime = Math.max(maxTime, a.currentTime); });
    const ended = new Promise<void>((res, rej) => {
      a.addEventListener('ended', () => res(), { once: true });
      a.addEventListener('error', () => rej(new Error(`media error code ${a.error?.code ?? '?'}`)), { once: true });
    });
    await timeout(a.play(), 3000, 'play() promise');
    await timeout(ended, 4000, "'ended' event");
    const dur = Number.isFinite(a.duration) ? a.duration.toFixed(2) : String(a.duration);
    return { detail: `canPlayType=${can}; played to end; duration=${dur}s; max currentTime=${maxTime.toFixed(2)}s` };
  };
}

/** A tiny WAV generated in memory, played via a data: URI (no file access needed). */
function dataUriWav(): string {
  const rate = 8000, n = rate * 0.4;
  const buf = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buf);
  const w = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.sin((2 * Math.PI * 660 * i) / rate) * 8000 * Math.min(1, (n - i) / 400), true);
  let bin = '';
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return `data:audio/wav;base64,${btoa(bin)}`;
}

function getAC(): typeof AudioContext | undefined {
  const w = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
  return w.AudioContext ?? w.webkitAudioContext;
}

export async function runAudioProbe(onProgress?: (r: ProbeResult[]) => void): Promise<ProbeResult[]> {
  const results: ProbeResult[] = [];
  const push = (r: ProbeResult) => { results.push(r); onProgress?.([...results]); };

  // 1. speechSynthesis: real speak() with start/end events.
  push(await run('tts', 'speechSynthesis speaks', async () => {
    const ss = (window as unknown as { speechSynthesis?: SpeechSynthesis }).speechSynthesis;
    const U = (window as unknown as { SpeechSynthesisUtterance?: typeof SpeechSynthesisUtterance }).SpeechSynthesisUtterance;
    if (!ss || !U) return { status: 'unsupported', detail: 'window.speechSynthesis or SpeechSynthesisUtterance missing' };
    let voices = ss.getVoices();
    if (!voices.length) {
      await new Promise<void>((res) => { const t = setTimeout(res, 2000); ss.addEventListener?.('voiceschanged', () => { clearTimeout(t); res(); }, { once: true }); });
      voices = ss.getVoices();
    }
    const en = voices.filter((v) => v.lang?.toLowerCase().startsWith('en'));
    const u = new U('Hello! I am Zora Play.');
    u.lang = 'en-US';
    if (en[0]) u.voice = en[0];
    let started = 0;
    const done = new Promise<number>((res, rej) => {
      u.onstart = () => { started = performance.now(); };
      u.onend = () => res(performance.now());
      u.onerror = (e) => rej(new Error(`onerror: ${(e as SpeechSynthesisErrorEvent).error ?? 'unknown'}`));
    });
    ss.cancel();
    ss.speak(u);
    const end = await timeout(done, 8000, 'utterance onend');
    if (!started) return { status: 'fail', detail: `onend fired without onstart; voices=${voices.length}` };
    const spoke = end - started;
    if (spoke < 250) return { status: 'fail', detail: `ended after ${Math.round(spoke)} ms: too short to be speech; voices=${voices.length}` };
    return { detail: `voices=${voices.length} (en: ${en.length}${en[0] ? `, used "${en[0].name}"` : ''}); spoke ${Math.round(spoke)} ms` };
  }));

  // 2-4. Bundled files through <audio>.
  push(await run('audio-mp3', '<audio> plays bundled MP3', playElement(`${TONE}.mp3`, 'audio/mpeg')));
  push(await run('audio-wav', '<audio> plays bundled WAV', playElement(`${TONE}.wav`, 'audio/wav')));
  push(await run('audio-ogg', '<audio> plays bundled Ogg', playElement(`${TONE}.ogg`, 'audio/ogg; codecs="vorbis"')));

  // 5. data: URI (works even if file access is blocked).
  push(await run('audio-datauri', '<audio> plays data: URI WAV', playElement(dataUriWav(), 'audio/wav')));

  // 6. fetch() of a bundled file (needed for Web Audio decoding of clips).
  let mp3Bytes: ArrayBuffer | null = null;
  push(await run('fetch', 'fetch() reads bundled file', async () => {
    const r = await timeout(fetch(`${TONE}.mp3`), 3000, 'fetch');
    mp3Bytes = await r.arrayBuffer();
    if (mp3Bytes.byteLength < 1000) return { status: 'fail', detail: `only ${mp3Bytes.byteLength} bytes` };
    return { detail: `status=${r.status || '(file)'} bytes=${mp3Bytes.byteLength}` };
  }));

  // 7. Web Audio: context runs and its clock advances while an oscillator plays.
  let ctx: AudioContext | null = null;
  push(await run('webaudio-osc', 'Web Audio plays a tone', async () => {
    const AC = getAC();
    if (!AC) return { status: 'unsupported', detail: 'no AudioContext' };
    ctx = new AC();
    await timeout(ctx.resume(), 2000, 'resume()');
    const t0 = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    g.gain.value = 0.15;
    o.frequency.value = 520;
    o.connect(g).connect(ctx.destination);
    const ended = new Promise<void>((res) => { o.onended = () => res(); });
    o.start();
    o.stop(ctx.currentTime + 0.4);
    await timeout(ended, 2000, 'oscillator onended');
    const adv = ctx.currentTime - t0;
    if (ctx.state !== 'running' || adv < 0.3) return { status: 'fail', detail: `state=${ctx.state}, clock advanced ${adv.toFixed(2)} s` };
    return { detail: `state=${ctx.state}, sampleRate=${ctx.sampleRate}, clock advanced ${adv.toFixed(2)} s` };
  }));

  // 8. Web Audio decode of the fetched MP3.
  push(await run('webaudio-decode', 'Web Audio decodes bundled MP3', async () => {
    if (!ctx) return { status: 'skipped', detail: 'no running AudioContext' };
    if (!mp3Bytes) return { status: 'skipped', detail: 'fetch failed, nothing to decode' };
    const c = ctx as AudioContext;
    const b = await timeout(c.decodeAudioData((mp3Bytes as ArrayBuffer).slice(0)), 3000, 'decodeAudioData');
    return { detail: `decoded ${b.duration.toFixed(2)} s, ${b.numberOfChannels} ch @ ${b.sampleRate} Hz` };
  }));
  try { await (ctx as AudioContext | null)?.close(); } catch { /* ignore */ }

  // 9. localStorage (needed to remember the chosen character).
  push(await run('storage', 'localStorage persists values', async () => {
    const k = '__milo_probe__';
    const v = String(Date.now());
    window.localStorage.setItem(k, v);
    const back = window.localStorage.getItem(k);
    window.localStorage.removeItem(k);
    if (back !== v) return { status: 'fail', detail: `wrote ${v}, read ${back}` };
    return { detail: 'write/read/remove OK (persistence across app restarts: check after relaunch)' };
  }));

  const summary = { ua: navigator.userAgent, results };
  console.info('[milo-probe]', JSON.stringify(summary));
  return results;
}
