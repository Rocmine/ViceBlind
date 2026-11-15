"""Download the two self-hosted fonts (latin subset, variable woff2) and their OFL licences.

Usage: python tools/fetch_fonts.py
Writes src/assets/fonts/{Unbounded-latin.woff2, JetBrainsMono-latin.woff2, OFL-*.txt}.
"""
import re
import sys
import urllib.request
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "src" / "assets" / "fonts"
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/130.0 Safari/537.36")

FONTS = {
    "Unbounded-latin.woff2": "https://fonts.googleapis.com/css2?family=Unbounded:wght@400..900&display=swap",
    "JetBrainsMono-latin.woff2": "https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400..700&display=swap",
}
LICENCES = {
    "OFL-Unbounded.txt": "https://raw.githubusercontent.com/google/fonts/main/ofl/unbounded/OFL.txt",
    "OFL-JetBrainsMono.txt": "https://raw.githubusercontent.com/google/fonts/main/ofl/jetbrainsmono/OFL.txt",
}


def get(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read()


def latin_url(css: str) -> str:
    # Blocks look like: /* latin */ @font-face { ... src: url(...) format('woff2'); ... }
    m = re.search(r"/\*\s*latin\s*\*/\s*@font-face\s*{[^}]*?url\((https://[^)]+)\)", css)
    if not m:
        sys.exit("latin block not found in Google Fonts CSS")
    return m.group(1)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for name, css_url in FONTS.items():
        url = latin_url(get(css_url).decode("utf-8"))
        data = get(url)
        (OUT / name).write_bytes(data)
        print(f"{name}: {len(data):,} bytes")
    for name, url in LICENCES.items():
        (OUT / name).write_bytes(get(url))
        print(f"{name}: ok")


if __name__ == "__main__":
    main()
