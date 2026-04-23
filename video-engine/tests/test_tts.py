import os
from unittest.mock import patch, AsyncMock, MagicMock

from scripts.tts import TTSGenerator


@patch("scripts.tts.edge_tts.Communicate")
def test_generates_audio_file(mock_communicate_cls, tmp_path):
    mock_instance = MagicMock()
    mock_instance.save = AsyncMock()
    mock_communicate_cls.return_value = mock_instance

    tts = TTSGenerator(output_dir=str(tmp_path))
    result = tts.generate("Hello world")

    expected_path = os.path.join(str(tmp_path), "narration.mp3")
    assert result == expected_path
    mock_communicate_cls.assert_called_once_with("Hello world", voice="en-US-ChristopherNeural")
    mock_instance.save.assert_awaited_once_with(expected_path)


@patch("scripts.tts.edge_tts.Communicate")
def test_uses_specified_voice(mock_communicate_cls, tmp_path):
    mock_instance = MagicMock()
    mock_instance.save = AsyncMock()
    mock_communicate_cls.return_value = mock_instance

    tts = TTSGenerator(output_dir=str(tmp_path), voice="en-US-GuyNeural")
    tts.generate("Test text", filename="custom.mp3")

    mock_communicate_cls.assert_called_once_with("Test text", voice="en-US-GuyNeural")
