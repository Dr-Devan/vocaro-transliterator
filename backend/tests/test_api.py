import pytest
from fastapi.testclient import TestClient
from app.main import app


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as test_client:
        yield test_client


def test_preserves_source_and_codepoint_offsets(client):
    source = "君は空へ！\r\n\r\n😀 ｶﾞｯｺｳ か\u3099"
    data = client.post("/api/analyze", json={"text": source}).json()
    assert [l["source"] for l in data["lines"]] == source.replace("\r\n", "\n").split("\n")
    for line in data["lines"]:
        assert "".join(s["surface"] for s in line["segments"]) == line["source"]
        for s in line["segments"]:
            assert line["source"][s["start"]:s["end"]] == s["surface"]
    assert data["offsetUnit"] == "unicode-code-point"


def test_particle_reading(client):
    data = client.post("/api/analyze", json={"text": "僕は空へ手を伸ばす"}).json()
    tokens = {s["surface"]: s["hangul"] for s in data["lines"][0]["segments"]}
    assert tokens["は"] == "와"
    assert tokens["へ"] == "에"
    assert tokens["を"] == "오"


def test_unknown_not_silently_removed(client):
    data = client.post("/api/analyze", json={"text": "XYZfoobar123"}).json()
    assert any(s["warnings"] for s in data["lines"][0]["segments"])


def test_manual_reading(client):
    assert client.post("/api/transliterate", json={"reading": "ソラ"}).json()["hangul"] == "소라"
    assert client.post("/api/transliterate", json={"reading": "空"}).status_code == 422
    assert client.post("/api/transliterate", json={"reading": "  "}).status_code == 422


def test_split_sokuon_and_explicit_space(client):
    data = client.post("/api/analyze", json={"text": "待って\n言った\n待っ て\n待っ"}).json()
    assert [line["segments"][0]["hangul"] for line in data["lines"]] == ["맛", "잇", "마", "마"]


def test_limits(client):
    assert client.post("/api/analyze", json={"text": "あ" * 20001}).status_code == 422
    assert client.post("/api/analyze", json={"text": "あ\n" * 501}).status_code == 422


def test_kana_orthography(client):
    data = client.post("/api/analyze", json={"text": "せいめい"}).json()
    assert "".join(s["hangul"] for s in data["lines"][0]["segments"]) == "세이메이"


def test_split_nasal_is_recognized(client):
    data = client.post("/api/analyze", json={"text": "痛いんだ"}).json()
    parts = data["lines"][0]["segments"]
    assert [p["surface"] for p in parts] == ["痛い", "ん", "だ"]
    assert [p["hangul"] for p in parts] == ["이타이", "ㄴ", "다"]
    assert not any(p["warnings"] for p in parts)


def test_candidates_from_dictionary_with_context(client):
    data = client.post("/api/analyze", json={"text": "私と明日と今日"}).json()
    tokens = {p["surface"]: p for p in data["lines"][0]["segments"]}
    assert {c["reading"] for c in tokens["私"]["candidates"]} == {"わたし", "わたくし", "あたし"}
    assert {c["reading"] for c in tokens["明日"]["candidates"]} >= {"あす", "あした"}
    assert {c["reading"] for c in tokens["今日"]["candidates"]} >= {"きょう", "こんにち"}
    assert len(tokens["私"]["candidates"]) == len({c["reading"] for c in tokens["私"]["candidates"]})
