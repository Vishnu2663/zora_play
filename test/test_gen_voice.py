"""Tests for scripts/gen-voice.py using a TEST-ONLY stand-in engine (test/fixtures/fake_engine.py).
They verify the pipeline (profile, encoding, verification, index, manifests), not voice quality."""
import importlib.util, json, os, shutil, sys, tempfile, unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("gen_voice", ROOT / "scripts/gen-voice.py")
gen = importlib.util.module_from_spec(spec); spec.loader.exec_module(gen)
FAKE = f'"{sys.executable}" "{ROOT / "test/fixtures/fake_engine.py"}"'


class GenVoiceTest(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        (self.tmp / "voice").mkdir()
        (self.tmp / "public/audio").mkdir(parents=True)
        shutil.copy(ROOT / "public/audio/MANIFEST.json", self.tmp / "public/audio/MANIFEST.json")
        shutil.copy(ROOT / "voice/profiles.json", self.tmp / "voice/profiles.json")
        phrases = [{"id": "hello-aaaaaa", "text": "Hello!", "speak": "Hello!", "source": "t"},
                   {"id": "lets-wiggle-bbbbbb", "text": "Let's wiggle!", "speak": "Let's wiggle!", "source": "t"}]
        (self.tmp / "voice/phrases.json").write_text(json.dumps({"phrases": phrases}))
        self.model = self.tmp / "model.onnx"; self.model.write_text("x")
        (self.tmp / "model.onnx.json").write_text(json.dumps({"audio": {"sample_rate": 22050}}))

    def tearDown(self):
        shutil.rmtree(self.tmp)
        os.environ.pop("FAKE_ENGINE_MODE", None)

    def gen(self, *extra):
        return gen.main(["--model", str(self.model), "--piper", FAKE, "--root", str(self.tmp), "--characters", "dino", *extra])

    def clips(self):
        return json.loads((self.tmp / "public/audio/voice/clips.json").read_text())

    def test_good_audio_is_encoded_verified_indexed_and_recorded(self):
        os.environ["FAKE_ENGINE_MODE"] = "tone"
        self.assertEqual(self.gen(), 0)
        idx = self.clips()["voices"]["dino"]
        self.assertEqual(set(idx), {"hello-aaaaaa", "lets-wiggle-bbbbbb"})
        f = self.tmp / "public" / idx["hello-aaaaaa"]["file"]
        self.assertTrue(f.exists() and f.stat().st_size > 1000)
        self.assertGreater(idx["hello-aaaaaa"]["ms"], 250)
        man = json.loads((self.tmp / "public/audio/voice/dino/MANIFEST.json").read_text())
        self.assertEqual(len(man["files"]), 2)
        for r in man["files"]:
            for k in ("title", "creator", "sourceUrl", "license", "attribution", "intendedUse", "status"):
                self.assertIn(k, r)

    def test_silent_output_is_rejected_not_listed(self):
        os.environ["FAKE_ENGINE_MODE"] = "silent"
        self.assertEqual(self.gen(), 1)
        self.assertEqual(self.clips()["voices"]["dino"], {})
        self.assertFalse(any((self.tmp / "public/audio/voice/dino").glob("*.mp3")))

    def test_engine_crash_is_reported_and_nothing_listed(self):
        os.environ["FAKE_ENGINE_MODE"] = "crash"
        self.assertEqual(self.gen(), 1)
        self.assertEqual(self.clips()["voices"]["dino"], {})

    def test_only_missing_keeps_existing_and_stale_lines_are_removed(self):
        os.environ["FAKE_ENGINE_MODE"] = "tone"
        self.gen()
        before = (self.tmp / "public/audio/voice/dino/hello-aaaaaa.mp3").stat().st_mtime_ns
        phrases = json.loads((self.tmp / "voice/phrases.json").read_text())["phrases"][:1]
        (self.tmp / "voice/phrases.json").write_text(json.dumps({"phrases": phrases}))
        self.assertEqual(self.gen("--only-missing"), 0)
        self.assertEqual(set(self.clips()["voices"]["dino"]), {"hello-aaaaaa"})
        self.assertFalse((self.tmp / "public/audio/voice/dino/lets-wiggle-bbbbbb.mp3").exists())
        self.assertEqual(before, (self.tmp / "public/audio/voice/dino/hello-aaaaaa.mp3").stat().st_mtime_ns)


if __name__ == "__main__":
    unittest.main()
