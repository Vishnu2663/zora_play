#!/usr/bin/env python3
"""
Generate Milo's spoken dialogue clips OFFLINE with Piper TTS.

  voice/phrases.json  (npm run voice:phrases)  --->  public/audio/voice/<character>/<id>.mp3
                                                     public/audio/voice/clips.json      (index the app reads)
                                                     public/audio/voice/<character>/MANIFEST.json (license record per file)

Requirements (one-time, on the machine that runs this):
  pip install piper-tts                       # Piper, MIT license
  ffmpeg / ffprobe on PATH
  The voice model: download BOTH files of en_US-ljspeech-medium from
    https://huggingface.co/rhasspy/piper-voices/tree/main/en/en_US/ljspeech/medium
    (en_US-ljspeech-medium.onnx and en_US-ljspeech-medium.onnx.json)
  Model card: LJ Speech dataset, public domain; trained from scratch. See public/audio/MANIFEST.json.

Usage:
  python3 scripts/gen-voice.py --model ~/piper-voices/en_US-ljspeech-medium.onnx
  python3 scripts/gen-voice.py --model ... --only-missing          # keep existing clips
  python3 scripts/gen-voice.py --model ... --characters milo

Every clip is checked after encoding: too short, or too quiet (silence / failed synthesis),
is REJECTED and not listed in clips.json, so the app reports it missing instead of "playing" nothing.
"""
import argparse, json, os, re, shlex, shutil, subprocess, sys, tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MIN_SECONDS = 0.25
MIN_MEAN_DB = -45.0   # whole-clip mean volume
MIN_PEAK_DB = -20.0   # loudest sample must reach at least this


def run(cmd, **kw):
    return subprocess.run(cmd, check=True, capture_output=True, text=True, **kw)


def probe(path):
    dur = float(run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)]).stdout.strip() or 0)
    err = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", str(path), "-af", "volumedetect", "-f", "null", "-"],
                         capture_output=True, text=True).stderr
    mean = re.search(r"mean_volume: (-?[\d.]+|-inf) dB", err)
    peak = re.search(r"max_volume: (-?[\d.]+|-inf) dB", err)
    to_f = lambda m: float("-inf") if (not m or m.group(1) == "-inf") else float(m.group(1))
    return dur, to_f(mean), to_f(peak)


def check_clip(path):
    """Returns (ok, reason, duration_ms)."""
    if not path.exists() or path.stat().st_size < 1000:
        return False, "file missing or under 1 KB", 0
    dur, mean, peak = probe(path)
    if dur < MIN_SECONDS:
        return False, f"too short ({dur:.2f}s)", int(dur * 1000)
    if mean < MIN_MEAN_DB or peak < MIN_PEAK_DB:
        return False, f"too quiet / silent (mean {mean} dB, peak {peak} dB)", int(dur * 1000)
    return True, "ok", int(dur * 1000)


_LITE = None
def synthesize(piper_cmd, model, text, out_wav, slow=1.0):
    if piper_cmd and piper_cmd[0] == 'lite':  # in-process Piper (scripts/piper_lite.py): one model load for all clips
        global _LITE
        import wave
        import numpy as np
        sys.path.insert(0, str(Path(__file__).resolve().parent))
        from piper_lite import Voice
        if _LITE is None: _LITE = Voice(str(model))
        _LITE.scales[1] = slow / 1.0  # Piper length_scale: >1 = slower, clearer words
        audio, sr = _LITE.synth(text)
        with wave.open(str(out_wav), 'wb') as w:
            w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr); w.writeframes((np.clip(audio, -1, 1) * 32767).astype('int16').tobytes())
        return
    # Long-standing Piper CLI: text on stdin, --model, --output_file.
    subprocess.run(piper_cmd + ["--model", str(model), "--output_file", str(out_wav)] + (["--length_scale", str(slow)] if slow != 1.0 else []),
                   input=text, text=True, check=True, capture_output=True)


def apply_profile(src_wav, dst_mp3, sample_rate, pitch, tempo):
    # Pitch shift without changing duration: resample trick + atempo compensation.
    atempo = max(0.5, min(2.0, tempo / pitch))
    af = (f"asetrate={int(sample_rate * pitch)},aresample={sample_rate},atempo={atempo:.4f},"
          "silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.05,"
          "areverse,silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.08,areverse,"
          "loudnorm=I=-18:TP=-2:LRA=11")
    run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(src_wav), "-af", af,
         "-ac", "1", "-ar", "22050", "-c:a", "libmp3lame", "-b:a", "64k", str(dst_mp3)])


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--model", required=True, help="path to en_US-ljspeech-medium.onnx (its .onnx.json must sit next to it)")
    ap.add_argument("--piper", default="piper", help="piper command (default: piper)")
    ap.add_argument("--characters", default="", help="comma list (default: all in voice/profiles.json)")
    ap.add_argument("--only-missing", action="store_true")
    ap.add_argument("--root", default=str(ROOT), help=argparse.SUPPRESS)  # tests
    a = ap.parse_args(argv)

    root = Path(a.root)
    model = Path(a.model).expanduser()
    for tool in ("ffmpeg", "ffprobe"):
        if not shutil.which(tool):
            sys.exit(f"{tool} not found on PATH")
    piper_cmd = [t.strip('"') for t in shlex.split(a.piper, posix=False)]  # quote-aware (Windows paths with spaces)
    if piper_cmd[0] != 'lite' and not shutil.which(piper_cmd[0]) and not Path(piper_cmd[0]).exists():
        sys.exit(f"piper not found ('{a.piper}'). Install with: pip install piper-tts")
    if not model.exists():
        sys.exit(f"model not found: {model}")
    cfg_path = Path(str(model) + ".json")
    sample_rate = 22050
    if cfg_path.exists():
        sample_rate = int(json.loads(cfg_path.read_text(encoding="utf-8")).get("audio", {}).get("sample_rate", 22050))

    phrases = json.loads((root / "voice/phrases.json").read_text(encoding="utf-8"))["phrases"]
    profiles = json.loads((root / "voice/profiles.json").read_text(encoding="utf-8"))
    wanted = [c for c in (a.characters.split(",") if a.characters else profiles["characters"].keys()) if c]
    voices_meta = json.loads((root / "public/audio/MANIFEST.json").read_text(encoding="utf-8"))["voices"]
    voice_meta = next(v for v in voices_meta if v["id"] == profiles["baseVoice"])

    clips_path = root / "public/audio/voice/clips.json"
    clips = json.loads(clips_path.read_text(encoding="utf-8")) if clips_path.exists() else {"voices": {}}
    report = {"ok": 0, "kept": 0, "rejected": [], "failed": []}
    ids_now = {p["id"] for p in phrases}

    with tempfile.TemporaryDirectory() as tmp:
        for char in wanted:
            prof = profiles["characters"][char]
            out_dir = root / "public/audio/voice" / char
            out_dir.mkdir(parents=True, exist_ok=True)
            index = clips["voices"].setdefault(char, {})
            # Drop clips for lines that no longer exist.
            for stale in [i for i in list(index) if i not in ids_now]:
                (out_dir / f"{stale}.mp3").unlink(missing_ok=True)
                del index[stale]
            records = []
            for n, p in enumerate(phrases, 1):
                mp3 = out_dir / f"{p['id']}.mp3"
                if a.only_missing and p["id"] in index and mp3.exists():
                    report["kept"] += 1
                else:
                    wav = Path(tmp) / f"{p['id']}.wav"
                    try:
                        synthesize(piper_cmd, model, p["speak"], wav, 1.3 if p.get("source") == "responses.JOKES" else (1.25 if p["text"] == "A for Apple." else 1.0))
                        apply_profile(wav, mp3, sample_rate, prof["pitch"], prof["tempo"])
                    except subprocess.CalledProcessError as e:
                        report["failed"].append((char, p["id"], (e.stderr or str(e)).strip()[:200]))
                        index.pop(p["id"], None)
                        mp3.unlink(missing_ok=True)
                        continue
                    ok, why, ms = check_clip(mp3)
                    if not ok:
                        report["rejected"].append((char, p["id"], why))
                        index.pop(p["id"], None)
                        mp3.unlink(missing_ok=True)
                        continue
                    index[p["id"]] = {"file": f"audio/voice/{char}/{p['id']}.mp3", "ms": ms, "text": p["text"]}
                    report["ok"] += 1
                    print(f"[{char} {n}/{len(phrases)}] {p['id']}  {ms} ms")
                if p["id"] in index:
                    records.append({
                        "path": f"voice/{char}/{p['id']}.mp3",
                        "title": p["text"],
                        "creator": f"Generated offline with Piper ({profiles['baseVoice']}), profile '{char}' (pitch {prof['pitch']}, tempo {prof['tempo']})",
                        "sourceUrl": voice_meta["modelUrl"],
                        "license": "Voice model trained on LJ Speech (public domain); Piper MIT. See public/audio/MANIFEST.json voices[] caveat.",
                        "attribution": "Piper TTS by Michael Hansen (rhasspy); LJ Speech dataset by Keith Ito",
                        "intendedUse": f"Spoken dialogue line for {char}",
                        "status": "ready",
                    })
            (out_dir / "MANIFEST.json").write_text(json.dumps({"voice": profiles["baseVoice"], "character": char, "files": records}, indent=2) + "\n")

    clips["generatedWith"] = {"engine": "piper", "voice": profiles["baseVoice"], "model": model.name}
    clips_path.parent.mkdir(parents=True, exist_ok=True)
    clips_path.write_text(json.dumps(clips, indent=1) + "\n")
    print(f"\nclips ok: {report['ok']}, kept: {report['kept']}, rejected: {len(report['rejected'])}, failed: {len(report['failed'])}")
    for r in report["rejected"]:
        print("REJECTED", *r)
    for r in report["failed"]:
        print("FAILED  ", *r)
    print("Next: npm run voice:report && npm run build:vega")
    return 1 if (report["rejected"] or report["failed"]) else 0


if __name__ == "__main__":
    sys.exit(main())
