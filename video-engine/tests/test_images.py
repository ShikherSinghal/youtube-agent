import os
import pytest
from unittest.mock import patch, MagicMock
from PIL import Image
from scripts.images import ImageGenerator


@pytest.fixture
def output_dir(tmp_path):
    return str(tmp_path / "images")


@pytest.fixture
def generator(output_dir):
    return ImageGenerator(output_dir)


def _mock_ok_response():
    resp = MagicMock()
    resp.status_code = 200
    resp.content = b"\x89PNG\r\n\x1a\n" + b"\x00" * 100  # fake PNG bytes
    resp.raise_for_status = MagicMock()
    return resp


class TestImageGenerator:

    @patch("scripts.images.requests.get")
    def test_generates_image_via_pollinations(self, mock_get, generator):
        mock_get.return_value = _mock_ok_response()

        path = generator.generate_image("a sunset over mountains", "scene_01")

        assert path.endswith("scene_01.png")
        called_url = mock_get.call_args[0][0]
        assert "pollinations.ai" in called_url

    @patch("scripts.images.requests.get")
    def test_saves_image_to_correct_path(self, mock_get, generator, output_dir):
        mock_get.return_value = _mock_ok_response()

        path = generator.generate_image("a forest clearing", "intro")

        expected = os.path.join(output_dir, "intro.png")
        assert path == expected
        assert os.path.isfile(path)

    @patch("scripts.images.time.sleep")
    @patch("scripts.images.requests.get")
    def test_retries_on_pollinations_failure(self, mock_get, mock_sleep, generator):
        fail_resp = MagicMock()
        fail_resp.status_code = 500
        fail_resp.raise_for_status.side_effect = Exception("Server Error")

        mock_get.side_effect = [fail_resp, _mock_ok_response()]

        path = generator.generate_image("a rainy city", "scene_02")

        assert mock_get.call_count == 2
        assert path is not None
        assert path.endswith("scene_02.png")

    @patch("scripts.images.requests.get")
    def test_generates_batch_of_images(self, mock_get, generator):
        mock_get.return_value = _mock_ok_response()

        scenes = [
            {"image_prompt": "prompt one", "scene": "scene_a"},
            {"image_prompt": "prompt two", "scene": "scene_b"},
            {"image_prompt": "prompt three", "scene": "scene_c"},
        ]

        paths = generator.generate_batch(scenes)

        assert len(paths) == 3
        assert all(p.endswith(".png") for p in paths)

    @patch("scripts.images.time.sleep")
    @patch.object(ImageGenerator, "_generate_stable_diffusion")
    @patch("scripts.images.requests.get")
    def test_disables_pollinations_after_full_failure(
        self, mock_get, mock_sd, mock_sleep, generator
    ):
        mock_get.side_effect = Exception("timeout")
        mock_sd.side_effect = lambda prompt, path: path

        generator.generate_image("prompt one", "scene_1")
        generator.generate_image("prompt two", "scene_2")

        assert mock_get.call_count == generator.MAX_RETRIES
        assert mock_sd.call_count == 2

    @patch("scripts.images.time.sleep")
    @patch.object(ImageGenerator, "_generate_stable_diffusion", side_effect=RuntimeError("missing deps"))
    @patch("scripts.images.requests.get")
    def test_falls_back_to_placeholder_when_sd_unavailable(
        self, mock_get, mock_sd, mock_sleep, generator
    ):
        mock_get.side_effect = Exception("timeout")

        path = generator.generate_image("a futuristic city skyline at sunrise", "scene_3")

        assert os.path.isfile(path)
        with Image.open(path) as image:
            assert image.size == generator.IMAGE_SIZE
        assert mock_get.call_count == generator.MAX_RETRIES
        assert mock_sd.call_count == 1
