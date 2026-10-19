#!/usr/bin/env python3
"""Turns the owner's five songs into Rhyme Room songs with karaoke lyrics.

Usage: python3 scripts/prepare-songs.py "/path/to/folder with the mp3 files"
  * copies each mp3 to public/audio/rhymes/<id>.mp3 (the songs are the owner's own, made with Suno)
  * aligns the lyrics (written below, as in each file's lyrics tag, stage directions removed) with the sung words
    found by speech recognition (voice/songs-asr.json, made once with faster-whisper 'medium') and writes
    public/audio/rhymes/<id>.json: the timing file the app reads (line and word start/end in seconds).
Words the recogniser missed or misheard are placed between their matched neighbours.
"""
import json, re, shutil, subprocess, sys
from difflib import SequenceMatcher
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'public/audio/rhymes'
SONGS = [
    ('lullaby', "Milo's Lullaby.mp3", "Milo's Lullaby", [
        "Milo moves slowly, soft as a cloud,", "Sway to the music, gentle and proud.", "Reach up slowly, then lower your hands,",
        "Take a slow breath, now sway where you stand.", "Slow to the left, slow to the right,", "Float like a feather, light as a kite.",
        "Stretch up softly, then let arms fall,", "Milo says, You danced, great job, all!"]),
    ('robot', "Milo's Robot Smiley.mp3", "Milo's Robot Smiley", [
        "Beep-beep, Milo's robot crew,", "Robot arms are ready, how about you?", "Step-step forward, step-step back,",
        "Make your elbows click-clack-clack!", "Robot left, robot right,", "Robot arms reach up so high!",
        "Beep-beep, freeze in place,", "Milo's robot smiley face!"]),
    ('march', "March with Milo.mp3", "March with Milo", [
        "March with Milo, one-two-three,", "Tap your knees along with me.", "Wave hello up to the sky,", "Little dragon marching by!",
        "Step-step, softly go,", "Tap-tap, nice and slow.", "Wave one hand, then wave the other,", "Milo dances with a friend!",
        "March in place, nice and slow.", "Tap your knees, then wave hello.", "Take one breath, smile and stay,", "Milo says, You danced today!"]),
    ('feather', "Float Like a Feather.mp3", "Float Like a Feather", [
        "Milo moves slowly, soft as a cloud,", "Sway to the music, gentle and proud.", "Reach up slowly, then lower your hands,",
        "Take a slow breath, now sway where you stand.", "Slow to the left, slow to the right,", "Float like a feather, light as a kite.",
        "Stretch up softly, then let arms fall,", "Milo says, You danced, great job, all!"]),
    ('tap', "Milo's Dragon Tap.mp3", "Milo's Dragon Tap", [
        "Milo's ready, here we go!", "Find a little space to show.", "Clap your hands and sway side to side,", "Milo's dancing by your side!",
        "Clap, clap, dragon tap,", "Sway, sway, wiggle and clap!", "Reach up high, then touch your toes,", "Milo's dance goes where it goes!",
        "Clap twice! Clap, clap!", "Sway twice! Left, right!", "Reach up! Reeeach!", "Freeze like Milo! Hold a pose!",
        "Clap, clap, dragon tap,", "Sway, sway, wiggle and clap!", "Reach up high, then touch your toes,", "Milo's dance goes where it goes!"]),
]

def norm(w): return re.sub(r'[^a-z0-9]', '', w.lower())
def sim(a, b):
    if not a or not b: return 0.0
    if a == b: return 1.0
    return SequenceMatcher(None, a, b).ratio()

def align(lines, heard):
    """Needleman-Wunsch between lyric tokens and heard words. Returns (start, end) per lyric token, interpolated if unmatched."""
    toks = []   # (line, display word index, subtoken text)
    for li, line in enumerate(lines):
        for wi, w in enumerate(line.split()):
            for sub in w.split('-'):
                if norm(sub): toks.append((li, wi, norm(sub)))
    hs = [(norm(w[0]), w[1], w[2]) for w in heard if norm(w[0])]
    n, m = len(toks), len(hs)
    gap = -0.45
    S = [[0.0] * (m + 1) for _ in range(n + 1)]
    for i in range(1, n + 1): S[i][0] = i * gap
    for j in range(1, m + 1): S[0][j] = j * gap
    for i in range(1, n + 1):
        for j in range(1, m + 1):
            s = sim(toks[i - 1][2], hs[j - 1][0]); score = (s * 2 - 1) if s >= 0.55 else -1.0
            S[i][j] = max(S[i - 1][j - 1] + score, S[i - 1][j] + gap, S[i][j - 1] + gap)
    i, j, match = n, m, {}
    while i > 0 and j > 0:
        s = sim(toks[i - 1][2], hs[j - 1][0]); score = (s * 2 - 1) if s >= 0.55 else -1.0
        if abs(S[i][j] - (S[i - 1][j - 1] + score)) < 1e-9 and s >= 0.55: match[i - 1] = j - 1; i -= 1; j -= 1
        elif abs(S[i][j] - (S[i - 1][j] + gap)) < 1e-9: i -= 1
        elif abs(S[i][j] - (S[i][j - 1] + gap)) < 1e-9: j -= 1
        else: i -= 1; j -= 1
    times = [None] * n
    for ti, hj in match.items(): times[ti] = (hs[hj][1], hs[hj][2])
    known = [k for k in range(n) if times[k]]
    for k in range(n):
        if times[k]: continue
        prev = max((x for x in known if x < k), default=None); nxt = min((x for x in known if x > k), default=None)
        if prev is None and nxt is None: times[k] = (0.0, 0.3)
        elif prev is None: times[k] = (max(0.0, times[nxt][0] - 0.4 * (nxt - k)), times[nxt][0])
        elif nxt is None: times[k] = (times[prev][1] + 0.4 * (k - prev - 1), times[prev][1] + 0.4 * (k - prev))
        else:
            a, b = times[prev][1], times[nxt][0]; step = (b - a) / (nxt - prev); times[k] = (a + step * (k - prev - 1) + 0.0, a + step * (k - prev))
    return toks, times

def build(sid, title, lines, heard, duration):
    toks, times = align(lines, heard)
    words_by_line = [[] for _ in lines]
    for (li, wi, _), (s, e) in zip(toks, times):
        ws = words_by_line[li]
        while len(ws) <= wi: ws.append([None, None])
        if ws[wi][0] is None: ws[wi][0] = s
        ws[wi][1] = e
    out_lines = []
    for li, line in enumerate(lines):
        disp = line.split(); ws = words_by_line[li]
        words = []
        for wi, w in enumerate(disp):
            s, e = ws[wi] if wi < len(ws) and ws[wi][0] is not None else (None, None)
            words.append({'w': w, 's': s, 'e': e})
        out_lines.append(words)
    # fix ordering: starts never go backwards, a word ends where the next begins (but not later than 1.1 s)
    flat = [w for ws in out_lines for w in ws]
    last = 0.0
    for w in flat:
        if w['s'] is None: w['s'] = last
        w['s'] = max(w['s'], last); last = w['s']
    for k, w in enumerate(flat):
        nxt = flat[k + 1]['s'] if k + 1 < len(flat) else min(duration, w['s'] + 1.0)
        w['e'] = round(min(max(nxt, w['s'] + 0.12), w['s'] + 1.1), 3); w['s'] = round(w['s'], 3)
    res = []
    for words in out_lines:
        res.append({'text': ' '.join(w['w'] for w in words), 'start': words[0]['s'], 'end': words[-1]['e'], 'words': words})
    return res

def main():
    src = Path(sys.argv[1]); asr = json.load(open(ROOT / 'voice/songs-asr.json'))
    OUT.mkdir(parents=True, exist_ok=True)
    for sid, fname, title, lines in SONGS:
        shutil.copyfile(src / fname, OUT / f'{sid}.mp3')
        dur = float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', str(OUT / f'{sid}.mp3')]).decode().strip())
        res = build(sid, title, lines, asr[sid], dur)
        doc = {'id': sid, 'title': title, 'audio': f'audio/rhymes/{sid}.mp3', 'durationMs': int(round(dur * 1000)), 'vocals': "the owner's own song (Suno)", 'lines': res}
        (OUT / f'{sid}.json').write_text(json.dumps(doc, indent=1) + '\n')
        print(f'{sid}: {dur:.1f}s, {len(res)} lines, first {res[0]["start"]}s, last {res[-1]["end"]}s')

if __name__ == '__main__':
    main()
