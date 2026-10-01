from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from .contracts import AnalyzeRequest
from .reading import Reader
from .transliteration import transliterate, is_kana, RULE_VERSION


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.reader = Reader()
    yield


app = FastAPI(title="Vocaro Transliterator", version="0.2.0", lifespan=lifespan)


@app.exception_handler(RequestValidationError)
async def invalid_request(request, exc):
    errors = exc.errors()
    message = next((e["msg"].removeprefix("Value error, ") for e in errors if e["type"] == "value_error"),
                   "입력 길이와 형식을 확인해 주세요. 원문은 최대 20,000자·500줄입니다.")
    return JSONResponse(status_code=422, content={"detail": message})


class ReadingRequest(BaseModel):
    reading: str = Field(min_length=1, max_length=1000)


@app.get("/api/health")
def health():
    return {"status": "ok", "version": app.version, "ruleVersion": RULE_VERSION}


@app.post("/api/analyze")
def analyze(body: AnalyzeRequest):
    return app.state.reader.analyze(body.text, body.dictionary, body.overrides)


@app.post("/api/transliterate")
def convert(body: ReadingRequest):
    if not all(is_kana(word) for word in body.reading.split()) or not body.reading.strip():
        raise HTTPException(422, "히라가나 또는 가타카나 읽기를 입력해 주세요.")
    value, warnings = transliterate(body.reading)
    return {"hangul": value, "warnings": warnings, "ruleVersion": RULE_VERSION}


dist = Path(__file__).resolve().parents[2] / "frontend" / "dist"
if dist.exists():
    app.mount("/", StaticFiles(directory=dist, html=True), name="frontend")
