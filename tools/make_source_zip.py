"""Write dist/vice-blind-source-<version>.zip: the committed source tree, for store reviewers.

Mozilla may ask for source when a package contains generated files. Here the only generated file is
content/content-css.js (made from content/content.css by tools/build.py). README.md and PUBLISHING.md
in the zip explain how to rebuild the package from source.

Usage: python tools/make_source_zip.py
"""
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def main() -> int:
    version = json.loads((ROOT / "src" / "manifest.json").read_text(encoding="utf-8"))["version"]
    out = ROOT / "dist" / f"vice-blind-source-{version}.zip"
    out.parent.mkdir(exist_ok=True)
    # git archive packs exactly what is committed (no node_modules, dist or test output).
    r = subprocess.run(
        ["git", "archive", "--format=zip", f"--prefix=vice-blind-{version}/", "-o", str(out), "HEAD"],
        cwd=ROOT, capture_output=True, text=True,
    )
    if r.returncode != 0:
        print(r.stderr, file=sys.stderr)
        return 1
    print(f"{out.name}: {out.stat().st_size / 1024:.0f} KB (from the committed tree; commit first if you changed files)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
