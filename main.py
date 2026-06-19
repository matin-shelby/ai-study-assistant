import os
from pathlib import Path
from dotenv import load_dotenv

# Get the directory where main.py actually lives
base_dir = Path(__file__).resolve().parent
env_path = base_dir / ".env"

# Load it using the absolute path
load_dotenv(dotenv_path=env_path)

import asyncio
import json
from typing import Any, List, Optional

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from google import genai
from google.genai import errors as genai_errors
from google.genai import types
from pydantic import BaseModel, Field
from tenacity import retry, retry_if_exception, stop_after_attempt, wait_chain, wait_fixed

api_key = os.getenv("GEMINI_API_KEY")
if not api_key:
    raise ValueError("GEMINI_API_KEY environment variable is missing")

client = genai.Client(
    api_key=api_key,
    http_options=types.HttpOptions(timeout=60_000),  # 60s timeout per request
)

PRIMARY_MODEL = "gemini-3.5-flash"
FALLBACK_MODEL = "gemini-2.5-flash"

ALLOWED_MIME_TYPES = {
    "application/pdf",
    "image/png",
    "image/jpeg",
    "image/gif",
    "image/webp",
    "audio/mpeg",
    "audio/wav",
    "audio/ogg",
    "video/mp4",
    "video/webm",
}

SYSTEM_INSTRUCTION = """You are a study assistant that analyzes educational content and produces structured study materials.

Analyze the user-provided content and return exactly one JSON object with no markdown fences, no commentary, and no extra keys.

Rules:
- "summary" must be valid Markdown covering the most important concepts, terms, and definitions from the content.
- You may use standard Markdown in any JSON string value, including tables (with | pipe syntax) and fenced code blocks.
- You may use LaTeX for mathematical expressions: wrap inline math in $...$ and display/block math in $$...$$.
- "flashcards" must contain at least 5 items with sequential integer "id" values starting at 1.
- Each flashcard "question" must be concise and each "answer" must be accurate and self-contained.
- "quizzes" must contain at least 3 items with sequential integer "id" values starting at 1.
- Each quiz must have exactly 4 string options in the "options" array.
- "correct_index" must be an integer from 0 to 3 matching the correct option.
- "explanation" must briefly justify the correct answer."""


class Flashcard(BaseModel):
    id: int
    question: str
    answer: str


class Quiz(BaseModel):
    id: int
    question: str
    options: List[str]
    correct_index: int
    explanation: str


class StudyMaterial(BaseModel):
    summary: str
    flashcards: List[Flashcard]
    quizzes: List[Quiz]


app = FastAPI(title="AI Study Assistant")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class GenerateRequest(BaseModel):
    content: str = Field(min_length=1)


def _is_503_error(exc: BaseException) -> bool:
    return isinstance(exc, genai_errors.ServerError) and exc.code == 503


@retry(
    retry=retry_if_exception(_is_503_error),
    stop=stop_after_attempt(2),
    wait=wait_chain(wait_fixed(1), wait_fixed(2)),
    reraise=True,
)
def _generate_content(prompt: str, model: str):
    return client.models.generate_content(
        model=model,
        contents=prompt,
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=StudyMaterial,
            thinking_config=types.ThinkingConfig(thinking_budget=0),
        ),
    )


@retry(
    retry=retry_if_exception(_is_503_error),
    stop=stop_after_attempt(2),
    wait=wait_chain(wait_fixed(1), wait_fixed(2)),
    reraise=True,
)
def _generate_content_multimodal(contents: list, model: str):
    return client.models.generate_content(
        model=model,
        contents=contents,
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=StudyMaterial,
            thinking_config=types.ThinkingConfig(thinking_budget=0),
        ),
    )


def _call_with_fallback(generate_fn, primary_args, fallback_args):
    """Try primary model, fall back to secondary on any failure."""
    try:
        return generate_fn(*primary_args)
    except Exception as primary_exc:
        print(
            f"Warning: Primary model ({PRIMARY_MODEL}) failed: {primary_exc}. "
            f"Falling back to {FALLBACK_MODEL}."
        )
        try:
            return generate_fn(*fallback_args)
        except genai_errors.ServerError as exc:
            if exc.code == 503:
                raise HTTPException(
                    status_code=503,
                    detail="Gemini API is temporarily unavailable. Please try again in a few moments.",
                ) from exc
            raise HTTPException(
                status_code=502,
                detail=f"Gemini API request failed: {exc}",
            ) from exc
        except Exception as exc:
            raise HTTPException(
                status_code=502,
                detail=f"Gemini API request failed: {exc}",
            ) from exc


def _parse_response(response):
    """Extract and validate JSON from a Gemini API response."""
    if not response.text:
        raise HTTPException(
            status_code=502,
            detail="Gemini API returned an empty response",
        )
    try:
        return json.loads(response.text)
    except json.JSONDecodeError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Gemini API returned invalid JSON: {exc}",
        ) from exc


@app.post("/api/generate")
async def generate_study_materials(payload: GenerateRequest) -> dict[str, Any]:
    prompt = f"{SYSTEM_INSTRUCTION}\n\nContent to analyze:\n{payload.content}"

    response = await asyncio.to_thread(
        _call_with_fallback,
        _generate_content,
        (prompt, PRIMARY_MODEL),
        (prompt, FALLBACK_MODEL),
    )
    return _parse_response(response)


@app.post("/api/generate-multimodal")
async def generate_study_materials_multimodal(
    content: Optional[str] = Form(None),
    file: Optional[UploadFile] = File(None),
) -> dict[str, Any]:
    if not content and not file:
        raise HTTPException(
            status_code=422,
            detail="Provide at least one of 'content' (text) or 'file'.",
        )

    # Build the multimodal contents list
    parts: list = [SYSTEM_INSTRUCTION + "\n\n"]

    if file:
        mime = file.content_type or "application/octet-stream"
        if mime not in ALLOWED_MIME_TYPES:
            raise HTTPException(
                status_code=415,
                detail=f"Unsupported file type: {mime}. Allowed types: {', '.join(sorted(ALLOWED_MIME_TYPES))}",
            )
        file_bytes = await file.read()
        if len(file_bytes) > 20 * 1024 * 1024:
            raise HTTPException(
                status_code=413,
                detail="File size exceeds the 20 MB limit.",
            )
        parts.append(
            types.Part.from_bytes(data=file_bytes, mime_type=mime)
        )
        parts.append("\nAnalyze the uploaded file above.")

    if content:
        parts.append(f"\nContent to analyze:\n{content}")

    response = await asyncio.to_thread(
        _call_with_fallback,
        _generate_content_multimodal,
        (parts, PRIMARY_MODEL),
        (parts, FALLBACK_MODEL),
    )
    return _parse_response(response)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
