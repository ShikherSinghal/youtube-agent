import os
import unittest

from scripts.captions import CaptionGenerator


class TestCaptionGenerator(unittest.TestCase):

    def setUp(self):
        self.gen = CaptionGenerator()

    def test_generates_ass_subtitle_content(self):
        scenes = [
            {"text": "Welcome to the show."},
            {"text": "Here is the first topic."},
            {"text": "Thanks for watching."},
        ]
        durations = [3.0, 5.0, 2.0]

        result = self.gen.generate(scenes, durations)

        self.assertIn("[Script Info]", result)
        self.assertIn("Title:", result)
        self.assertIn("[V4+ Styles]", result)
        self.assertIn("[Events]", result)
        for scene in scenes:
            self.assertIn(scene["text"], result)

    def test_timing_is_sequential(self):
        scenes = [
            {"text": "First scene."},
            {"text": "Second scene."},
        ]
        durations = [4.0, 6.0]

        result = self.gen.generate(scenes, durations)

        lines = [l for l in result.splitlines() if l.startswith("Dialogue:")]
        self.assertTrue(len(lines) >= 2)
        # First dialogue line must start at 0:00:00.00
        self.assertIn("0:00:00.00", lines[0])

    def test_writes_ass_file(self, tmp_path=None):
        scenes = [{"text": "Hello world."}]
        durations = [2.0]

        import tempfile
        with tempfile.TemporaryDirectory() as tmp:
            out = os.path.join(tmp, "output.ass")
            returned = self.gen.write(scenes, durations, out)

            self.assertEqual(returned, out)
            self.assertTrue(os.path.exists(out))
            with open(out) as f:
                content = f.read()
            self.assertIn("[Script Info]", content)
            self.assertIn("Hello world.", content)

    def test_word_wrapping_for_long_text(self):
        long_text = (
            "This is a very long sentence that definitely exceeds sixty characters "
            "and should therefore be split into multiple dialogue lines by the generator"
        )
        scenes = [{"text": long_text}]
        durations = [10.0]

        result = self.gen.generate(scenes, durations)

        dialogue_lines = [l for l in result.splitlines() if l.startswith("Dialogue:")]
        self.assertGreater(len(dialogue_lines), 1, "Long text should produce multiple Dialogue lines")


if __name__ == "__main__":
    unittest.main()
