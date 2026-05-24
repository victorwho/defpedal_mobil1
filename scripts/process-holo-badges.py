"""
process-holo-badges.py — Background-remove holographic badge PNGs.

The source artwork ships with a near-black background baked in (RGB ~10-18),
which renders as a dark square behind the sticker in the HoloSticker atom.
This script flood-fills from each corner with a tolerance that catches the
background's natural variation, then writes an RGBA PNG with the corner-
reachable pixels set to alpha=0. Pixels enclosed inside the holographic rim
(including dark outlines and details) are preserved with alpha=255.

Edges get one pass of a 1px Gaussian blur, then a tight threshold to keep
the interior fully opaque while smoothing the cutout perimeter.

Run from the repo root:
    python3 scripts/process-holo-badges.py
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter


CORNER_FILL_TOLERANCE = 40  # background variation: corner = (10..18); 40 covers edge dither
EDGE_BLUR_RADIUS = 1.0
ALPHA_HARD_OPAQUE = 200  # alpha >= this → forced 255
ALPHA_HARD_TRANSPARENT = 30  # alpha < this → forced 0
MARKER = (255, 0, 255)


def process_png(path: Path) -> tuple[bool, str]:
    img = Image.open(path)
    if img.mode == "RGBA":
        # Already has alpha — check if corners are already transparent.
        corner = img.getpixel((0, 0))
        if corner[3] == 0:
            return False, "already has transparent corners; skipped"
    img = img.convert("RGBA")
    width, height = img.size

    # Flood-fill from the four corners to mark background.
    rgb_copy = img.convert("RGB").copy()
    for corner in [(0, 0), (width - 1, 0), (0, height - 1), (width - 1, height - 1)]:
        ImageDraw.floodfill(rgb_copy, corner, MARKER, thresh=CORNER_FILL_TOLERANCE)

    # Build alpha from flood-fill result.
    alpha_data = [0 if px == MARKER else 255 for px in rgb_copy.getdata()]
    alpha = Image.new("L", (width, height))
    alpha.putdata(alpha_data)

    # Soften the edge slightly, then re-threshold to keep the interior solid.
    alpha = alpha.filter(ImageFilter.GaussianBlur(radius=EDGE_BLUR_RADIUS))
    smoothed = [
        255 if v >= ALPHA_HARD_OPAQUE else (0 if v < ALPHA_HARD_TRANSPARENT else v)
        for v in alpha.getdata()
    ]
    alpha.putdata(smoothed)

    r, g, b, _ = img.split()
    out = Image.merge("RGBA", (r, g, b, alpha))
    out.save(path, "PNG", optimize=True)
    return True, "processed"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--dir",
        default="apps/mobile/assets/holo_badges",
        help="Directory containing PNGs to process (relative to repo root).",
    )
    args = parser.parse_args()

    repo_root = Path(__file__).resolve().parent.parent
    target_dir = repo_root / args.dir
    if not target_dir.is_dir():
        print(f"ERROR: {target_dir} is not a directory", file=sys.stderr)
        return 1

    pngs = sorted(p for p in target_dir.glob("*.png") if not p.stem.endswith("_TEST"))
    print(f"Processing {len(pngs)} PNGs in {target_dir}")
    processed = 0
    skipped = 0
    for png in pngs:
        changed, msg = process_png(png)
        marker = "[+]" if changed else "[ ]"
        print(f"  {marker} {png.name}: {msg}")
        if changed:
            processed += 1
        else:
            skipped += 1
    print(f"\nDone. Processed: {processed}  Skipped: {skipped}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
