#!/usr/bin/env python3
from __future__ import annotations

import re
import sys
from pathlib import Path
from zipfile import ZipFile
import xml.etree.ElementTree as ET


NS = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
DAY_RE = re.compile(r"^(Sunday|Monday|Tuesday|Wednesday),\s+August\s+\d{1,2}(?:st|nd|rd|th),\s+2026$")
TIME_RANGE_RE = re.compile(r"^(\d{1,2}:\d{2}\s*(?:AM|PM))\s*[–-]\s*(\d{1,2}:\d{2}\s*(?:AM|PM))", re.I)
TIME_START_RE = re.compile(r"^(\d{1,2}:\d{2}\s*(?:AM|PM))\s*[–-]", re.I)
ROOM_LABEL_RE = re.compile(r"^Room\s+\d{4}[A-Z](?:&[A-Z])?$", re.I)


def main() -> int:
    repo_root = Path(__file__).resolve().parents[1]
    docx_path = repo_root / "ICIBM2026_program_schedule_07_23_2026.docx"
    output_path = repo_root / "icibm2026_program_schedule.txt"

    if not docx_path.exists():
        print(f"Missing Word source: {docx_path}", file=sys.stderr)
        return 1

    rows = read_docx_rows(docx_path)
    output_lines = build_schedule_lines(rows)
    output_path.write_text("\n".join(output_lines).rstrip() + "\n", encoding="utf-8")
    return 0


def read_docx_rows(docx_path: Path) -> list[list[str]]:
    with ZipFile(docx_path) as archive:
        document_xml = archive.read("word/document.xml")

    root = ET.fromstring(document_xml)
    rows: list[list[str]] = []
    body = root.find("./w:body", NS)
    if body is None:
        return rows

    for child in body:
        tag = child.tag.rsplit("}", 1)[-1]
        if tag == "p":
            text = normalize_paragraph_text(child)
            if text:
                rows.append([text])
        elif tag == "tbl":
            for table_row in child.findall("./w:tr", NS):
                cells = [normalize_cell_text(cell) for cell in table_row.findall("./w:tc", NS)]
                rows.append(cells)
    return rows


def normalize_paragraph_text(paragraph: ET.Element) -> str:
    text = "".join(paragraph.itertext())
    text = re.sub(r"\s+", " ", text).strip()
    text = split_inline_time_ranges(text)
    return text


def split_inline_time_ranges(text: str) -> str:
    return re.sub(
        r"(?<=\S)\s+(?=\d{1,2}:\d{2}\s*(?:AM|PM)\s*[–-]\s*\d{1,2}:\d{2}\s*(?:AM|PM)\b)",
        "\n",
        text,
        flags=re.I,
    )


def normalize_cell_text(cell: ET.Element) -> str:
    paragraphs: list[str] = []
    for paragraph in cell.findall("./w:p", NS):
        text = normalize_paragraph_text(paragraph)
        if text:
            paragraphs.append(text)
    return "\n".join(paragraphs)


def build_schedule_lines(rows: list[list[str]]) -> list[str]:
    output: list[str] = []
    current_room_labels: list[str] = []
    current_band: dict | None = None

    def flush_band() -> None:
        nonlocal current_band
        if not current_band:
            return

        time_line = current_band["time_line"]
        room_texts = current_band["room_texts"]
        room_labels = current_band["room_labels"] or []
        non_empty = [(index, text) for index, text in enumerate(room_texts) if text.strip()]

        if len(non_empty) <= 1:
            if non_empty:
                _, text = non_empty[0]
                output.append(time_line)
                output.extend(split_lines(text))
                output.append("")
            current_band = None
            return

        for index, text in non_empty:
            output.append(time_line)
            if index < len(room_labels):
                output.append(room_labels[index])
            output.extend(split_lines(text))
            output.append("")

        current_band = None

    for row in rows:
        compact_row = [cell.strip() for cell in row]
        row_non_empty = [cell for cell in compact_row if cell]

        if not row_non_empty:
            continue

        if is_day_row(compact_row):
            flush_band()
            output.append(compact_row[0])
            output.append("")
            continue

        if looks_like_room_labels(compact_row):
            current_room_labels = row_non_empty
            continue

        if len(compact_row) == 1:
            flush_band()
            output.extend(split_lines(compact_row[0]))
            output.append("")
            continue

        first_cell = compact_row[0]
        if first_cell and TIME_START_RE.match(first_cell):
            flush_band()
            current_band = {
                "time_line": normalize_time_line(first_cell),
                "room_texts": compact_row[1:],
                "room_labels": current_room_labels[:],
            }
            continue

        if current_band and not first_cell:
            append_continuation(current_band, compact_row[1:])
            continue

        flush_band()
        output.extend(split_lines("\n".join(row_non_empty)))
        output.append("")

    flush_band()
    return trim_trailing_blank_lines(output)


def append_continuation(current_band: dict, continuation_cells: list[str]) -> None:
    room_texts = current_band["room_texts"]
    if len(continuation_cells) > len(room_texts):
        room_texts.extend([""] * (len(continuation_cells) - len(room_texts)))

    for index, cell_text in enumerate(continuation_cells):
        if not cell_text:
            continue
        if room_texts[index]:
            room_texts[index] += "\n" + cell_text
        else:
            room_texts[index] = cell_text


def normalize_time_line(text: str) -> str:
    text = normalize_time_text(text)
    match = TIME_RANGE_RE.match(text)
    if match:
        return f"{match.group(1).upper()} – {match.group(2).upper()}"
    match = TIME_START_RE.match(text)
    if match:
        return f"{match.group(1).upper()} –"
    return text


def normalize_time_text(text: str) -> str:
    text = re.sub(r"(?<=\d)\s+(?=\d{1,2}:\d{2}\s*(?:AM|PM)\b)", "", text, flags=re.I)
    text = re.sub(r"(?<!\w)(\d{1,2}:\d{2})\s*(AM|PM)\b", r"\1 \2", text, flags=re.I)
    text = re.sub(r"(?<!\w)(\d{1,2}:\d{2})\s*[–-]\s*(\d{1,2}:\d{2})", r"\1 – \2", text)
    text = re.sub(r"(?<!\w)(\d{1,2}:\d{2}\s*(?:AM|PM))\s*[–-]\s*(\d{1,2}:\d{2}\s*(?:AM|PM))", r"\1 – \2", text, flags=re.I)
    return text


def is_day_row(row: list[str]) -> bool:
    return len(row) == 1 and bool(DAY_RE.match(row[0]))


def looks_like_room_labels(row: list[str]) -> bool:
    return len(row) > 1 and all(not cell or ROOM_LABEL_RE.match(cell) for cell in row)


def split_lines(text: str) -> list[str]:
    return [normalize_time_text(line.strip()) for line in text.split("\n") if line.strip()]


def trim_trailing_blank_lines(lines: list[str]) -> list[str]:
    while lines and not lines[-1]:
        lines.pop()
    return lines


if __name__ == "__main__":
    raise SystemExit(main())
