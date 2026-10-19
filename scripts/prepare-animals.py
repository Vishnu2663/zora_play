#!/usr/bin/env python3
"""Cuts one clean, normalised clip per animal from the licensed source recordings.
Usage: prepare-animals.py <src_dir> <out_dir>   (src files named <animal>.<ext>)
Picks the loudest window of the source (<= MAXLEN s), fades it, loudness-normalises, writes mono MP3."""
import array, os, subprocess, sys, json
src, out = sys.argv[1], sys.argv[2]
os.makedirs(out, exist_ok=True)
MAXLEN = {'rooster': 3.2, 'hen': 3.0, 'lion': 3.5, 'dog': 2.4, 'goat': 2.6, 'frog': 2.5, 'cat': 1.6, 'horse': 2.3, 'elephant': 1.5, 'sheep': 0.6}
report = {}
for f in sorted(os.listdir(src)):
    name, ext = os.path.splitext(f)
    if ext.lower() not in ('.ogg', '.wav', '.oga', '.mp3', '.flac'): continue
    p = os.path.join(src, f)
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', p, '-ac', '1', '-ar', '8000', '-f', 's16le', '-'], capture_output=True).stdout
    s = array.array('h'); s.frombytes(raw)
    hop = 800  # 100 ms
    rms = [ (sum(x*x for x in s[i:i+hop]) / max(1, len(s[i:i+hop]))) ** .5 for i in range(0, len(s), hop)]
    dur = len(s) / 8000
    win = int(round(MAXLEN.get(name, 2.5) * 10))
    win = min(win, len(rms))
    best, bi = -1, 0
    for i in range(0, len(rms) - win + 1):
        v = sum(rms[i:i+win])
        if v > best: best, bi = v, i
    start = max(0.0, bi / 10 - 0.1)
    length = min(dur - start, win / 10 + 0.2)
    dst = os.path.join(out, name + '.mp3')
    af = f'afade=t=in:d=0.03,afade=t=out:st={max(0, length-0.15):.2f}:d=0.15,loudnorm=I=-16:TP=-1.5:LRA=11'
    subprocess.run(['ffmpeg', '-y', '-v', 'error', '-ss', f'{start:.2f}', '-t', f'{length:.2f}', '-i', p, '-ac', '1', '-ar', '44100', '-af', af, '-codec:a', 'libmp3lame', '-b:a', '96k', dst], check=True)
    d = float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', dst], capture_output=True, text=True).stdout)
    report[name] = {'file': name + '.mp3', 'ms': int(d * 1000), 'sourceStart': round(start, 2)}
    print(name, 'src', round(dur, 1), 's -> clip', round(d, 2), 's from', round(start, 2))
json.dump(report, open(os.path.join(out, '_report.json'), 'w'), indent=1)
