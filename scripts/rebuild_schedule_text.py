#!/usr/bin/env python3
from __future__ import annotations

import re
import subprocess
import sys
import tempfile
import xml.etree.ElementTree as ET
from collections import defaultdict
from pathlib import Path


NS = {"x": "http://www.w3.org/1999/xhtml"}
START_TIME_RE = re.compile(r"^(\d{1,2}:\d{2}\s*(?:AM|PM))\s*[–-]")
TIME_ONLY_RE = re.compile(r"^(\d{1,2}:\d{2}\s*(?:AM|PM))$")
ROOM_RE = re.compile(r"^Room\s+\d{4}[A-Z](?:&[A-Z])?$", re.I)
CHUNK_GAP = 12.4


def main() -> int:
    repo_root = Path(__file__).resolve().parents[1]
    pdf_path = repo_root / "ICIBM2026_program_schedule_07_23_2026.pdf"
    output_path = repo_root / "icibm2026_program_schedule.txt"

    if not pdf_path.exists():
        print(f"Missing PDF source: {pdf_path}", file=sys.stderr)
        return 1

    with tempfile.NamedTemporaryFile(suffix=".xhtml", delete=False) as temp_file:
        temp_path = Path(temp_file.name)

    try:
        subprocess.run(
            ["pdftotext", "-bbox-layout", str(pdf_path), str(temp_path)],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        root = ET.parse(temp_path).getroot()
        pages = root.findall(".//x:page", NS)
        lines = []

        for page in pages:
            lines.extend(extract_page_lines(page))

        output_path.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")
        return 0
    finally:
        temp_path.unlink(missing_ok=True)


def extract_page_lines(page: ET.Element) -> list[str]:
    line_items = []
    for line in page.findall(".//x:line", NS):
        word_entries = [
            {
                "text": word.text.strip(),
                "x0": float(word.attrib["xMin"]),
                "x1": float(word.attrib["xMax"]),
                "y0": float(word.attrib["yMin"]),
                "y1": float(word.attrib["yMax"]),
            }
            for word in line.findall(".//x:word", NS)
            if (word.text or "").strip()
        ]
        if not word_entries:
            continue
        text = join_words(word_entries)
        line_items.append(
            {
                "text": text,
                "x0": float(line.attrib["xMin"]),
                "x1": float(line.attrib["xMax"]),
                "y0": float(line.attrib["yMin"]),
                "y1": float(line.attrib["yMax"]),
                "words": word_entries,
            }
        )

    line_items.sort(key=lambda item: (item["y0"], item["x0"]))
    clusters = split_clusters_on_markers(cluster_lines_by_y(line_items))
    room_centers = extract_room_centers(line_items)
    rendered = []

    for index, cluster in enumerate(clusters):
        rendered.extend(render_cluster(cluster, room_centers, clusters[index + 1] if index + 1 < len(clusters) else None))
        if index != len(clusters) - 1:
            rendered.append("")

    return rendered


def split_clusters_on_markers(clusters: list[list[dict]]) -> list[list[dict]]:
    expanded: list[list[dict]] = []
    marker_re = re.compile(r"\b(Coffee Break|Lunch Break|Opening Remarks|Registration)\b", re.I)

    for cluster in clusters:
        split_index = None
        has_marker = any(marker_re.search(line["text"]) for line in cluster)
        if has_marker:
            for index, line in enumerate(cluster):
                if index == 0:
                    continue
                if line["x0"] < 150 and START_TIME_RE.match(line["text"]):
                    split_index = index
                    break

        if split_index is None:
            expanded.append(cluster)
        else:
            expanded.append(cluster[:split_index])
            expanded.append(cluster[split_index:])

    return [cluster for cluster in expanded if cluster]


def cluster_lines_by_y(lines: list[dict]) -> list[list[dict]]:
    clusters: list[list[dict]] = []
    current: list[dict] = []
    last_y: float | None = None

    for line in lines:
        if last_y is None or line["y0"] - last_y <= CHUNK_GAP:
            current.append(line)
        else:
            clusters.append(current)
            current = [line]
        last_y = line["y0"]

    if current:
        clusters.append(current)

    return clusters


def extract_room_centers(lines: list[dict]) -> list[float]:
    centers: list[float] = []
    for line in lines:
        if ROOM_RE.match(line["text"]):
            centers.append((line["x0"] + line["x1"]) / 2)
    return centers


def render_cluster(cluster: list[dict], room_centers: list[float], next_cluster: list[dict] | None) -> list[str]:
    sorted_cluster = sorted(cluster, key=lambda item: (item["y0"], item["x0"]))
    marker_re = re.compile(r"\b(Coffee Break|Lunch Break|Opening Remarks|Registration)\b", re.I)
    if any(marker_re.search(line["text"]) for line in sorted_cluster):
        return [line["text"] for line in sorted_cluster]

    start_time = find_start_time(sorted_cluster)
    is_concurrent = start_time and has_multiple_content_columns(sorted_cluster, room_centers)

    if not is_concurrent:
        return [line["text"] for line in sorted_cluster]

    end_time = find_start_time(next_cluster) if next_cluster else ""
    label_line = start_time if not end_time else f"{start_time} – {end_time}"
    rendered: list[str] = []

    column_blocks = split_cluster_into_columns(sorted_cluster, room_centers)
    for room_index in sorted(column_blocks):
        block_lines = column_blocks[room_index]
        if not block_lines:
            continue
        rendered.extend([label_line, room_label_for_index(room_index, room_centers)])
        rendered.extend(block_lines)
        rendered.append("")

    if rendered and rendered[-1] == "":
        rendered.pop()
    return rendered


def line_is_split_candidate(line: dict, room_centers: list[float]) -> bool:
    if line["x0"] < 150 and (START_TIME_RE.match(line["text"]) or TIME_ONLY_RE.match(line["text"])):
        return True
    if line["text"] in {"Concurrent Sessions/Workshops"}:
        return True
    if ROOM_RE.match(line["text"]):
        return True
    return bool(room_centers) and line["x1"] > 180


def split_cluster_into_columns(cluster: list[dict], room_centers: list[float]) -> dict[int, list[str]]:
    columns: dict[int, list[dict]] = defaultdict(list)
    if not room_centers:
        room_centers = [0.0]

    for line in cluster:
        if line["x0"] < 150 and (START_TIME_RE.match(line["text"]) or TIME_ONLY_RE.match(line["text"])):
            continue
        if line["text"] in {"Concurrent Sessions/Workshops"} or ROOM_RE.match(line["text"]):
            continue
        for word in line["words"]:
            if word["text"] in {"Room"}:
                continue
            if word["x0"] < 150 and (START_TIME_RE.match(word["text"]) or TIME_ONLY_RE.match(word["text"])):
                continue
            column_index = nearest_room_index(word, room_centers)
            columns[column_index].append(word)

    rendered: dict[int, list[str]] = {}
    for column_index, words in columns.items():
        by_y: dict[float, list[dict]] = defaultdict(list)
        for word in words:
            by_y[round(word["y0"], 1)].append(word)

        lines: list[str] = []
        for y in sorted(by_y):
            ordered = sorted(by_y[y], key=lambda item: item["x0"])
            text = join_words(ordered)
            if text:
                lines.append(text)

        rendered[column_index] = lines

    return rendered


def nearest_room_index(word: dict, room_centers: list[float]) -> int:
    center = (word["x0"] + word["x1"]) / 2
    return min(range(len(room_centers)), key=lambda index: abs(room_centers[index] - center))


def room_label_for_index(index: int, room_centers: list[float]) -> str:
    labels = ["Room 2220A&B", "Room 2213A", "Room 2213B"]
    if index < len(labels):
        return labels[index]
    return "Room"


def has_multiple_content_columns(cluster: list[dict], room_centers: list[float]) -> bool:
    columns = set()
    for line in cluster:
        if line["x0"] < 150 and (START_TIME_RE.match(line["text"]) or TIME_ONLY_RE.match(line["text"])):
            continue
        if line["text"] in {"Concurrent Sessions/Workshops"} or ROOM_RE.match(line["text"]):
            continue
        for word in line["words"]:
            if word["text"] in {"Room"}:
                continue
            if word["x0"] < 150 and START_TIME_RE.match(word["text"]):
                continue
            if room_centers:
                columns.add(nearest_room_index(word, room_centers))
    return len(columns) >= 2


def find_start_time(cluster: list[dict] | None) -> str:
    if not cluster:
        return ""
    for line in cluster:
        match = START_TIME_RE.match(line["text"])
        if match:
            return match.group(1).upper()
    return ""


def join_words(words: list[dict]) -> str:
    ordered = sorted(words, key=lambda word: word["x0"])
    text = " ".join(word["text"] for word in ordered).strip()
    text = re.sub(r"\s+([,.;:!?])", r"\1", text)
    text = re.sub(r"\s*-\s*", " - ", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


if __name__ == "__main__":
    raise SystemExit(main())
