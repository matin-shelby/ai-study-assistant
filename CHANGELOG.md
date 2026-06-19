# Changelog

All notable changes to this project are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

---

## [0.4.0] - 2026-06-19

Rich text rendering, premium typography, and backend prompt improvements.

### Added
- `marked.js` (GFM mode) for full Markdown rendering in summaries, flashcard fronts, and flashcard backs
- KaTeX + auto-render extension for LaTeX math: `$...$` (inline) and `$$...$$` (display block)
- `JetBrains Mono` font for all `<code>` elements and code blocks
- Markdown table styles scoped to `.summary-prose`: subtle dark borders, violet-tinted headers, compact padding, hover row highlight
- KaTeX dark-theme color overrides for `.summary-prose` and `.flashcard-face` contexts
- `pre` block styles with JetBrains Mono, horizontal scroll, and deep-space background
- Backend system instruction updated to explicitly permit Markdown tables, fenced code blocks, and LaTeX expressions in any JSON string value

### Changed
- Replaced hand-rolled `renderMarkdown()` + `inlineFormat()` with `marked.parse()`, removing ~50 lines of fragile custom parsing
- Flashcard question and answer rendering switched from `escapeHtml()` + plain text injection to `renderMarkdown()` + `renderMath()`
- Quiz question rendering switched from escaped plain text to `renderMarkdown()` inside a `.quiz-md-question` wrapper with `renderMath()` called after injection
- `Inter` replaces `Outfit` as the primary body font globally; `Space Grotesk` retained for display elements and HUD

---

## [0.3.0] - 2026-06-19

Premium dark spatial UI overhaul with gamification layer.

### Added
- Gamification HUD in the header: 🔥 Streak, XP, and Level badge with triangular growth thresholds
- XP awards: +5 on generate, +10 on "Got it", +15 on correct quiz answer
- Study streak tracking: increments on first XP event of each day, resets if more than one day is skipped
- `canvas-confetti` full burst on deck completion (all cards mastered) and quiz score above 80%
- `triggerSmallBurst()` localized confetti on individual "Got it" clicks
- Lucide Icons replacing all emoji/text labels across the UI
- Spring-physics 3D flashcard flip: `cubic-bezier(0.175, 0.885, 0.32, 1.275)` on `flashcard-inner`
- Deep-space ambient orbs: two fixed radial gradient blobs with `@keyframes orbFloat` animation
- Localized violet radial glow behind the flashcard grid (`.flashcard-glow-bg`)
- SRS "Got it" button with green glow on hover, "Needs Work" with red glow on hover
- HUD XP value spring-pop animation (`xpPop` keyframe with gold mid-flash)
- Skeleton loading states for summary, flashcards, and quiz during API calls
- `Space Grotesk` applied to HUD stats, level badge, section headings, flashcard faces, and SRS action buttons
- `Outfit` applied as the base body font (later replaced by `Inter` in v0.4.0)
- Full light-mode fallbacks for every dark-mode CSS rule via `html:not(.dark)` selectors

### Changed
- `styles.css` fully rewritten: removed generic glassmorphism in favor of `rgba(13,17,30,0.75)` + `backdrop-blur(24px)` deep-space panels
- Generate button upgraded with gradient, spring hover transform, and glow shadow
- File drop zone upgraded with drag-over state, icon lift animation, and file chip preview
- Section headings use tight letter-spacing (`-0.025em`) with Space Grotesk for a premium tool aesthetic

---

## [0.2.0] - 2026-06-19

Multimodal file upload support, SRS, and latency fixes.

### Added
- `POST /api/generate-multimodal` endpoint accepting `multipart/form-data` with optional `content` (text) and `file` (binary)
- MIME type allowlist enforced on upload: PDF, PNG, JPEG, GIF, WEBP, MP3, WAV, OGG, MP4, WEBM
- 20 MB file size cap enforced on the backend before passing bytes to Gemini
- `types.Part.from_bytes` used for in-memory multimodal file injection (no temporary disk storage)
- Frontend file drop zone: drag-and-drop, click-to-browse, file chip preview, and remove button
- Client-side SM-2 Spaced Repetition System persisted in `localStorage` under `srs_flashcard_data`
- SRS dashboard showing "due", "soon", and "mastered" card counts with filter buttons
- SRS status badges ("New", "Due", "Soon", "Mastered") on flashcard fronts
- "Needs Work" moves card to front of grid and resets its SRS interval
- CSV export button for flashcards (RFC 4180 compliant with proper quoting)
- `python-multipart` added as a required dependency for FastAPI `UploadFile` support

### Changed
- `thinking_budget=0` set on all `generate_content` calls to disable dynamic reasoning and reduce latency from 4 to 5 minutes to seconds
- HTTP timeout raised to 60 seconds via `types.HttpOptions(timeout=60_000)`
- Retry policy reduced from 4 attempts to 2 (`stop_after_attempt(2)`) with 1s/2s wait chain
- All model config arguments migrated from raw `dict` to typed `types.GenerateContentConfig` constructors to resolve SDK type errors
- `_call_with_fallback()` extracted as a shared helper for both text and multimodal endpoints
- System instruction updated to permit Markdown in all JSON string values

### Fixed
- Resolved 4 to 5 minute API latency caused by unrestricted dynamic thinking on short inputs
- Fixed type errors from passing `dict` config to `generate_content` (SDK 2.8.0 requires typed objects)

---

## [0.1.0] - 2026-06-10

Initial release.

### Added
- FastAPI async backend in `main.py`
- `POST /api/generate` endpoint accepting a `content` string
- Pydantic schemas: `Flashcard`, `Quiz`, and `StudyMaterial`
- Google GenAI SDK integration with `gemini-3.5-flash` (primary) and `gemini-2.5-flash` (fallback)
- Structured JSON output enforced via `response_mime_type` and `response_schema`
- System instruction requiring a Markdown summary, at least 5 flashcards, and at least 3 quiz questions
- Full CORS support (`allow_origins=["*"]`)
- `.env` loading via absolute path resolved relative to `main.py`
- Explicit `GEMINI_API_KEY` validation at startup with a descriptive `ValueError`
- Tenacity retry policy for transient 503 errors
- `requirements.txt` listing all runtime dependencies
- `README.md` and `CHANGELOG.md` for project documentation

### Changed
- Migrated from legacy `google-generativeai` SDK to the modern `google-genai` SDK
- Replaced implicit client initialization with explicit `genai.Client(api_key=...)`
- Updated `.env` loading to use an absolute path to fix working-directory sensitivity

### Fixed
- Startup crash when `.env` was present but empty (0-byte file)
- `GEMINI_API_KEY` not being read due to the empty on-disk file

### Security
- API key loaded exclusively from environment variables; server fails fast if missing
- `.env` intended for local use only and should not be committed

---

## Version History

| Version | Date | Highlights |
|---|---|---|
| 0.4.0 | 2026-06-19 | Markdown + LaTeX rendering, JetBrains Mono, backend prompt improvements |
| 0.3.0 | 2026-06-19 | Gamification HUD, confetti, deep-space UI overhaul, Spring-physics card flip |
| 0.2.0 | 2026-06-19 | Multimodal uploads, SM-2 SRS, CSV export, latency optimizations |
| 0.1.0 | 2026-06-10 | Initial FastAPI backend with Gemini integration |
