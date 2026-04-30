import importlib.util
import os
import time
import logging
import textwrap
import urllib.parse
import requests
from PIL import Image, ImageDraw, ImageFont

logger = logging.getLogger(__name__)


class ImageGenerator:
    POLLINATIONS_URL = "https://image.pollinations.ai/prompt/{prompt}?width=1920&height=1080&nologo=true"
    IMAGE_SIZE = (1920, 1080)
    MAX_RETRIES = 3
    RETRY_DELAY = 5

    def __init__(self, output_dir: str):
        self.output_dir = output_dir
        self._pollinations_enabled = True
        self._stable_diffusion_enabled = True
        self._stable_diffusion_pipeline = None
        os.makedirs(output_dir, exist_ok=True)

    def generate_image(self, prompt: str, scene_name: str) -> str:
        """Generate an image and degrade gracefully through available fallbacks."""
        output_path = os.path.join(self.output_dir, f"{scene_name}.png")

        if self._pollinations_enabled:
            for attempt in range(self.MAX_RETRIES):
                result = self._generate_pollinations(prompt, output_path)
                if result is not None:
                    return result
                if attempt < self.MAX_RETRIES - 1:
                    logger.warning(
                        "Pollinations attempt %d failed, retrying in %ds...",
                        attempt + 1,
                        self.RETRY_DELAY,
                    )
                    time.sleep(self.RETRY_DELAY)

            logger.warning(
                "Pollinations failed after %d retries; disabling it for remaining scenes",
                self.MAX_RETRIES,
            )
            self._pollinations_enabled = False
        else:
            logger.info("Skipping Pollinations because it was previously marked unavailable")

        if self._stable_diffusion_enabled:
            try:
                return self._generate_stable_diffusion(prompt, output_path)
            except Exception as exc:
                self._stable_diffusion_enabled = False
                logger.warning(
                    "Stable Diffusion fallback is unavailable; using placeholder images instead: %s",
                    exc,
                )
        else:
            logger.info("Skipping Stable Diffusion because it was previously marked unavailable")

        return self._generate_placeholder(prompt, scene_name, output_path)

    def generate_batch(self, scenes: list) -> list:
        """For each scene, generate_image(scene['image_prompt'], scene['scene'])."""
        paths = []
        for index, scene in enumerate(scenes, start=1):
            logger.info("Generating image %d/%d: %s", index, len(scenes), scene["scene"])
            path = self.generate_image(scene["image_prompt"], scene["scene"])
            paths.append(path)
        return paths

    def _generate_pollinations(self, prompt: str, output_path: str):
        """GET request to Pollinations URL with encoded prompt, save to output_path."""
        encoded_prompt = urllib.parse.quote(prompt)
        url = self.POLLINATIONS_URL.format(prompt=encoded_prompt)

        try:
            response = requests.get(url, timeout=60)
            response.raise_for_status()

            with open(output_path, "wb") as f:
                f.write(response.content)

            logger.info("Image saved to %s", output_path)
            return output_path
        except Exception as e:
            logger.error("Pollinations request failed: %s", e)
            return None

    def _generate_stable_diffusion(self, prompt: str, output_path: str) -> str:
        """Generate with a cached local Stable Diffusion pipeline."""
        pipe = self._load_stable_diffusion_pipeline()
        image = pipe(prompt, num_inference_steps=25).images[0]
        image.save(output_path)

        logger.info("SD image saved to %s", output_path)
        return output_path

    def _load_stable_diffusion_pipeline(self):
        """Load Stable Diffusion once and reuse it for later scenes."""
        if self._stable_diffusion_pipeline is not None:
            return self._stable_diffusion_pipeline

        missing_modules = [
            module_name
            for module_name in ("diffusers", "torch", "transformers")
            if importlib.util.find_spec(module_name) is None
        ]
        if missing_modules:
            raise RuntimeError(
                "Stable Diffusion dependencies are missing. Install video-engine requirements "
                f"to add: {', '.join(missing_modules)}."
            )

        try:
            from diffusers import StableDiffusionPipeline
            import torch
        except ImportError as exc:
            raise RuntimeError(
                "Stable Diffusion dependencies are missing. Install video-engine requirements, "
                "including transformers, to enable the local model fallback."
            ) from exc

        try:
            pipe = StableDiffusionPipeline.from_pretrained(
                "runwayml/stable-diffusion-v1-5",
                torch_dtype=torch.float32,
                local_files_only=True,
            )
        except Exception as exc:
            raise RuntimeError(
                "Stable Diffusion model weights are not available locally. Cache "
                "'runwayml/stable-diffusion-v1-5' to enable the local model fallback."
            ) from exc

        self._stable_diffusion_pipeline = pipe.to("cpu")
        return self._stable_diffusion_pipeline

    def _generate_placeholder(self, prompt: str, scene_name: str, output_path: str) -> str:
        """Create a readable placeholder so the video job can still complete."""
        image = Image.new("RGB", self.IMAGE_SIZE, "#101826")
        draw = ImageDraw.Draw(image)

        draw.rectangle(
            (48, 48, self.IMAGE_SIZE[0] - 48, self.IMAGE_SIZE[1] - 48),
            outline="#4CC9F0",
            width=6,
        )
        draw.rectangle(
            (96, 96, self.IMAGE_SIZE[0] - 96, self.IMAGE_SIZE[1] - 96),
            fill="#162033",
            outline="#23324D",
            width=3,
        )

        title_font = self._load_font(42)
        body_font = self._load_font(28)
        title = scene_name.replace("_", " ").upper()
        body = "\n".join(textwrap.wrap(prompt, width=58))

        draw.text((140, 150), "IMAGE PLACEHOLDER", fill="#F4D35E", font=title_font)
        draw.text((140, 240), f"Scene: {title}", fill="#FFFFFF", font=body_font)
        draw.multiline_text(
            (140, 320),
            body,
            fill="#D7E3FC",
            font=body_font,
            spacing=12,
        )
        draw.text(
            (140, self.IMAGE_SIZE[1] - 180),
            "Pollinations and Stable Diffusion were unavailable for this scene.",
            fill="#9DB4D3",
            font=body_font,
        )

        image.save(output_path)
        logger.info("Placeholder image saved to %s", output_path)
        return output_path

    def _load_font(self, size: int):
        """Use a common truetype font when available, otherwise fall back to Pillow's default."""
        for font_name in ("arial.ttf", "DejaVuSans.ttf", "LiberationSans-Regular.ttf"):
            try:
                return ImageFont.truetype(font_name, size=size)
            except OSError:
                continue

        return ImageFont.load_default()
