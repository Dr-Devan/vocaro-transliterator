import pytest
from app.transliteration import transliterate


@pytest.mark.parametrize("reading, expected", [
    ("あいうえお", "아이우에오"), ("カキクケコ", "카키쿠케코"),
    ("しゃしゅしょ", "샤슈쇼"), ("じゃじゅじょ", "자주조"),
    ("ちゃちゅちょ", "차추초"), ("ほうそう", "호오소오"),
    ("じょうきょう", "조오쿄오"), ("ゆうずう", "유우즈으"),
    ("せいめい", "세이메이"), ("えいが", "에이가"),
    ("とおい", "토오이"), ("すう", "스으"), ("スーパー", "스으파아"),
    ("がっこう", "갓코오"), ("きっと", "킷토"), ("しゅっぱつ", "슛파츠"),
    ("って", "테"), ("んっか", "ん카"), ("あっが", "아가"),
    ("がんばる", "간바루"), ("しんいち", "신이치"), ("ぜんや", "젠야"),
    ("フュージョン", "퓨우존"), ("ティーム", "티이무"), ("ヴォーカル", "보오카루"),
    ("ファフィフェフォ", "파피페포"), ("ｶﾞｯｺｳ", "갓코오"),
    ("か\u3099っこう", "갓코오"), ("ねぇ", "네에"), ("キャー", "캬아"),
    ("コーラス！", "코오라스"), ("お う", "오 우"), ("未知", "未知"),
])
def test_notation(reading, expected):
    assert transliterate(reading)[0] == expected


def test_unknown_is_visible():
    value, warnings = transliterate("abc")
    assert value == "abc" and warnings


def test_lone_long_mark_is_reviewable():
    assert transliterate("ー")[1]
