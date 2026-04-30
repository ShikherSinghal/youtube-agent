"""ASS (Advanced SubStation Alpha) caption generator with word wrapping."""

from pathlib import Path
from typing import List

MAX_CHARS_PER_LINE = 60

ASS_HEADER = """\
[Script Info]
Title: Generated Captions
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,56,&H00FFFFFF,&H000000FF,&H00000000,&H64000000,-1,0,0,0,100,100,0,0,1,2,1,2,10,10,50,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""


def _format_time(seconds: float) -> str:
    """Format seconds as H:MM:SS.CC (centiseconds)."""
    # Round to centiseconds first to avoid overflow in individual components
    total_cs = int(round(seconds * 100))
    h = total_cs // 360000
    total_cs %= 360000
    m = total_cs // 6000
    total_cs %= 6000
    whole = total_cs // 100
    cs = total_cs % 100
    return f"{h}:{m:02d}:{whole:02d}.{cs:02d}"


def _split_text(text: str, max_chars: int = MAX_CHARS_PER_LINE) -> List[str]:
    """Split text into chunks of at most *max_chars* at word boundaries."""
    words = text.split()
    chunks: List[str] = []
    current: List[str] = []
    length = 0

    for word in words:
        added = len(word) if length == 0 else len(word) + 1
        if length + added > max_chars and current:
            chunks.append(" ".join(current))
            current = [word]
            length = len(word)
        else:
            current.append(word)
            length += added

    if current:
        chunks.append(" ".join(current))

    return chunks if chunks else [text]


class CaptionGenerator:
    """Generates ASS subtitle files from scene text and durations."""

    def generate(self, scenes: List[dict], durations: List[float]) -> str:
        """Produce a full ASS content string.

        For each scene the text is split into word-wrapped chunks.  The scene
        duration is distributed evenly across its chunks so that every chunk
        gets roughly the same display time.
        """
        lines: List[str] = [ASS_HEADER.rstrip()]
        cursor = 0.0

        for scene, duration in zip(scenes, durations):
            text = scene["text"]
            chunks = _split_text(text)
            chunk_word_counts = [max(1, len(chunk.split())) for chunk in chunks]
            total_chunk_words = sum(chunk_word_counts)

            for chunk, word_count in zip(chunks, chunk_word_counts):
                start = _format_time(cursor)
                chunk_dur = duration * (word_count / total_chunk_words)
                cursor += chunk_dur
                end = _format_time(cursor)
                lines.append(
                    f"Dialogue: 0,{start},{end},Default,,0,0,0,,{chunk}"
                )

        return "\n".join(lines) + "\n"

    def write(self, scenes: List[dict], durations: List[float], output_path: str) -> str:
        """Generate ASS content and write it to *output_path*."""
        content = self.generate(scenes, durations)
        Path(output_path).parent.mkdir(parents=True, exist_ok=True)
        Path(output_path).write_text(content, encoding="utf-8")
        return output_path
