"""Tests for the video compositor module."""

import os
import sys
from unittest.mock import patch, MagicMock
import pytest

# Mock moviepy before importing compositor
mock_moviepy = MagicMock()
sys.modules["moviepy"] = mock_moviepy

from scripts.compositor import Compositor  # noqa: E402


class TestCompositor:
    """Tests for Compositor class."""

    @patch("scripts.compositor.subprocess")
    @patch("scripts.compositor.concatenate_videoclips")
    @patch("scripts.compositor.CompositeVideoClip")
    @patch("scripts.compositor.ImageClip")
    @patch("scripts.compositor.AudioFileClip")
    def test_compose_creates_video(
        self,
        mock_audio_cls,
        mock_img_cls,
        mock_composite_cls,
        mock_concat,
        mock_subprocess,
        tmp_path,
    ):
        """Compose should create ImageClips for each image and produce an .mp4 file."""
        # Setup mocks
        mock_audio = MagicMock()
        mock_audio.duration = 210.0
        mock_audio_cls.return_value = mock_audio

        # Build the ImageClip mock chain:
        # ImageClip().with_duration().resized().with_position().with_effects()
        mock_img_instance = MagicMock()
        mock_img_with_dur = MagicMock()
        mock_img_resized = MagicMock()
        mock_img_positioned = MagicMock()
        mock_img_effected = MagicMock()

        mock_img_instance.with_duration.return_value = mock_img_with_dur
        mock_img_with_dur.resized.return_value = mock_img_resized
        mock_img_resized.with_position.return_value = mock_img_positioned
        mock_img_positioned.with_effects.return_value = mock_img_effected

        mock_img_cls.return_value = mock_img_instance

        # concatenate_videoclips returns a mock clip
        mock_video = MagicMock()
        mock_concat.return_value = mock_video

        # CompositeVideoClip returns a mock with write_videofile
        mock_final = MagicMock()
        mock_composite_cls.return_value = mock_final
        mock_final.with_audio.return_value = mock_final

        output_dir = str(tmp_path / "output")
        compositor = Compositor(output_dir)

        image_paths = [f"/tmp/img_{i}.png" for i in range(8)]
        durations = [15.0] + [30.0] * 6 + [15.0]
        captions_path = "/tmp/captions.ass"

        result = compositor.compose(
            image_paths=image_paths,
            audio_path="/tmp/audio.mp3",
            captions_path=captions_path,
            durations=durations,
            video_id="test123",
        )

        # Verify 8 ImageClips were created
        assert mock_img_cls.call_count == 8

        # Result should end with .mp4
        assert result.endswith(".mp4")

        filter_arg = mock_subprocess.run.call_args[0][0][5]
        assert filter_arg.startswith("ass=filename='")
        assert filter_arg.endswith("'")

    def test_calculates_scene_durations(self):
        """calculate_durations should return correct durations for 8 scenes totalling ~210s."""
        durations = Compositor.calculate_durations(total_duration=210.0, num_scenes=8)

        # Should return 8 durations
        assert len(durations) == 8

        # Hook (first) should be ~15s
        assert durations[0] == pytest.approx(15.0, abs=1.0)

        # Outro (last) should be ~15s
        assert durations[-1] == pytest.approx(15.0, abs=1.0)

        # Total should be ~210s
        assert sum(durations) == pytest.approx(210.0, abs=0.1)

    def test_short_audio_durations_are_split_evenly(self):
        durations = Compositor.calculate_durations(total_duration=8.0, num_scenes=8)

        assert durations == [1.0] * 8

    def test_calculates_text_weighted_durations(self):
        scenes = [
            {"text": "one two"},
            {"text": "three four five six"},
        ]

        durations = Compositor.calculate_text_durations(12.0, scenes)

        assert durations == pytest.approx([4.0, 8.0])

    @patch("scripts.compositor.AudioFileClip")
    def test_get_audio_duration_closes_clip(self, mock_audio_cls):
        mock_audio = MagicMock()
        mock_audio.duration = 42.5
        mock_audio_cls.return_value = mock_audio

        assert Compositor.get_audio_duration("/tmp/audio.mp3") == 42.5
        mock_audio.close.assert_called_once()

    @pytest.mark.skipif(os.name != "nt", reason="Windows-only ffmpeg path escaping")
    def test_builds_windows_safe_ass_filter(self):
        filter_arg = Compositor._build_ass_filter(
            r"C:\Users\singh\OneDrive\Documents\Projects\youtube-agent\output\work_1\captions.ass"
        )

        assert filter_arg == (
            "ass=filename='C\\:/Users/singh/OneDrive/Documents/Projects/"
            "youtube-agent/output/work_1/captions.ass'"
        )
