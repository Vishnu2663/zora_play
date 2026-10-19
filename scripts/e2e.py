"""
Remote-only end-to-end test for Milo.
Drives the built app in headless Chromium at 1920x1080 using ONLY the keys a
Fire TV remote sends through the Vega WebView: arrows, Enter, Escape (Back),
and MediaPlayPause. No mouse clicks. Saves screenshots to ./screenshots.

Run:  python3 scripts/e2e.py   (after: node scripts/build.mjs)
"""
import os, sys, time, pathlib
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
SHOTS = ROOT / "screenshots"
SHOTS.mkdir(exist_ok=True)
os.environ.setdefault("PLAYWRIGHT_BROWSERS_PATH", "/opt/pw-browsers")

results = []
def check(name, cond, detail=""):
    results.append((name, bool(cond), detail))
    print(("PASS " if cond else "FAIL ") + name + (f"  [{detail}]" if detail else ""))

def main():
    with sync_playwright() as p:
        b = p.chromium.launch(args=["--autoplay-policy=no-user-gesture-required"])
        page = b.new_page(viewport={"width": 1920, "height": 1080})
        errors = []
        page.on("console", lambda m: m.type == "error" and errors.append(m.text))
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto((ROOT / "dist" / "index.html").as_uri())
        page.wait_for_timeout(1500)

        A = lambda: page.evaluate("document.activeElement && document.activeElement.dataset.fkey")
        screen = lambda: page.get_attribute(".stage", "data-screen")
        char = lambda: page.get_attribute(".stage", "data-char")
        def key(k, wait=180):
            page.keyboard.press(k); page.wait_for_timeout(wait)
        def shot(name):
            page.screenshot(path=str(SHOTS / f"{name}.png"))
        def focus_to(fkey, limit=20):
            """Move focus with arrow keys only, like a person with a remote."""
            for _ in range(limit):
                if A() == fkey: return True
                d = page.evaluate("""(t) => {
                    const a = document.activeElement.getBoundingClientRect();
                    const el = document.querySelector(`[data-fkey="${t}"]`);
                    if (!el) return null;
                    const b = el.getBoundingClientRect();
                    const dx = (b.left+b.width/2)-(a.left+a.width/2), dy = (b.top+b.height/2)-(a.top+a.height/2);
                    if (Math.abs(dy) > 30 && Math.abs(dy) >= Math.abs(dx)*0.5) return dy > 0 ? 'ArrowDown' : 'ArrowUp';
                    return dx > 0 ? 'ArrowRight' : 'ArrowLeft';
                }""", fkey)
                if d is None: return False
                key(d, 120)
            return A() == fkey

        # ---------- Home ----------
        shot("01-home")
        check("app starts on home", screen() == "home")
        check("initial focus on Dance tile", A() == "home-dance", A())
        key("ArrowRight"); r = A(); key("ArrowDown"); d = A(); key("ArrowLeft"); l = A(); key("ArrowUp"); u = A()
        check("D-pad moves around the 2x2 tiles", [r, d, l, u] == ["home-sing", "home-talk", "home-play", "home-dance"], str([r, d, l, u]))

        # ---------- Dance Studio ----------
        key("Enter", 900)
        check("Enter opens Dance Studio", screen() == "dance")
        check("Milo starts dancing", char() == "DANCING", char())
        shot("02-dance")
        lit_before = page.locator(".flames svg path[fill='#F28C38']").count()
        check("can reach Faster with arrows", focus_to("dance-faster"), A())
        key("Enter", 300); key("Enter", 300)
        lit_after = page.locator(".flames svg path[fill='#F28C38']").count()
        check("Faster really raises speed (flames)", lit_after == lit_before + 2, f"{lit_before}->{lit_after}")
        focus_to("dance-robot"); key("Enter", 400)
        check("Robot dance", char() == "ROBOT_DANCE", char())
        focus_to("dance-stop"); key("Enter", 150)
        check("Stop -> STOPPING", char() in ("STOPPING", "IDLE"), char())
        page.wait_for_timeout(600)
        check("then back to IDLE", char() == "IDLE", char())
        focus_to("dance-again"); key("Enter", 300)
        check("Again repeats the robot dance", char() == "ROBOT_DANCE", char())
        key("Escape", 500)
        check("Back returns home", screen() == "home")
        check("Back stops the dance", char() == "IDLE", char())
        check("focus restored to Dance tile", A() == "home-dance", A())

        # ---------- Talk Wheel: same engine as voice ----------
        focus_to("home-talk"); key("Enter", 600)
        check("Talk screen", screen() == "talk")
        key("Enter", 500)  # "Dance!"
        check('Talk "Dance!" -> dancing', char() == "DANCING", char())
        check("Milo replies in the bubble", len(page.inner_text(".bubble")) > 0, page.inner_text(".bubble"))
        focus_to("talk-1"); key("Enter", 400)  # Faster!
        check('"Faster!" follow-up keeps dancing', char() == "DANCING", page.inner_text(".bubble"))
        focus_to("talk-4"); key("Enter", 200)  # Stop!
        check('"Stop!" stops', char() in ("STOPPING", "IDLE"), char())
        focus_to("talk-10"); key("Enter", 600)  # I'm sad
        check('"I\'m sad" -> supportive with choices', char() == "SUPPORTIVE" and page.locator(".choices-pop").count() == 1, page.inner_text(".bubble"))
        shot("03-talk-sad")
        check("choice pop-up traps focus", (A() or "").startswith("choice-"), A())
        key("Escape", 300)
        check("Back closes the choices first", page.locator(".choices-pop").count() == 0 and screen() == "talk")
        focus_to("talk-12"); key("Enter", 500)  # Go to sleep
        check("Sleep", char() == "SLEEPING", char())
        focus_to("talk-0"); key("Enter", 400)  # Dance! while asleep
        check("asleep: dance is refused, Milo stays asleep", char() == "SLEEPING", page.inner_text(".bubble"))
        shot("04-sleeping")
        focus_to("talk-13"); key("Enter", 400)  # Wake up
        check("Wake up", char() == "HAPPY", char())
        key("Escape", 500)

        # ---------- Rhyme Room ----------
        focus_to("home-sing"); key("Enter", 600)
        check("Rhyme Room", screen() == "rhymes")
        key("Enter", 2600)
        sung = page.locator(".k-word.sung").count()
        check("rhyme plays with karaoke highlighting", sung > 2 and char() == "SINGING", f"sung words={sung}")
        shot("05-rhymes")
        media = lambda w: (page.evaluate("window.dispatchEvent(new KeyboardEvent('keydown', {key: 'MediaPlayPause', bubbles: true}))"), page.wait_for_timeout(w))
        media(300)
        s1 = page.locator(".k-word.sung").count(); page.wait_for_timeout(1200); s2 = page.locator(".k-word.sung").count()
        check("Play/Pause key pauses (karaoke holds)", s1 == s2, f"{s1}->{s2}")
        media(1200)
        check("Play/Pause resumes", page.locator(".k-word.sung").count() > s2)
        key("Escape", 500)
        check("leaving Rhyme Room stops the song", char() == "IDLE" and screen() == "home", char())

        # ---------- Shape Match: full game ----------
        focus_to("home-play"); key("Enter", 600)
        check("Play Room", screen() == "play")
        key("Enter", 900)
        check("Shape Match opens", screen() == "shape")
        shot("06-shape")
        for rnd in range(5):
            target = page.get_attribute("[data-target]", "data-target")
            labels = [page.get_attribute(f'[data-fkey="shape-{i}"]', "aria-label") for i in range(3)]
            if rnd == 0:
                wrong = next(i for i, l in enumerate(labels) if l != target)
                focus_to(f"shape-{wrong}"); key("Enter", 400)
                check("wrong answer -> supportive, same round", char() == "SUPPORTIVE" and page.get_attribute("[data-target]", "data-target") == target, page.inner_text(".bubble"))
            idx = labels.index(target)
            focus_to(f"shape-{idx}"); key("Enter", 1800)
        check("Shape Match finishes after 5 rounds", page.locator(".finish").count() == 1)
        check("a shiny scale is earned", page.locator(".shelf svg").count() == 1)
        shot("07-shape-finish")
        check("finish focuses Play again", A() == "finish-again", A())
        key("Escape", 500)

        # ---------- Milo Says ----------
        focus_to("play-simon"); key("Enter", 600)
        check("Milo Says opens", screen() == "simon")
        for rnd in range(5):
            page.wait_for_function("document.querySelector('[data-phase]').dataset.phase === 'answer'", timeout=9000)
            seq = page.get_attribute("[data-seq]", "data-seq").split(",")
            for m in seq:
                focus_to(f"simon-{m}"); key("Enter", 250)
            if rnd == 3: shot("08-simon")
            page.wait_for_timeout(1800)
        check("Milo Says completes 5 rounds (incl. 2-move combos)", page.locator(".finish").count() == 1)
        check("second scale earned", page.locator(".shelf svg").count() == 2)
        key("Escape", 500)

        # ---------- Animal Sounds ----------
        focus_to("play-animal"); key("Enter", 1500)
        check("Animal Sounds opens", screen() == "animal")
        shot("09-animal")
        key("Escape", 400)

        # ---------- Dance Maker ----------
        key("Escape", 400)
        focus_to("home-dance"); key("Enter", 600)
        focus_to("dance-maker"); key("Enter", 600)
        check("Dance Maker", screen() == "maker")
        for m in ["maker-jump", "maker-spin", "maker-robot", "maker-clap"]:
            focus_to(m); key("Enter", 150)
        check("4 slots filled", page.locator(".slot.filled").count() == 4)
        focus_to("maker-go"); key("Enter", 900)
        check("Milo performs the child's dance", page.locator(".slot.now").count() == 1, char())
        shot("10-maker")
        key("Enter", 300)  # Stop
        key("Escape", 400); key("Escape", 400)

        # ---------- Dragon Breath ----------
        focus_to("home-breathe"); key("Enter", 2000)
        check("Dragon Breath", screen() == "breathe" and char() == "BREATHING", char())
        shot("11-breathe")
        key("Escape", 400)

        # ---------- Grown-ups gate ----------
        focus_to("grownups")
        page.keyboard.press("Enter"); page.wait_for_timeout(300)
        check("a quick press does not open grown-ups", screen() == "home")
        page.keyboard.down("Enter"); page.wait_for_timeout(3400); page.keyboard.up("Enter"); page.wait_for_timeout(500)
        check("holding OK 3s opens grown-ups", screen() == "parents")
        shot("12-parents")
        focus_to("set-6"); key("Enter", 200)  # developer console on
        focus_to("set-done"); key("Enter", 500)

        # ---------- Dev console (typed transcript simulator) ----------
        focus_to("home-talk"); key("Enter", 500)
        check("dev console appears when enabled", page.locator(".dev input").count() == 1)
        page.focus(".dev input")
        page.keyboard.type("hey milo, dance like a robot!"); key("Enter", 400)
        check("typed 'dance like a robot' -> ROBOT_DANCE", char() == "ROBOT_DANCE", char())
        page.keyboard.type("my name is Sam"); key("Enter", 400)
        check("personal info -> privacy reply", "private" in page.inner_text(".bubble").lower(), page.inner_text(".bubble"))
        page.keyboard.type("order pizza"); key("Enter", 400)
        check("unknown -> confused + choices", char() == "CONFUSED" and page.locator(".choices-pop").count() == 1)

        # ---------- Exit flow ----------
        key("Escape", 300); key("Escape", 300); key("Escape", 300)
        check("on home, Back shows a leave hint", screen() == "home" and page.locator(".toast").count() == 1)

        # Missing-voice diagnostics are intentional dev-time errors while clips are pending:
        # report them separately instead of hiding them or failing on them.
        speech_missing = [e for e in errors if e.startswith("[speech] no voice for")]
        other = [e for e in errors if e not in speech_missing]
        print(f"INFO {len(speech_missing)} missing-voice diagnostics logged (expected until clips are generated)")
        check("no console errors (other than missing-voice diagnostics)", not other, "; ".join(other[:3]))
        b.close()

    failed = [r for r in results if not r[1]]
    print(f"\n{len(results) - len(failed)}/{len(results)} checks passed")
    sys.exit(1 if failed else 0)

if __name__ == "__main__":
    main()
