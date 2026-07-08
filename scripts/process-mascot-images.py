"""
process-mascot-images.py — Downscale Pedal mascot PNGs (audit 2026-07-05 PERF-1).

The mascot art ships at 1024-2194px but every render site uses size xs-lg
(28-120px). React Native decodes the PNG at full resolution before scaling,
so each source image costs several MB of RAM for a thumbnail-sized draw.

This resizes each pose in place to a single 360px master (3x the largest
120px render, ample for high-DPI) preserving aspect ratio + alpha, using
high-quality Lanczos resampling. Filenames stay identical so no code or
manifest (mascotPoses.ts) changes are needed.

Run from the repo root:
    python3 scripts/process-mascot-images.py
    python3 scripts/process-mascot-images.py --dry-run
"""

from __future__ import annotations

import argparse
import glob
import os

from PIL import Image

MASCOT_DIR = os.path.join("apps", "mobile", "assets", "mascot")
TARGET_MAX_EDGE = 360


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="Report only, don't write.")
    args = parser.parse_args()

    paths = sorted(glob.glob(os.path.join(MASCOT_DIR, "*.png")))
    if not paths:
        print(f"No PNGs found in {MASCOT_DIR}")
        return

    total_before = 0
    total_after = 0
    for path in paths:
        before = os.path.getsize(path)
        total_before += before
        with Image.open(path) as img:
            img = img.convert("RGBA")
            w, h = img.size
            longest = max(w, h)
            if longest <= TARGET_MAX_EDGE:
                total_after += before
                print(f"skip  {os.path.basename(path):28} {w}x{h} (already small)")
                continue
            scale = TARGET_MAX_EDGE / longest
            new_size = (round(w * scale), round(h * scale))
            resized = img.resize(new_size, Image.LANCZOS)
            if args.dry_run:
                total_after += before
                print(f"would {os.path.basename(path):28} {w}x{h} -> {new_size[0]}x{new_size[1]}")
                continue
            resized.save(path, "PNG", optimize=True)
        after = os.path.getsize(path)
        total_after += after
        print(f"ok    {os.path.basename(path):28} {w}x{h} -> {new_size[0]}x{new_size[1]}  "
              f"{before // 1024}KB -> {after // 1024}KB")

    print(f"\nTotal: {total_before // 1024}KB -> {total_after // 1024}KB "
          f"({100 * (total_before - total_after) // max(total_before, 1)}% smaller)")


if __name__ == "__main__":
    main()
