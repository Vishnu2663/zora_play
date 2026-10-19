// VoiceInputService — the seam where real speech recognition plugs in.
//
// Status (Oct 2026): we found no documented Vega API that gives an ordinary
// app microphone audio or transcripts, and the Alexa Voice Remote's mic button
// is handled by the system, not delivered to apps. So the shipped adapter is
// `UnavailableVoiceAdapter`, and children talk to Milo with the Talk Wheel
// (big phrase buttons that go through the exact same parser).
//
// To enable real voice later: implement VoiceAdapter with a verified platform
// API, keep audio on-device or send only what the platform permits, never keep
// recordings, and register it with `voice.use(adapter)`.

export type VoiceStatus = 'IDLE' | 'LISTENING' | 'PROCESSING' | 'RESULT_RECEIVED' | 'ERROR' | 'CANCELLED' | 'UNAVAILABLE';

export interface VoiceAdapter {
  readonly name: string;
  readonly available: boolean;
  start(onResult: (transcript: string) => void, onError: (msg: string) => void): void;
  stop(): void; // finish and deliver a result
  cancel(): void; // discard
}

export class UnavailableVoiceAdapter implements VoiceAdapter {
  readonly name = 'none';
  readonly available = false;
  start(_: (t: string) => void, onError: (m: string) => void) { onError('Voice input is not available on this device.'); }
  stop() {}
  cancel() {}
}

type Listener<T> = (v: T) => void;

export class VoiceInputService {
  private adapter: VoiceAdapter = new UnavailableVoiceAdapter();
  private status: VoiceStatus = 'UNAVAILABLE';
  private transcriptL = new Set<Listener<string>>();
  private errorL = new Set<Listener<string>>();
  private statusL = new Set<Listener<VoiceStatus>>();
  private timeout: ReturnType<typeof setTimeout> | null = null;

  use(a: VoiceAdapter) {
    this.cancelListening();
    this.adapter = a;
    this.setStatus(a.available ? 'IDLE' : 'UNAVAILABLE');
  }

  get available() { return this.adapter.available; }
  getStatus(): VoiceStatus { return this.status; }

  startListening() {
    if (!this.adapter.available) { this.setStatus('UNAVAILABLE'); return; }
    if (this.status === 'LISTENING') return;
    this.setStatus('LISTENING');
    // Never listen forever: hard 8 s cap.
    this.timeout = setTimeout(() => this.stopListening(), 8000);
    this.adapter.start(
      (t) => { this.clear(); this.setStatus('RESULT_RECEIVED'); for (const l of this.transcriptL) l(t); this.setStatus('IDLE'); },
      (m) => { this.clear(); this.setStatus('ERROR'); for (const l of this.errorL) l(m); this.setStatus(this.adapter.available ? 'IDLE' : 'UNAVAILABLE'); },
    );
  }

  stopListening() {
    if (this.status !== 'LISTENING') return;
    this.clear();
    this.setStatus('PROCESSING');
    this.adapter.stop();
  }

  cancelListening() {
    if (this.status !== 'LISTENING' && this.status !== 'PROCESSING') return;
    this.clear();
    this.adapter.cancel();
    this.setStatus('CANCELLED');
    this.setStatus(this.adapter.available ? 'IDLE' : 'UNAVAILABLE');
  }

  onTranscript(l: Listener<string>) { this.transcriptL.add(l); return () => this.transcriptL.delete(l); }
  onError(l: Listener<string>) { this.errorL.add(l); return () => this.errorL.delete(l); }
  onStatus(l: Listener<VoiceStatus>) { this.statusL.add(l); return () => this.statusL.delete(l); }

  private clear() { if (this.timeout) clearTimeout(this.timeout); this.timeout = null; }
  private setStatus(s: VoiceStatus) { this.status = s; for (const l of this.statusL) l(s); }
}

export const voice = new VoiceInputService();
