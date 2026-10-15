"""Generate app icons from the approved artwork. Requires Pillow."""

from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"

with Image.open(ROOT / "assets/branding/icon-source.png") as source:
    artwork = source.convert("RGB")
    for filename, size in (
        ("icon-192.png", 192),
        ("icon-512.png", 512),
        ("apple-touch-icon.png", 180),
        ("favicon.png", 64),
    ):
        artwork.resize((size, size), Image.Resampling.LANCZOS).save(
            PUBLIC / filename, optimize=True
        )

    # Keep the whole D inside Android's central circular mask safe area.
    maskable = Image.new("RGB", (512, 512), "#111218")
    maskable.paste(artwork.resize((448, 448), Image.Resampling.LANCZOS), (32, 32))
    maskable.save(PUBLIC / "icon-maskable.png", optimize=True)
