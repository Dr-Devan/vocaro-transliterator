from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from .reading import Reader
from .transliteration import transliterate, is_kana, RULE_VERSION


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.reader = Reader()
    yield


app = FastAPI(title="Vocaro Transliterator", version="0.1.0", lifespan=lifespan)


class AnalyzeRequest(BaseModel):
    text: str = Field(max_length=20000)


class ReadingRequest(BaseModel):
    reading: str = Field(min_length=1, max_length=1000)


@app.get("/api/health")
def health():
    return {"status": "ok", "ruleVersion": RULE_VERSION}


@app.post("/api/analyze")
def analyze(body: AnalyzeRequest):
    if len(body.text.replace("\r\n", "\n").replace("\r", "\n").split("\n")) > 500:
        raise HTTPException(422, "500줄 이내로 입력해 주세요.")
    return app.state.reader.analyze(body.text)


@app.post("/api/transliterate")
def convert(body: ReadingRequest):
    if not all(is_kana(word) for word in body.reading.split()) or not body.reading.strip():
        raise HTTPException(422, "히라가나 또는 가타카나 읽기를 입력해 주세요.")
    value, warnings = transliterate(body.reading)
    return {"hangul": value, "warnings": warnings, "ruleVersion": RULE_VERSION}


dist = Path(__file__).resolve().parents[2] / "frontend" / "dist"
if dist.exists():
    app.mount("/", StaticFiles(directory=dist, html=True), name="frontend")
