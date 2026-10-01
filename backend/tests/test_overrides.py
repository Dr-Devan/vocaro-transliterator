import pytest
from fastapi.testclient import TestClient
from app.main import app


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def test_dictionary_applies_to_all_occurrences(client):
    data = client.post("/api/analyze", json={"text": "宇宙へ\n宇宙を", "dictionary": [{"surface": "宇宙", "reading": "そら"}]}).json()
    for line in data["lines"]:
        assert line["segments"][0]["hangul"] == "소라"
        assert line["segments"][0]["origin"] == "dictionary"


def test_manual_range_beats_dictionary(client):
    data = client.post("/api/analyze", json={"text": "青い空へ", "dictionary": [{"surface": "青い空", "reading": "せかい"}],
        "overrides": [{"line": 0, "start": 0, "end": 3, "surface": "青い空", "reading": "ゆめ", "hangul": "유메"}]}).json()
    assert data["lines"][0]["segments"][0]["customHangul"] == "유메"
    assert data["lines"][0]["segments"][-1]["hangul"] == "에"


def test_longest_dictionary_entry_and_unicode_offsets(client):
    source = "😀青い空へ"
    data = client.post("/api/analyze", json={"text": source, "dictionary": [
        {"surface": "青い", "reading": "あおい"}, {"surface": "青い空", "reading": "そら"}]}).json()
    segments = data["lines"][0]["segments"]
    assert "".join(s["surface"] for s in segments) == source
    override = next(s for s in segments if s.get("origin") == "dictionary")
    assert override["start"] == 1 and override["end"] == 4 and override["hangul"] == "소라"


def test_slice_inside_compound_preserves_source(client):
    source = "東京都へ"
    data = client.post("/api/analyze", json={"text": source, "dictionary": [{"surface": "東京", "reading": "とうきょう"}]}).json()
    segments = data["lines"][0]["segments"]
    assert "".join(s["surface"] for s in segments) == source
    assert all(source[s["start"]:s["end"]] == s["surface"] for s in segments)


@pytest.mark.parametrize("payload", [
    {"text": "空", "dictionary": [{"surface": "空", "reading": "not kana"}]},
    {"text": "空", "dictionary": [{"surface": "空", "reading": "そら"}] * 2},
    {"text": "空", "overrides": [{"line": 0, "start": 0, "end": 1, "surface": "夢", "hangul": "유메"}]},
    {"text": "空", "overrides": [{"line": 0, "start": 0, "end": 1, "surface": "空", "hangul": "소라"}] * 2},
    {"text": "空", "overrides": [{"line": 0, "start": 0, "end": 1, "surface": "空", "hangul": "소\n라"}]},
])
def test_rejects_invalid_overrides(client, payload):
    response = client.post("/api/analyze", json=payload)
    assert response.status_code == 422
    assert isinstance(response.json()["detail"], str)


def test_maximum_lines_and_repeated_dictionary_matches(client):
    source = "\n".join(["宇宙へ"] * 500)
    response = client.post("/api/analyze", json={"text": source, "dictionary": [{"surface": "宇宙", "reading": "そら"}]})
    assert response.status_code == 200
    assert len(response.json()["lines"]) == 500
    assert all(line["segments"][0]["hangul"] == "소라" for line in response.json()["lines"])


def test_unknown_dictionary_kana_is_still_flagged(client):
    data = client.post("/api/analyze", json={"text": "宇宙", "dictionary": [{"surface": "宇宙", "reading": "ゖ"}]}).json()
    assert data["lines"][0]["segments"][0]["warnings"]
