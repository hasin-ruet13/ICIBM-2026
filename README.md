# ICIBM 2026 Schedule Explorer

This folder now includes a lightweight schedule explorer built from the official ICIBM 2026 program PDF.

## Preview locally

Run a simple static server from this directory:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000/` in your browser.

## Files

- `index.html` — app shell
- `styles.css` — visual styling
- `app.js` — schedule parsing, filters, bookmarks, and `.ics` export
- `icibm2026_program_schedule.txt` — text extracted from the official schedule PDF
- `ICIBM2026_program_schedule_07_23_2026.pdf` — source document
