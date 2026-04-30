"""Video compositor — assembles final video from images, audio, and captions."""

import os
import subprocess
from moviepy import ImageClip, AudioFileClip, CompositeVideoClip, concatenate_videoclips, vfx

RESOLUTION = (1920, 1080)
FPS = 24
CROSSFADE = 0.5


class Compositor:
    """Composes final video from images, audio, and captions using moviepy."""

    def __init__(self, output_dir: str) -> None:
        self.output_dir = output_dir
        os.makedirs(output_dir, exist_ok=True)

    @staticmethod
    def calculate_durations(total_duration: float, num_scenes: int) -> list:
        """Calculate per-scene durations.

        Hook (first scene) = 15s, outro (last scene) = 15s,
        remaining time split evenly among middle scenes.
        For 1 scene, the entire duration goes to that scene.
        For 2 scenes, split evenly between hook and outro.
        """
        if num_scenes <= 0:
            return []
        if num_scenes == 1:
            return [total_duration]
        if num_scenes == 2:
            return [total_duration / 2, total_duration / 2]
        if total_duration <= 30:
            return [total_duration / num_scenes] * num_scenes
        hook = 15.0
        outro = 15.0
        remaining = total_duration - hook - outro
        middle_count = num_scenes - 2
        middle_dur = remaining / middle_count
        return [hook] + [middle_dur] * middle_count + [outro]

    @staticmethod
    def calculate_text_durations(total_duration: float, scenes: list) -> list:
        """Allocate scene durations in proportion to spoken word counts."""
        if not scenes:
            return []

        word_counts = [
            max(1, len(scene.get("text", "").split()))
            for scene in scenes
        ]
        total_words = sum(word_counts)
        if total_words <= 0:
            return Compositor.calculate_durations(total_duration, len(scenes))

        return [
            total_duration * (word_count / total_words)
            for word_count in word_counts
        ]

    @staticmethod
    def get_audio_duration(audio_path: str) -> float:
        """Return the audio duration in seconds."""
        audio = AudioFileClip(audio_path)
        try:
            return float(audio.duration or 0)
        finally:
            audio.close()

    def compose(
        self,
        image_paths: list,
        audio_path: str,
        captions_path: str,
        durations: list,
        video_id: str,
        bg_music_path: str = None,
    ) -> str:
        """Compose final video from images, audio, and captions.

        Returns the path to the final .mp4 file.
        """
        # Load audio
        audio = AudioFileClip(audio_path)

        # Create image clips with Ken Burns effect
        clips = []
        for i, (img_path, dur) in enumerate(zip(image_paths, durations)):
            clip = ImageClip(img_path)
            clip = clip.with_duration(dur)
            clip = clip.resized(RESOLUTION)
            clip = clip.with_position("center")

            # Alternate zoom-in / zoom-out Ken Burns effect
            if i % 2 == 0:
                # Zoom in: scale from 1.0 to 1.1
                clip = clip.with_effects([
                    vfx.Resize(lambda t, d=dur: 1 + 0.1 * (t / d))
                ])
            else:
                # Zoom out: scale from 1.1 to 1.0
                clip = clip.with_effects([
                    vfx.Resize(lambda t, d=dur: 1.1 - 0.1 * (t / d))
                ])

            clips.append(clip)

        # Concatenate all clips
        video = concatenate_videoclips(clips, method="compose")

        # Composite and set audio
        final = CompositeVideoClip([video])
        final = final.with_audio(audio)

        # Write temporary video file
        temp_path = os.path.join(self.output_dir, f"{video_id}_temp.mp4")
        final.write_videofile(
            temp_path,
            fps=FPS,
            codec="libx264",
            audio_codec="aac",
        )

        # Burn subtitles
        output_path = self._burn_subtitles(temp_path, captions_path, video_id)
        return output_path

    def _burn_subtitles(self, video_path: str, captions_path: str, video_id: str) -> str:
        """Burn ASS subtitles into the video via ffmpeg.

        Renames original to temp, runs ffmpeg, removes temp.
        """
        output_path = os.path.join(self.output_dir, f"{video_id}.mp4")
        temp_path = video_path  # already a temp file

        subprocess.run(
            [
                "ffmpeg", "-y",
                "-i", temp_path,
                "-vf", self._build_ass_filter(captions_path),
                "-map", "0:v:0",
                "-map", "0:a:0",
                "-c:v", "libx264",
                "-c:a", "aac",
                "-b:a", "192k",
                "-ar", "48000",
                "-ac", "2",
                "-af", "loudnorm=I=-16:TP=-1.5:LRA=11",
                "-movflags", "+faststart",
                output_path,
            ],
            check=True,
        )

        # Clean up temp file
        if os.path.exists(temp_path):
            os.remove(temp_path)

        return output_path

    @staticmethod
    def _build_ass_filter(captions_path: str) -> str:
        """Build an ffmpeg `ass` filter string that works with Windows paths."""
        normalized_path = os.path.abspath(captions_path).replace("\\", "/")
        if len(normalized_path) >= 2 and normalized_path[1] == ":":
            normalized_path = normalized_path[0] + r"\:" + normalized_path[2:]
        escaped_path = normalized_path.replace("'", r"\'")
        return f"ass=filename='{escaped_path}'"
