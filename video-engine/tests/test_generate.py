"""Integration test for VideoGenerator pipeline."""

import sys
import sqlite3
from unittest.mock import MagicMock, patch, ANY

import pytest

# Mock heavy third-party deps before generate.py imports them transitively
sys.modules.setdefault("moviepy", MagicMock())
sys.modules.setdefault("edge_tts", MagicMock())

from generate import VideoGenerator, VIDEO_COLUMNS  # noqa: E402


@pytest.fixture
def fake_db(tmp_path):
    """Create an in-memory-style SQLite DB file with one video plan row."""
    db_path = str(tmp_path / "test.db")
    conn = sqlite3.connect(db_path)
    conn.execute(
        """CREATE TABLE videos (
            id TEXT, niche TEXT, title TEXT, description TEXT,
            hashtags TEXT, tags TEXT, hook TEXT, script TEXT,
            thumbnail_text TEXT, scheduled_date TEXT, status TEXT,
            video_path TEXT, youtube_id TEXT
        )"""
    )
    conn.execute(
        "INSERT INTO videos VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
        ("vid_1", "tech", "AI in 2026", "desc", "#ai", "ai,tech",
         "Did you know AI can…", "", "AI 2026", "2026-05-01",
         "planned", "", ""),
    )
    conn.commit()
    conn.close()
    return db_path


@patch("generate.Compositor")
@patch("generate.CaptionGenerator")
@patch("generate.TTSGenerator")
@patch("generate.ImageGenerator")
@patch("generate.shutil.copy2")
@patch("generate.ScriptWriter")
def test_full_pipeline(
    MockWriter, mock_copy2, MockImageGen, MockTTS, MockCaption, MockCompositor,
    fake_db, tmp_path,
):
    """Mock every external dependency and verify the full pipeline calls."""
    # --- configure mocks ---
    script_data = {
        "narration": (
            "Hook text Scene 1 Scene 2 Scene 3 Scene 4 Scene 5 Scene 6 Outro text"
        ),
        "scenes": [
            {"scene": "hook", "text": "Hook text", "image_prompt": "hook img"},
            {"scene": "scene_1", "text": "Scene 1", "image_prompt": "s1 img"},
            {"scene": "scene_2", "text": "Scene 2", "image_prompt": "s2 img"},
            {"scene": "scene_3", "text": "Scene 3", "image_prompt": "s3 img"},
            {"scene": "scene_4", "text": "Scene 4", "image_prompt": "s4 img"},
            {"scene": "scene_5", "text": "Scene 5", "image_prompt": "s5 img"},
            {"scene": "scene_6", "text": "Scene 6", "image_prompt": "s6 img"},
            {"scene": "outro", "text": "Outro text", "image_prompt": "outro img"},
        ],
    }
    writer_inst = MockWriter.return_value
    writer_inst.generate.return_value = script_data

    image_paths = [f"/imgs/{i}.png" for i in range(8)]
    MockImageGen.return_value.generate_batch.return_value = image_paths

    MockTTS.return_value.generate.return_value = "/audio/narration.mp3"

    MockCaption.return_value.write.return_value = "/captions/captions.ass"

    MockCompositor.get_audio_duration.return_value = 210.0
    MockCompositor.calculate_text_durations.return_value = [15.0, 30.0, 30.0, 30.0, 30.0, 30.0, 30.0, 15.0]
    MockCompositor.return_value.compose.return_value = "/output/vid_1.mp4"

    # --- run pipeline ---
    output_dir = str(tmp_path / "output")
    gen = VideoGenerator(
        video_id="vid_1",
        db_path=fake_db,
        output_dir=output_dir,
        ollama_host="http://localhost:11434",
        ollama_model="llama3",
    )
    gen.run()

    # --- assertions ---
    writer_inst.generate.assert_called_once_with("AI in 2026", "Did you know AI can…", "tech")

    MockImageGen.return_value.generate_batch.assert_called_once_with(script_data["scenes"])

    MockTTS.return_value.generate.assert_called_once_with(script_data["narration"])

    MockCaption.return_value.write.assert_called_once_with(
        script_data["scenes"],
        [15.0, 30.0, 30.0, 30.0, 30.0, 30.0, 30.0, 15.0],
        ANY,
    )

    MockCompositor.return_value.compose.assert_called_once_with(
        image_paths,
        "/audio/narration.mp3",
        ANY,  # captions_path is a real work_dir path
        [15.0, 30.0, 30.0, 30.0, 30.0, 30.0, 30.0, 15.0],
        "vid_1",
    )
    mock_copy2.assert_called_once()

    # Verify DB was updated
    conn = sqlite3.connect(fake_db)
    row = conn.execute("SELECT status, video_path, script FROM videos WHERE id = 'vid_1'").fetchone()
    conn.close()
    assert row[0] == "rendered"
    assert row[1].endswith("videos/vid_1.mp4") or row[1].endswith(r"videos\vid_1.mp4")
    assert row[2] == script_data["narration"]


def test_select_narration_falls_back_to_scene_text():
    scenes = [
        {"text": "This is the actual first spoken scene."},
        {"text": "This is the actual second spoken scene with more detail."},
    ]

    result = VideoGenerator._select_narration("AI in 2026", scenes)

    assert result == (
        "This is the actual first spoken scene. "
        "This is the actual second spoken scene with more detail."
    )


def test_select_narration_keeps_complete_narration():
    scenes = [
        {"text": "Scene one words for the video."},
        {"text": "Scene two words for the video."},
    ]
    narration = "Scene one words for the video. Scene two words for the video."

    assert VideoGenerator._select_narration(narration, scenes) == narration
