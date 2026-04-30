#!/usr/bin/env python3
"""Main entry point for the video generation pipeline."""

import argparse
import shutil
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
MIN_NARRATION_SCENE_WORD_RATIO = 0.75

VIDEO_COLUMNS = [
    "id", "niche", "title", "description", "hashtags", "tags",
    "hook", "script", "thumbnail_text", "scheduled_date", "status",
    "video_path", "youtube_id",
]


class VideoGenerator:
    """Orchestrates the full video generation pipeline."""

    def __init__(self, video_id, db_path, output_dir, ollama_host, ollama_model, duration_secs=210):
        self.video_id = video_id
        self.db_path = db_path
        self.output_dir = output_dir
        self.ollama_host = ollama_host
        self.ollama_model = ollama_model
        self.duration_secs = duration_secs
        self.work_dir = os.path.join(output_dir, f"work_{video_id}")
        os.makedirs(self.work_dir, exist_ok=True)

    def run(self):
        """Execute the full pipeline: script → images → TTS → captions → compose."""
        logger.info("Video %s: loading plan from %s", self.video_id, self.db_path)

        # 1. Load video plan from DB
        conn = sqlite3.connect(self.db_path)
        try:
            row = conn.execute(
                f"SELECT {', '.join(VIDEO_COLUMNS)} FROM videos WHERE id = ?",
                (self.video_id,),
            ).fetchone()
            if row is None:
                raise ValueError(f"Video {self.video_id} not found in database")
            video = dict(zip(VIDEO_COLUMNS, row))
            logger.info("Video %s: loaded plan: %s", self.video_id, video["title"])

            # 2. Generate script
            logger.info("Video %s: generating script with %s", self.video_id, self.ollama_model)
            writer = ScriptWriter(self.ollama_host, self.ollama_model)
            script_data = writer.generate(video["title"], video["hook"], video["niche"])
            scenes = script_data["scenes"]
            narration = self._select_narration(script_data.get("narration", ""), scenes)
            logger.info("Video %s: script generated with %d scenes", self.video_id, len(scenes))

            # 3. Update status to "scripted", save narration
            conn.execute(
                "UPDATE videos SET status = ?, script = ? WHERE id = ?",
                ("scripted", narration, self.video_id),
            )
            conn.commit()

            # 4. Generate images
            logger.info("Video %s: generating %d images", self.video_id, len(scenes))
            img_gen = ImageGenerator(os.path.join(self.work_dir, "images"))
            image_paths = img_gen.generate_batch(scenes)
            logger.info("Video %s: generated %d images", self.video_id, len(image_paths))

            # 5. Update status to "generating"
            conn.execute(
                "UPDATE videos SET status = ? WHERE id = ?",
                ("generating", self.video_id),
            )
            conn.commit()

            # 6. Generate TTS audio
            logger.info("Video %s: generating voiceover", self.video_id)
            tts = TTSGenerator(os.path.join(self.work_dir, "audio"))
            audio_path = tts.generate(narration)
            logger.info("Video %s: voiceover saved to %s", self.video_id, audio_path)

            # 7. Calculate durations
            audio_duration = Compositor.get_audio_duration(audio_path)
            target_duration = audio_duration if audio_duration > 0 else self.duration_secs
            durations = Compositor.calculate_text_durations(target_duration, scenes)
            logger.info(
                "Video %s: calculated scene durations from %.2fs audio",
                self.video_id,
                target_duration,
            )

            # 8. Generate captions
            logger.info("Video %s: writing captions", self.video_id)
            captions_path = os.path.join(self.work_dir, "captions.ass")
            cap = CaptionGenerator()
            cap.write(scenes, durations, captions_path)
            logger.info("Video %s: captions saved to %s", self.video_id, captions_path)

            # 9. Compose final video
            logger.info("Video %s: rendering final video", self.video_id)
            comp = Compositor(os.path.join(self.work_dir, "video"))
            video_path = comp.compose(image_paths, audio_path, captions_path, durations, self.video_id)
            final_video_path = self._publish_video(video_path)

            # 10. Update DB with final video path and status
            conn.execute(
                "UPDATE videos SET video_path = ?, status = ? WHERE id = ?",
                (final_video_path, "rendered", self.video_id),
            )
            conn.commit()

            logger.info("Video %s rendered at %s", self.video_id, final_video_path)
            return final_video_path
        finally:
            conn.close()

    def _publish_video(self, video_path: str) -> str:
        """Copy the rendered MP4 from the work directory to the public output folder."""
        videos_dir = os.path.join(self.output_dir, "videos")
        os.makedirs(videos_dir, exist_ok=True)
        final_video_path = os.path.join(videos_dir, f"{self.video_id}.mp4")
        shutil.copy2(video_path, final_video_path)
        return final_video_path

    @staticmethod
    def _select_narration(narration: str, scenes: list) -> str:
        """Use scene text when the model returns an incomplete narration field."""
        scene_narration = " ".join(
            scene.get("text", "").strip()
            for scene in scenes
            if scene.get("text", "").strip()
        ).strip()
        narration = (narration or "").strip()

        if not scene_narration:
            return narration
        if not narration:
            return scene_narration

        narration_words = len(narration.split())
        scene_words = len(scene_narration.split())
        if scene_words and narration_words < scene_words * MIN_NARRATION_SCENE_WORD_RATIO:
            logger.warning(
                "Narration field looks incomplete (%d words vs %d scene words); using scene text",
                narration_words,
                scene_words,
            )
            return scene_narration

        return narration


def main():
    """CLI entry point."""
    parser = argparse.ArgumentParser(description="Generate a video from a planned content row.")
    parser.add_argument("--video-id", required=True, type=int, help="Video ID from the database")
    parser.add_argument("--db-path", required=True, help="Path to the SQLite database")
    parser.add_argument("--output-dir", required=True, help="Directory for output files")
    parser.add_argument("--ollama-host", default="http://localhost:11434", help="Ollama API host")
    parser.add_argument("--ollama-model", default="llama3", help="Ollama model name")
    parser.add_argument("--duration-secs", default=210, type=int, help="Target video duration in seconds")
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO)

    gen = VideoGenerator(
        video_id=args.video_id,
        db_path=args.db_path,
        output_dir=args.output_dir,
        ollama_host=args.ollama_host,
        ollama_model=args.ollama_model,
        duration_secs=args.duration_secs,
    )
    gen.run()


if __name__ == "__main__":
    main()
