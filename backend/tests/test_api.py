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


def test_limits(client):
    assert client.post("/api/analyze", json={"text": "あ" * 20001}).status_code == 422
    assert client.post("/api/analyze", json={"text": "あ\n" * 501}).status_code == 422


def test_kana_orthography(client):
    data = client.post("/api/analyze", json={"text": "せいめい"}).json()
    assert "".join(s["hangul"] for s in data["lines"][0]["segments"]) == "세이메이"
