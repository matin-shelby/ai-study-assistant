# AI Study Assistant

> An AI-powered academic tool that transforms any study material into a fully rendered learning guide: Markdown summary, interactive SRS flashcards, and a scored quiz, all generated in a single API call.

---

## Project Overview

The AI-Powered Personalized Academic Study Assistant is an intelligent web application that allows students to paste lecture notes, upload documents, images, or media files, and instantly receive structured study materials. The backend calls Google Gemini and enforces a strict schema, while the frontend renders Markdown and LaTeX, runs a client-side Spaced Repetition System, and tracks gamification progress entirely in the browser.

---

## Core Features

### Multimodal Input Processing
The frontend constructs a `multipart/form-data` request using the browser's `FormData` API, appending both optional text (`content`) and an optional file (`file`). On the backend, FastAPI receives the upload as an `UploadFile`, validates its MIME type and size (max 20 MB), and converts the raw bytes into a `types.Part.from_bytes` object that is passed directly to the Gemini multimodal API. No intermediate file storage is required.

### Strict Pydantic Schema Enforcement
All Gemini responses are constrained using `response_mime_type="application/json"` and a `response_schema=StudyMaterial` argument. The three Pydantic models (`Flashcard`, `Quiz`, `StudyMaterial`) define the exact shape of the JSON the model must return, eliminating the need for post-processing or defensive parsing.

### Client-Side Spaced Repetition System (SRS)
The frontend implements the SM-2 spaced repetition algorithm entirely in the browser. Each flashcard carries an `easeFactor`, `interval`, `repetitions`, and `nextReviewDate`. On every "Got it" or "Needs Work" click, `recordSRSResponse()` recalculates the next review date and writes the updated card state to `localStorage` under the key `srs_flashcard_data`. No server calls are made; all progress persists across sessions.

### Latency Optimizations
Two targeted optimizations reduce response times for structured extraction tasks:

1. `thinking_config=types.ThinkingConfig(thinking_budget=0)` disables Gemini's dynamic reasoning phase, which was the primary cause of 4 to 5 minute latencies on short text inputs.
2. `await asyncio.to_thread(...)` offloads the synchronous `client.models.generate_content` call to a thread pool, preventing it from blocking FastAPI's async event loop.

A 60-second HTTP timeout (`types.HttpOptions(timeout=60_000)`) and a two-attempt retry policy via Tenacity guard against transient 503 errors.

### Fallback Model Routing
If `gemini-3.5-flash` (the primary model) fails for any reason, `_call_with_fallback()` automatically retries with `gemini-2.5-flash` and logs the reason to the console. The client always receives either a valid response or a descriptive HTTP error.

### Rich Text Rendering
Summaries, flashcard questions, and flashcard answers are all rendered through `marked.parse()` (GFM mode, table support) followed by `renderMathInElement()` from KaTeX. This allows the model to include Markdown tables, code blocks, and LaTeX math expressions (`$...$` inline, `$$...$$` display) inside any string value in the response.

### Gamification HUD
XP and study streak are tracked in `localStorage` under `study_gamification`. XP is awarded for generating a study guide (+5), confirming a flashcard (+10), and answering a quiz question correctly (+15). The HUD level badge uses triangular growth thresholds and animates with a spring-physics pop. Full-deck completion and high quiz scores trigger a canvas-confetti burst.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Python 3.10+, FastAPI, Uvicorn |
| AI SDK | Google GenAI SDK (`google-genai`) |
| AI Models | `gemini-3.5-flash` (primary), `gemini-2.5-flash` (fallback) |
| Schema | Pydantic v2 |
| Retry Logic | Tenacity |
| Frontend | Vanilla JavaScript (ES2022), HTML5 |
| Styling | Tailwind CSS (CDN), custom CSS (deep-space glassmorphism) |
| Typography | Inter (body), Space Grotesk (display/HUD), JetBrains Mono (code) |
| Markdown | marked.js |
| Math | KaTeX + auto-render extension |
| Gamification | canvas-confetti, Lucide Icons |
| Config | python-dotenv |

---

## Local Setup Instructions

### Prerequisites

- Python 3.10 or newer
- A Google AI Studio API key ([get one here](https://aistudio.google.com/apikey))
- A modern browser (Chrome, Firefox, Edge)

### Step 1: Enter the project directory

```powershell
cd ai-study-assistant
```

### Step 2: Create and activate a virtual environment

```powershell
python -m venv venv
.\venv\Scripts\activate
```

### Step 3: Install dependencies

```powershell
pip install -r requirements.txt
```

### Step 4: Create the `.env` file

Create a file named `.env` in the root directory (next to `main.py`) with the following content:

```env
GEMINI_API_KEY=your_api_key_here
```

Important rules for this file:

- No quotation marks around the value
- No spaces around the equals sign
- Do not commit this file to version control

### Step 5: Start the backend server

```powershell
uvicorn main:app --reload
```

The API will be available at `http://127.0.0.1:8000`.
Interactive Swagger docs are at `http://127.0.0.1:8000/docs`.

### Step 6: Open the frontend

Open `index.html` directly in your browser, or use a local HTTP server such as VS Code Live Server. No build step is required.

---

## API Documentation

### `POST /api/generate`

Accepts plain text study content and returns a structured study guide.

**Request body (`application/json`):**

```json
{
  "content": "Your notes, lecture transcript, or textbook excerpt."
}
```

**Successful response (`200 OK`):**

```json
{
  "summary": "## Key Concepts\n\n...",
  "flashcards": [
    { "id": 1, "question": "What is X?", "answer": "X is..." }
  ],
  "quizzes": [
    {
      "id": 1,
      "question": "Which of the following best describes X?",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correct_index": 0,
      "explanation": "Option A is correct because..."
    }
  ]
}
```

---

### `POST /api/generate-multimodal`

Accepts a file upload (PDF, image, audio, video) and optional supplementary text. Returns the same structured study guide schema.

**Request body (`multipart/form-data`):**

| Field | Type | Required | Description |
|---|---|---|---|
| `content` | string | No | Supplementary text to analyze alongside the file |
| `file` | file | No | Document or media file (max 20 MB) |

At least one of `content` or `file` must be provided.

**Supported file types:**

`application/pdf`, `image/png`, `image/jpeg`, `image/gif`, `image/webp`, `audio/mpeg`, `audio/wav`, `audio/ogg`, `video/mp4`, `video/webm`

**Successful response:** Same schema as `/api/generate`.

**Error responses:**

| Status | Cause |
|---|---|
| `413` | File exceeds the 20 MB size limit |
| `415` | Unsupported MIME type |
| `422` | Neither `content` nor `file` was provided |
| `503` | Gemini API temporarily unavailable |
| `502` | Gemini API returned an unexpected error or invalid JSON |

---

## Project Structure

```
ai-study-assistant/
├── main.py              # FastAPI app, Gemini integration, Pydantic schemas
├── script.js            # Frontend logic: SRS, API calls, rendering, gamification
├── index.html           # UI layout, CDN imports, Tailwind config
├── styles.css           # Custom CSS: glassmorphism, animations, dark-space theme
├── requirements.txt     # Python dependencies
├── pyproject.toml       # Pyright / linting configuration
├── .env                 # API keys (local only, not committed)
├── README.md            # Project overview and setup guide
└── CHANGELOG.md         # Version history
```

---

## License

Not yet specified.
