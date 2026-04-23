import os
import time
import logging
import urllib.parse
import requests

logger = logging.getLogger(__name__)


class ImageGenerator:
    POLLINATIONS_URL = "https://image.pollinations.ai/prompt/{prompt}?width=1920&height=1080&nologo=true"
    MAX_RETRIES = 3
    RETRY_DELAY = 5

    def __init__(self, output_dir: str):
        self.output_dir = output_dir
        os.makedirs(output_dir, exist_ok=True)

    def generate_image(self, prompt: str, scene_name: str) -> str:
        """Try Pollinations up to MAX_RETRIES, then fall back to SD. Returns path to saved PNG."""
        output_path = os.path.join(self.output_dir, f"{scene_name}.png")

        for attempt in range(self.MAX_RETRIES):
            result = self._generate_pollinations(prompt, output_path)
            if result is not None:
                return result
            if attempt < self.MAX_RETRIES - 1:
                logger.warning("Pollinations attempt %d failed, retrying in %ds...", attempt + 1, self.RETRY_DELAY)
                time.sleep(self.RETRY_DELAY)

        logger.warning("Pollinations failed after %d retries, falling back to Stable Diffusion", self.MAX_RETRIES)
        return self._generate_stable_diffusion(prompt, output_path)

    def generate_batch(self, scenes: list) -> list:
        """For each scene, generate_image(scene['image_prompt'], scene['scene'])."""
        paths = []
        for scene in scenes:
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
        """Import diffusers, generate with SD 1.5 on CPU."""
        from diffusers import StableDiffusionPipeline
        import torch

        pipe = StableDiffusionPipeline.from_pretrained(
            "runwayml/stable-diffusion-v1-5",
            torch_dtype=torch.float32,
        )
        pipe = pipe.to("cpu")

        image = pipe(prompt, num_inference_steps=25).images[0]
        image.save(output_path)

        logger.info("SD image saved to %s", output_path)
        return output_path
