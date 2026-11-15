"""Draw the 1200x630 social card for the website (docs/assets/og.png).

Pillow cannot read woff2, so this downloads the TTF fonts into a temporary folder (not committed).
Usage: python tools/make_og.py
"""
import tempfile
import urllib.request
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "docs" / "assets" / "og.png"
RAW = "https://raw.githubusercontent.com/google/fonts/main/"
W, H = 1200, 630

SLITS = [(212, 6), (240, 9), (270, 13), (302, 18), (336, 24), (372, 20)]  # same as src/shared/art.js (400 box)


def font_file(tmp: Path, rel: str) -> str:
    dest = tmp / Path(rel).name.replace("[", "_").replace("]", "_")
    if not dest.exists():
        req = urllib.request.Request(RAW + rel.replace("[", "%5B").replace("]", "%5D"), headers={"User-Agent": "Mozilla/5.0"})
        dest.write_bytes(urllib.request.urlopen(req, timeout=30).read())
    return str(dest)


def lerp(a, b, t):
    return tuple(round(x + (y - x) * t) for x, y in zip(a, b))


def main() -> None:
    with tempfile.TemporaryDirectory() as t:
        tmp = Path(t)
        script = font_file(tmp, "apache/yellowtail/Yellowtail-Regular.ttf")
        sans = font_file(tmp, "ofl/jost/Jost[wght].ttf")

        # Sky
        img = Image.new("RGB", (W, H))
        d = ImageDraw.Draw(img)
        for y in range(H):
            tt = y / H
            c = lerp((18, 6, 42), (27, 10, 51), min(tt / 0.48, 1)) if tt < 0.48 else lerp((27, 10, 51), (74, 18, 86), (tt - 0.48) / 0.52)
            d.line([(0, y), (W, y)], fill=c)

        # Slat sun on the right
        size = 560
        k = 4  # draw at 4x, then downsample, for a clean edge
        N = 400 * k
        sun = Image.new("RGBA", (N, N), (0, 0, 0, 0))
        grad = Image.new("RGBA", (N, N))
        gd = ImageDraw.Draw(grad)
        for y in range(N):
            tt = min(max((y / k - 10) / 380, 0), 1)
            c = lerp((255, 209, 102), (255, 138, 91), tt / 0.48) if tt < 0.48 else lerp((255, 138, 91), (255, 62, 150), (tt - 0.48) / 0.52)
            gd.line([(0, y), (N, y)], fill=c + (255,))
        mask = Image.new("L", (N, N), 0)
        md = ImageDraw.Draw(mask)
        md.ellipse((10 * k, 10 * k, 390 * k, 390 * k), fill=255)
        for y, h in SLITS:
            md.rectangle((0, y * k, N, (y + h) * k), fill=0)
        sun.paste(grad, (0, 0), mask)
        sun = sun.resize((size, size), Image.LANCZOS)
        img.paste(sun, (W - size + 70, 40), sun)

        # Neon wordmark with glow
        text = "Vice Blind"
        f = ImageFont.truetype(script, 210)
        glow = Image.new("RGB", (W, H), (0, 0, 0))
        gdw = ImageDraw.Draw(glow)
        gdw.text((70, 150), text, font=f, fill=(255, 62, 150))
        glow = glow.filter(ImageFilter.GaussianBlur(26))
        img = Image.composite(img, img, Image.new("L", (W, H), 255))
        from PIL import ImageChops
        img = ImageChops.add(img, glow)
        core = Image.new("RGB", (W, H), (0, 0, 0))
        ImageDraw.Draw(core).text((70, 150), text, font=f, fill=(255, 62, 150))
        img = ImageChops.add(img, core.filter(ImageFilter.GaussianBlur(5)))
        ImageDraw.Draw(img).text((70, 150), text, font=f, fill=(255, 224, 239))

        # Tagline
        sf = ImageFont.truetype(sans, 40)
        try:
            sf.set_variation_by_axes([500])
        except Exception:
            pass
        d2 = ImageDraw.Draw(img)
        d2.text((78, 420), "Hides GTA VI spoilers on every site,", font=sf, fill=(255, 233, 214))
        d2.text((78, 474), "until you can play it on PC.", font=sf, fill=(255, 143, 191))
        OUT.parent.mkdir(parents=True, exist_ok=True)
        img.save(OUT, optimize=True)
        print("wrote", OUT, f"{OUT.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
