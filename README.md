# ICIBM 2026 Schedule Explorer

This folder now includes a lightweight ICIBM 2026 live schedule explorer built from the official program Word file.
The Word tables are still imperfect in a few spots, but they preserve the schedule structure better than the PDF source.
The updated schedule PDF and program book PDF are also kept in the folder for reference.

## Preview locally

Run a simple static server from this directory:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000/` in your browser.

## What it does

- Browse by conference day
- Search sessions by title, room, speaker, or topic
- Filter concurrent sessions and theme clusters
- Bookmark sessions in `localStorage` for your own browser

## Files

- `index.html` — app shell
- `styles.css` — visual styling
- `app.js` — schedule parsing, filters, theme discovery, and browser bookmarks
- `scripts/rebuild_schedule_text.py` — DOCX table normalization and schedule extraction
- `scripts/validate_schedule.js` — automated checks for times, rooms, and key updated sessions
- `icibm2026_program_schedule.txt` — text extracted from the Word schedule source
- `ICIBM2026_program_schedule_07_23_2026.docx` — source document
- `ICIBM2026_program_schedule_07_23_2026.pdf` — updated schedule PDF
- `ICIBM2026_Program_Book_07_23_2026.pdf` — program book PDF
