"""Assemble the GitHub Pages site in docs/.

Copies the design pieces shared with the extension (so the site cannot drift from it) and prepares
the screenshots. docs/index.html, site.css and site.js are hand-written and not touched here.

Usage: python tools/build_site.py          (run tools/build.py and the e2e suite first for fresh screenshots)
"""
import shutil
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "src"
DOCS = ROOT / "docs"
SHOTS = ROOT / "test-results"

SHARED = {
    "ui/base.css": "assets/base.css",
    "ui/demo.css": "assets/demo.css",
    "ui/demo.js": "assets/demo.js",
    "ui/motion.js": "assets/motion.js",
    "shared/art.js": "assets/art.js",
    "content/content.css": "assets/content.css",
    "assets/fonts/Yellowtail-latin.woff2": "assets/fonts/Yellowtail-latin.woff2",
    "assets/fonts/Jost-latin.woff2": "assets/fonts/Jost-latin.woff2",
    "assets/fonts/LICENSE-Yellowtail.txt": "assets/fonts/LICENSE-Yellowtail.txt",
    "assets/fonts/OFL-Jost.txt": "assets/fonts/OFL-Jost.txt",
    "assets/icons/icon-48.png": "assets/icons/icon-48.png",
    "assets/icons/icon-128.png": "assets/icons/icon-128.png",
    "assets/icons/icon-512.png": "assets/icons/icon-512.png",
    "assets/icons/icon.svg": "assets/icons/icon.svg",
}

# (source screenshot, output name, crop box or None, max width)
IMAGES = [
    ("curtain.png", "curtain.webp", None, 1280),
    ("popup.png", "popup.webp", (0, 0, 380, 760), 380),
    ("options.png", "settings.webp", (0, 0, 1280, 1000), 1280),
]


def main() -> int:
    missing = []
    for src, dst in SHARED.items():
        s, d = SRC / src, DOCS / dst
        if not s.exists():
            missing.append(str(s))
            continue
        d.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(s, d)
    for name, out, box, width in IMAGES:
        s = SHOTS / name
        if not s.exists():
            missing.append(str(s))
            continue
        im = Image.open(s).convert("RGB")
        if box:
            im = im.crop(box)
        if im.width > width:
            im = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)
        (DOCS / "assets" / "img").mkdir(parents=True, exist_ok=True)
        im.save(DOCS / "assets" / "img" / out, "WEBP", quality=86, method=6)
        print(f"{out}: {im.width}x{im.height}")
    (DOCS / ".nojekyll").write_text("", encoding="utf-8")
    if missing:
        print("missing:", *missing, sep="\n  ", file=sys.stderr)
        return 1
    print("site assets ready in", DOCS)
    return 0


if __name__ == "__main__":
    sys.exit(main())
