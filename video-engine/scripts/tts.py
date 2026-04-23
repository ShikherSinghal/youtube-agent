import os
import asyncio
import logging

import edge_tts

DEFAULT_VOICE = "en-US-ChristopherNeural"

logger = logging.getLogger(__name__)


class TTSGenerator:
    def __init__(self, output_dir: str, voice: str = DEFAULT_VOICE):
        self.output_dir = output_dir
        self.voice = voice
        os.makedirs(output_dir, exist_ok=True)

    def generate(self, text: str, filename: str = "narration.mp3") -> str:
        output_path = os.path.join(self.output_dir, filename)
        asyncio.run(self._generate_async(text, output_path))
        return output_path

    async def _generate_async(self, text: str, output_path: str) -> None:
        communicate = edge_tts.Communicate(text, voice=self.voice)
        await communicate.save(output_path)
