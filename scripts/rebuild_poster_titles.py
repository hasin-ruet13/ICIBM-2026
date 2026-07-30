#!/usr/bin/env python3
from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path


POSTER_PATTERN = re.compile(
    r"Poster\s+P(\d+)\s+Title:\s*(.*?)\s+Author list:\s*(.*?)\s+Detailed Affiliations:",
    re.S,
)


def main() -> int:
    repo_root = Path(__file__).resolve().parents[1]
    pdf_path = repo_root / "ICIBM2026_Program_Book_07_23_2026.pdf"
    output_path = repo_root / "icibm2026_poster_titles.json"

    if not pdf_path.exists():
        print(f"Missing program book PDF: {pdf_path}", file=sys.stderr)
        return 1

    text = subprocess.check_output(["pdftotext", str(pdf_path), "-"], text=True, errors="replace")
    start = text.find("POSTER SESSION")
    if start < 0:
        print("Could not find poster session in program book.", file=sys.stderr)
        return 1

    poster_text = text[start:]
    posters = []
    for match in POSTER_PATTERN.finditer(poster_text):
        poster_id = f"P{match.group(1)}"
        title = normalize_whitespace(match.group(2))
        authors = normalize_whitespace(match.group(3))
        posters.append({"id": poster_id, "title": title, "authors": authors})

    output_path.write_text(json.dumps(posters, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Wrote {len(posters)} poster entries to {output_path}")
    return 0


def normalize_whitespace(text: str) -> str:
    return " ".join(text.split())


if __name__ == "__main__":
    raise SystemExit(main())
