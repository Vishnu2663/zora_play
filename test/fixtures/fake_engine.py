#!/usr/bin/env python3
"""TEST-ONLY stand-in for the piper CLI (never shipped, never used for real clips).
Mode via FAKE_ENGINE_MODE: 'tone' writes a tone whose length follows the text,
'silent' writes silence, 'crash' exits with an error. Reads text on stdin like piper."""
import os, subprocess, sys
args = sys.argv[1:]
out = args[args.index("--output_file") + 1]
text = sys.stdin.read()
mode = os.environ.get("FAKE_ENGINE_MODE", "tone")
if mode == "crash":
    sys.stderr.write("fake engine crash\n"); sys.exit(3)
dur = max(0.5, min(3.0, len(text) * 0.05))
src = f"sine=frequency=300:duration={dur}" if mode == "tone" else f"anullsrc=r=22050:cl=mono:d={dur}"
subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", src, "-ar", "22050", "-ac", "1", out], check=True)
