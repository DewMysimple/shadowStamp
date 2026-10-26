"""Make a reproducible, uncropped video-versus-app contact sheet.

Run from anywhere: python scripts/compare-reference.py
Inputs are the measured video frames and the final browser verification images.
This is visual evidence, not an image-difference score: viewport aspect ratios,
original artwork and the requested sunlight treatment intentionally differ.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    names = (
        ["C:/Windows/Fonts/seguisb.ttf", "C:/Windows/Fonts/segoeui.ttf"]
        if bold
        else ["C:/Windows/Fonts/segoeui.ttf", "C:/Windows/Fonts/consola.ttf"]
    )
    for name in names:
        if Path(name).is_file():
            return ImageFont.truetype(name, size)
    return ImageFont.load_default(size=size)


def open_rgb(path: Path) -> Image.Image:
    if not path.is_file():
        raise FileNotFoundError(f"Missing comparison input: {path}")
    with Image.open(path) as source:
        return source.convert("RGB")


def background_patch(image: Image.Image, box: tuple[float, float, float, float]) -> dict:
    """Report real screenshot pixels in a stamp/text-free normalized rectangle."""
    w, h = image.size
    left, top, right, bottom = box
    a = np.asarray(image.crop((round(left*w), round(top*h), round(right*w), round(bottom*h))), dtype=float)
    luminance = a[..., 0] * .2126 + a[..., 1] * .7152 + a[..., 2] * .0722
    return {
        "normalized_patch": list(box),
        "mean_rgb": [round(float(x), 2) for x in a.mean(axis=(0, 1))],
        "luminance_p05": round(float(np.percentile(luminance, 5)), 2),
        "luminance_p95": round(float(np.percentile(luminance, 95)), 2),
        "luminance_p95_minus_p05": round(float(np.percentile(luminance, 95)-np.percentile(luminance, 5)), 2),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--output", type=Path, default=None)
    args = parser.parse_args()
    root = args.root.resolve()
    output = (args.output or root / "artifacts/comparison/reference-vs-result.jpg").resolve()
    rows = [
        ("01  INITIAL GALLERY", "Video 0.000 s / final idle state", "key-0.000s.jpg", "desktop-01-initial.png"),
        ("02  HOVER", "Video 0.505 s / final stable mouse hover", "key-0.505s.jpg", "desktop-02-hover.png"),
        ("03  FOCUSED VIEW", "Video 5.237 s / final focus progress 1", "key-5.237s.jpg", "desktop-04-focus.png"),
    ]
    pad, gap, panel_width, panel_height = 40, 32, 960, 644
    row_height = 742
    width = pad*2 + panel_width*2 + gap
    height = 170 + row_height*len(rows) + 72
    canvas = Image.new("RGB", (width, height), "#eae6dc")
    draw = ImageDraw.Draw(canvas)
    ink, muted = "#282921", "#67665e"
    draw.text((pad, 25), "REFERENCE VIDEO  /  FINAL LOCAL IMPLEMENTATION", font=font(34, True), fill=ink)
    draw.text((pad, 77), "2912 x 1952 (91:61)  vs  1440 x 900 (8:5)", font=font(23), fill=muted)
    draw.text((pad, 111), "Full frames, equal display width, original aspect ratios preserved. No cropping or geometric warping.", font=font(21), fill=muted)
    report = {"output": str(output), "display": "full-frame contain, equal width, preserved aspect", "inputs": [], "samples": {}}
    for index, (title, detail, video_name, app_name) in enumerate(rows):
        y = 170 + index*row_height
        draw.text((pad, y), title, font=font(26, True), fill=ink)
        draw.text((pad+365, y+3), detail, font=font(21), fill=muted)
        images = []
        for column, path in enumerate([root / "docs/reference" / video_name, root / "artifacts/verification" / app_name]):
            source = open_rgb(path)
            images.append(source)
            x = pad + column*(panel_width+gap)
            panel_y = y+48
            draw.rectangle((x, panel_y, x+panel_width, panel_y+panel_height), fill="#d3cec3")
            scaled = source.copy()
            scaled.thumbnail((panel_width, panel_height), Image.Resampling.LANCZOS)
            canvas.paste(scaled, (x+(panel_width-scaled.width)//2, panel_y+(panel_height-scaled.height)//2))
            label = "REFERENCE / VIDEO" if column == 0 else "RESULT / CHROME 1440 x 900"
            draw.text((x, panel_y+panel_height+13), label, font=font(19), fill=muted)
            report["inputs"].append({"file": str(path.relative_to(root)), "size": list(source.size), "sha256": hashlib.sha256(path.read_bytes()).hexdigest()})
        patch = (.10, .15, .90, .32) if index < 2 else (.08, .15, .16, .23)
        report["samples"][title] = {"reference": background_patch(images[0], patch), "result": background_patch(images[1], patch)}
    draw.text((pad, height-58), "Stamp-surface light follows the latest user requirement; all six print designs are original procedural artwork.", font=font(20), fill=muted)
    output.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(output, quality=94, subsampling=0)
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
