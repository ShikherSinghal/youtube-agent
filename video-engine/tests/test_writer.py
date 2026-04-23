import json
import unittest
from unittest.mock import patch, MagicMock

from scripts.writer import ScriptWriter


def _make_scenes():
    """Build a valid 8-scene payload."""
    names = ["hook", "scene_1", "scene_2", "scene_3", "scene_4", "scene_5", "scene_6", "outro"]
    return [
        {"scene": name, "text": f"Text for {name}.", "image_prompt": f"Prompt for {name}."}
        for name in names
    ]


def _mock_response(payload, status_code=200):
    """Return a MagicMock that behaves like requests.Response."""
    resp = MagicMock()
    resp.status_code = status_code
    resp.json.return_value = payload
    resp.raise_for_status = MagicMock()
    if status_code >= 400:
        resp.raise_for_status.side_effect = Exception("HTTP error")
    return resp


class TestScriptWriter(unittest.TestCase):

    def setUp(self):
        self.writer = ScriptWriter(ollama_host="http://localhost:11434", model="llama3")

    @patch("scripts.writer.requests.post")
    def test_generates_script_with_scenes(self, mock_post):
        scenes = _make_scenes()
        body = json.dumps({"narration": "A great video about coding.", "scenes": scenes})
        mock_post.return_value = _mock_response(
            {"message": {"content": body}},
            status_code=200,
        )

        result = self.writer.generate(title="Coding Tips", hook="Did you know?", niche="tech")

        self.assertIn("narration", result)
        self.assertIsInstance(result["narration"], str)
        self.assertEqual(len(result["scenes"]), 8)
        self.assertEqual(result["scenes"][0]["scene"], "hook")
        self.assertEqual(result["scenes"][-1]["scene"], "outro")
        for scene in result["scenes"]:
            self.assertIn("image_prompt", scene)
            self.assertIn("text", scene)

    @patch("scripts.writer.requests.post")
    def test_handles_code_fenced_response(self, mock_post):
        scenes = _make_scenes()
        inner = json.dumps({"narration": "Narration here.", "scenes": scenes})
        fenced = f"```json\n{inner}\n```"
        mock_post.return_value = _mock_response(
            {"message": {"content": fenced}},
            status_code=200,
        )

        result = self.writer.generate(title="AI Tools", hook="Listen up!", niche="ai")

        self.assertEqual(len(result["scenes"]), 8)
        self.assertEqual(result["narration"], "Narration here.")

    @patch("scripts.writer.requests.post")
    def test_raises_on_api_error(self, mock_post):
        mock_post.return_value = _mock_response({}, status_code=500)

        with self.assertRaises(RuntimeError) as ctx:
            self.writer.generate(title="Fail", hook="Oops", niche="none")

        self.assertIn("Ollama request failed", str(ctx.exception))


if __name__ == "__main__":
    unittest.main()
