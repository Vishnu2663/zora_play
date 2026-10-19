"""
Speech + audio-probe end-to-end checks in headless Chromium (remote keys only).

Part A runs the REAL build: no voice clips exist yet, so every line must end
'failed' (never 'completed'), and dev mode must flag "not voiced".

Part B pre-seeds a TEST-ONLY clip index that maps every line to the bundled
440 Hz probe tone (a real file). This exercises real <audio> playback for the
queue rules: one line at a time, rapid presses never overlap, navigation and
Stop cancel, voice-off skips. The tone is not speech; it never ships as a clip.

Part C runs the in-app audio probe and saves its results as evidence for THIS
runtime (Chromium), in screenshots/probe-chromium.json. Vega evidence has to
come from running the same probe on the simulator.
"""
import json, os, pathlib, sys
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
SHOTS = ROOT / "screenshots"; SHOTS.mkdir(exist_ok=True)
os.environ.setdefault("PLAYWRIGHT_BROWSERS_PATH", "/opt/pw-browsers")
results = []
def check(name, cond, detail=""):
    results.append((name, bool(cond))); print(("PASS " if cond else "FAIL ") + name + (f"  [{detail}]" if detail else ""))

# Tracks concurrently playing media elements (speech uses <audio>; music uses Web Audio).
TRACK = """
window.__media = { playing: new Set(), maxConcurrent: 0, plays: 0 };
const _play = HTMLMediaElement.prototype.play;
HTMLMediaElement.prototype.play = function () {
  const el = this; window.__media.plays++;
  const done = () => window.__media.playing.delete(el);
  el.addEventListener('playing', () => { window.__media.playing.add(el); window.__media.maxConcurrent = Math.max(window.__media.maxConcurrent, window.__media.playing.size); });
  el.addEventListener('pause', done); el.addEventListener('ended', done); el.addEventListener('emptied', done);
  return _play.call(this);
};
"""
SEED = """
window.__MILO_CLIPS__ = { voices: { milo: new Proxy({}, { get: (_t, id) => typeof id === 'string' ? { file: 'audio/probe/tone-440.mp3', ms: 800, text: id } : undefined }) } };
"""

def session(p, seed):
    b = p.chromium.launch(args=["--autoplay-policy=no-user-gesture-required"])
    page = b.new_page(viewport={"width": 1920, "height": 1080})
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.add_init_script(TRACK + (SEED if seed else ""))
    page.goto((ROOT / "dist" / "index.html").as_uri())
    page.wait_for_timeout(1300)
    return b, page, errors

def helpers(page):
    A = lambda: page.evaluate("document.activeElement && document.activeElement.dataset.fkey")
    speech = lambda: page.get_attribute(".stage", "data-speech")
    screen = lambda: page.get_attribute(".stage", "data-screen")
    def key(k, w=150): page.keyboard.press(k); page.wait_for_timeout(w)
    def focus_to(fkey, limit=25):
        for _ in range(limit):
            if A() == fkey: return True
            d = page.evaluate("""(t) => { const a = document.activeElement.getBoundingClientRect(); const el = document.querySelector(`[data-fkey="${t}"]`); if (!el) return null;
              const b = el.getBoundingClientRect(); const dx = (b.left+b.width/2)-(a.left+a.width/2), dy = (b.top+b.height/2)-(a.top+a.height/2);
              if (Math.abs(dy) > 30 && Math.abs(dy) >= Math.abs(dx)*0.5) return dy > 0 ? 'ArrowDown' : 'ArrowUp'; return dx > 0 ? 'ArrowRight' : 'ArrowLeft'; }""", fkey)
            if d is None: return False
            key(d, 100)
        return A() == fkey
    def enable_dev():
        focus_to("grownups"); page.keyboard.down("Enter"); page.wait_for_timeout(3300); page.keyboard.up("Enter"); page.wait_for_timeout(400)
        focus_to("set-6"); key("Enter", 200)  # Developer console On (row index after adding device-voice row)
    return A, speech, screen, key, focus_to, enable_dev

with sync_playwright() as p:
    # ---------------- Part A: real build, no clips ----------------
    b, page, errors = session(p, seed=False)
    A, speech, screen, key, focus_to, enable_dev = helpers(page)
    key("ArrowDown"); key("ArrowRight"); focus_to("home-talk"); key("Enter", 500)
    key("Enter", 600)  # "Dance!"
    check("A: no clips -> line ends 'failed', never 'completed'", speech() == "failed", speech())
    check("A: no media element played (no fake audio)", page.evaluate("window.__media.plays") == 0)
    key("Escape", 400)
    enable_dev()
    rows = page.inner_text(".settings")
    check("A: Grown-ups shows 'Milo speaks' and device-voice rows", "Milo speaks" in rows and "Device voice fallback" in rows, rows.replace("\n", " | ")[:160])
    check("A: device voice is 'Not verified' before the probe ran", "not verified" in rows.lower())
    focus_to("set-done"); key("Enter", 500); focus_to("home-talk"); key("Enter", 500); key("Enter", 500)
    check("A: dev mode flags the line as not voiced", "not voiced" in page.inner_text(".bubble").lower(), page.inner_text(".bubble"))
    page.screenshot(path=str(SHOTS / "13-dev-not-voiced.png"))
    check("A: no page errors", not errors, "; ".join(errors[:2]))
    b.close()

    # ---------------- Part B: test-only seeded clips (probe tone) ----------------
    b, page, errors = session(p, seed=True)
    A, speech, screen, key, focus_to, enable_dev = helpers(page)
    page.wait_for_timeout(1500)  # welcome line plays
    focus_to("home-talk"); key("Enter", 400)
    key("Enter", 250)  # Dance!
    check("B: line is 'speaking' while audio plays", speech() == "speaking", speech())
    page.wait_for_timeout(1300)
    check("B: then 'completed' after real 'ended'", speech() == "completed", speech())
    # Rapid presses across different chips: never two voices at once.
    page.evaluate("window.__media.maxConcurrent = 0")
    for k in ["ArrowRight", "Enter", "ArrowRight", "Enter", "ArrowRight", "Enter", "ArrowDown", "Enter", "ArrowLeft", "Enter"]:
        page.keyboard.press(k); page.wait_for_timeout(60)
    page.wait_for_timeout(300)
    mc = page.evaluate("window.__media.maxConcurrent")
    check("B: rapid remote presses never overlap speech", mc <= 1, f"max concurrent voices = {mc}")
    # Navigation cancels speech.
    key("Enter", 200)
    s_before = speech()
    key("Escape", 300)
    playing = page.evaluate("window.__media.playing.size")
    check("B: Back cancels speech immediately", s_before in ("speaking", "queued") and playing == 0 and speech() in ("cancelled", "completed", "failed") , f"{s_before} -> {speech()}, playing={playing}")
    # Stop cancels speech.
    focus_to("home-talk"); key("Enter", 400); focus_to("talk-0"); key("Enter", 200)
    focus_to("talk-4"); key("Enter", 150)  # Stop! (its own reply replaces; then stopAll cancels audio)
    page.wait_for_timeout(1200)
    check("B: after Stop, at most one voice ever played at once", page.evaluate("window.__media.maxConcurrent") <= 1)
    # Voice off -> skipped, no audio.
    key("Escape", 300)
    focus_to("grownups"); page.keyboard.down("Enter"); page.wait_for_timeout(3300); page.keyboard.up("Enter"); page.wait_for_timeout(400)
    focus_to("set-2"); key("Enter", 200)  # Milo speaks -> Off
    focus_to("set-done"); key("Enter", 400)
    plays_before = page.evaluate("window.__media.plays")
    focus_to("home-talk"); key("Enter", 400); key("Enter", 400)
    check("B: voice off -> 'skipped', nothing played", speech() == "skipped" and page.evaluate("window.__media.plays") == plays_before, speech())
    check("B: no page errors", not errors, "; ".join(errors[:2]))
    b.close()

    # ---------------- Part C: audio probe in this runtime ----------------
    b, page, errors = session(p, seed=False)
    A, speech, screen, key, focus_to, enable_dev = helpers(page)
    enable_dev()
    focus_to("set-diag"); key("Enter", 500)
    check("C: diagnostics screen opens from Grown-ups (dev)", screen() == "diagnostics")
    key("Enter", 100)  # Run audio tests
    page.wait_for_function("document.querySelectorAll('.diag-results .diag-row b').length >= 9", timeout=40000)
    page.wait_for_timeout(500)
    rows = page.eval_on_selector_all(".diag-results .diag-row", "els => els.map(e => e.innerText.replace(/\\n/g, ' | '))")
    (SHOTS / "probe-chromium.json").write_text(json.dumps({"runtime": page.evaluate("navigator.userAgent"), "rows": rows}, indent=2))
    page.screenshot(path=str(SHOTS / "14-diagnostics.png"))
    check("C: probe completed all 9 tests", len(rows) == 9, f"{len(rows)} rows")
    for r in rows: print("   ", r[:150])
    key("Escape", 400)
    check("C: Back from diagnostics returns to Grown-ups", screen() == "parents")
    check("C: no page errors", not errors, "; ".join(errors[:2]))
    b.close()

failed = [r for r in results if not r[1]]
print(f"\n{len(results) - len(failed)}/{len(results)} speech checks passed")
sys.exit(1 if failed else 0)
