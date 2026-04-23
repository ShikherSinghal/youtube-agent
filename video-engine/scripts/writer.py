import json
import re
import requests


class ScriptWriter:
    def __init__(self, ollama_host: str, model: str):
        self.ollama_host = ollama_host
        self.model = model

    def generate(self, title: str, hook: str, niche: str) -> dict:
        """Generate a video narration script with exactly 8 scenes."""
        url = f"{self.ollama_host}/api/chat"
        system_prompt = (
            "You are a JSON generator. You ONLY output valid JSON, nothing else."
        )
        user_prompt = (
            f"Create a short-form video script for the niche '{niche}'.\n"
            f"Title: {title}\n"
            f"Hook: {hook}\n\n"
            "Return a JSON object with two keys:\n"
            '  "narration" — a single string of the full spoken narration.\n'
            '  "scenes" — an array of exactly 8 objects, one for each scene in order: '
            "hook, scene_1, scene_2, scene_3, scene_4, scene_5, scene_6, outro.\n"
            "Each scene object must have:\n"
            '  "scene" — the scene name (e.g. "hook", "scene_1", "outro")\n'
            '  "text"  — the spoken narration for that scene\n'
            '  "image_prompt" — a vivid image generation prompt for the scene background\n'
        )
        payload = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "stream": False,
        }

        resp = requests.post(url, json=payload)
        if resp.status_code != 200:
            raise RuntimeError(f"Ollama request failed with status {resp.status_code}")

        content = resp.json()["message"]["content"]
        return self._parse_json(content)

    def _parse_json(self, text: str) -> dict:
        """Strip ```json code fences if present, then parse JSON."""
        cleaned = re.sub(r"^```(?:json)?\s*\n?", "", text.strip())
        cleaned = re.sub(r"\n?```\s*$", "", cleaned)
        return json.loads(cleaned)
