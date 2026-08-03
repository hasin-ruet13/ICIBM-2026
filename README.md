# ICIBM 2026 Schedule Explorer

An interactive browser for the International Conference on Intelligent Biology and Medicine (ICIBM 2026), held August 2–5, 2026, in Buffalo, New York.

**Live explorer:** [hasin-ruet13.github.io/ICIBM-2026](https://hasin-ruet13.github.io/ICIBM-2026/)

**Conference website:** [icibm2026.iaibm.org](https://icibm2026.iaibm.org/)

## Features

- Browse the complete schedule by conference day
- Search by presentation title, speaker, institution, room, or keyword
- Filter concurrent sessions and automatically detected research themes
- Open a dedicated poster browser with poster titles and authors
- Save sessions privately in the current browser using `localStorage`
- Open the official schedule and program book PDFs directly

## Schedule source

The explorer is generated from the official ICIBM 2026 Word schedule. The updated document uses merged cells, uneven columns, split time fields, and speaker-specific times inside larger session blocks. The extraction script normalizes these structures while retaining the original details for review.

The current data includes the announced schedule changes:

- Sessions previously assigned to Room 1220 on August 3 and 4 are assigned to Room 2220B.
- Wednesday sessions begin at 8:30 AM.

The source documents contain a few formatting inconsistencies and apparent typographical errors. The official PDFs remain available in the explorer for confirmation.

## Project files

- `index.html` — page structure and interface
- `styles.css` — responsive styling
- `app.js` — schedule parsing, search, filters, themes, posters, and browser bookmarks
- `icibm2026_program_schedule.txt` — normalized schedule consumed by the browser
- `icibm2026_poster_titles.json` — poster titles and authors extracted from the program book
- `scripts/rebuild_schedule_text.py` — DOCX table extraction and normalization
- `scripts/rebuild_poster_titles.py` — poster extraction from the program book
- `scripts/validate_schedule.js` — automated checks for times, rooms, IDs, and representative sessions
- `ICIBM2026_program_schedule_07_23_2026.docx` — current Word schedule source
- `ICIBM2026_program_schedule_07_23_2026.pdf` — updated schedule PDF
- `ICIBM2026_Program_Book_07_23_2026.pdf` — official program book PDF

## Rebuild and validate

After replacing the schedule source, regenerate and verify the browser data:

```bash
python3 scripts/rebuild_schedule_text.py
node scripts/validate_schedule.js
node --check app.js
```

The validation checks all four conference days and verifies positive durations, stable IDs, room assignments, poster timing, keynotes, award and closing events, and selected presentations from the updated tables.

## Local preview

No build system is required. To preview changes locally:

```bash
python3 -m http.server 8000
```

Open `http://localhost:8000/` in a browser.

## Deployment

The site is published with GitHub Pages from the `main` branch and repository root. Pushing an update to `main` triggers a new Pages deployment.

## Credits

Prepared by [Hasin Rehana](https://github.com/hasin-ruet13/) · [LinkedIn](https://www.linkedin.com/in/hasin-rehana-580184140/) · [Google Scholar](https://scholar.google.com/citations?user=q6tQJu0AAAAJ&hl=en)

Assisted by OpenAI Codex.
