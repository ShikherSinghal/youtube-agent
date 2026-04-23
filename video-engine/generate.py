#!/usr/bin/env python3
"""Main entry point for the video generation pipeline."""

import argparse
import logging
import os
import sqlite3
import sys

from scripts.writer import ScriptWriter
from scripts.images import ImageGenerator
from scripts.tts import TTSGenerator
from scripts.captions import CaptionGenerator
from scripts.compositor import Compositor

logger = logging.getLogger(__name__)

VIDEO_COLUMNS = [
    "id", "niche", "title", "description", "hashtags", "tags",
    "hook", "script", "thumbnail_text", "scheduled_date", "status",
    "video_path", "youtube_id",
]


class VideoGenerator:
    """Orchestrates the full video generation pipeline."""

    def __init__(self, video_id, db_path, output_dir, ollama_host, ollama_model):
        self.video_id = video_id
        self.db_path = db_path
        self.output_dir = output_dir
        self.ollama_host = ollama_host
        self.ollama_model = ollama_model
        self.work_dir = os.path.join(output_dir, f"work_{video_id}")
        os.makedirs(self.work_dir, exist_ok=True)

    def run(self):
        """Execute the full pipeline: script → images → TTS → captions → compose."""
        # 1. Load video plan from DB
        conn = sqlite3.connect(self.db_path)
        row = conn.execute(
            f"SELECT {', '.join(VIDEO_COLUMNS)} FROM videos WHERE id = ?",
            (self.video_id,),
        ).fetchone()
        if row is None:
            raise ValueError(f"Video {self.video_id} not found in database")
        video = dict(zip(VIDEO_COLUMNS, row))

        # 2. Generate script
        writer = ScriptWriter(self.ollama_host, self.ollama_model)
        script_data = writer.generate(video["title"], video["hook"], video["niche"])
        narration = script_data["narration"]
        scenes = script_data["scenes"]

        # 3. Update status to "scripted", save narration
        conn.execute(
            "UPDATE videos SET status = ?, script = ? WHERE id = ?",
            ("scripted", narration, self.video_id),
        )
        conn.commit()

        # 4. Generate images
        img_gen = ImageGenerator(os.path.join(self.work_dir, "images"))
        image_paths = img_gen.generate_batch(scenes)

        # 5. Update status to "generating"
        conn.execute(
            "UPDATE videos SET status = ? WHERE id = ?",
            ("generating", self.video_id),
        )
        conn.commit()

        # 6. Generate TTS audio
        tts = TTSGenerator(os.path.join(self.work_dir, "audio"))
        audio_path = tts.generate(narration)

        # 7. Calculate durations
        durations = Compositor.calculate_durations(210, len(scenes))

        # 8. Generate captions
        captions_path = os.path.join(self.work_dir, "captions.ass")
        cap = CaptionGenerator()
        cap.write(scenes, durations, captions_path)

        # 9. Compose final video
        comp = Compositor(os.path.join(self.work_dir, "video"))
        video_path = comp.compose(image_paths, audio_path, captions_path, durations, self.video_id)

        # 10. Update DB with final video path and status
        conn.execute(
            "UPDATE videos SET video_path = ?, status = ? WHERE id = ?",
            (video_path, "rendered", self.video_id),
        )
        conn.commit()
        conn.close()

        logger.info("Video %s rendered at %s", self.video_id, video_path)
        return video_path


def main():
    """CLI entry point."""
    parser = argparse.ArgumentParser(description="Generate a video from a planned content row.")
    parser.add_argument("--video-id", required=True, help="Video ID from the database")
    parser.add_argument("--db-path", required=True, help="Path to the SQLite database")
    parser.add_argument("--output-dir", required=True, help="Directory for output files")
    parser.add_argument("--ollama-host", default="http://localhost:11434", help="Ollama API host")
    parser.add_argument("--ollama-model", default="llama3", help="Ollama model name")
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO)

    gen = VideoGenerator(
        video_id=args.video_id,
        db_path=args.db_path,
        output_dir=args.output_dir,
        ollama_host=args.ollama_host,
        ollama_model=args.ollama_model,
    )
    gen.run()


if __name__ == "__main__":
    main()
