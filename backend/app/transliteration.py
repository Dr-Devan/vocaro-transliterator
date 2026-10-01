"""Deterministic kana -> Hangul, using the Vocaro lyrics notation profile."""
import unicodedata

RULE_VERSION = "vocaro-2026-10-02.1"
ROWS = [
    ("あいうえお", "아 이 우 에 오"), ("かきくけこ", "카 키 쿠 케 코"),
    ("さしすせそ", "사 시 스 세 소"), ("たちつてと", "타 치 츠 테 토"),
    ("なにぬねの", "나 니 누 네 노"), ("はひふへほ", "하 히 후 헤 호"),
    ("まみむめも", "마 미 무 메 모"), ("やゆよ", "야 유 요"),
    ("らりるれろ", "라 리 루 레 로"), ("わゐゑを", "와 이 에 오"),
    ("がぎぐげご", "가 기 구 게 고"), ("ざじずぜぞ", "자 지 즈 제 조"),
    ("だぢづでど", "다 지 즈 데 도"), ("ばびぶべぼ", "바 비 부 베 보"),
    ("ぱぴぷぺぽ", "파 피 푸 페 포"), ("ゔ", "부"),
]
TABLE = {k: v for keys, values in ROWS for k, v in zip(keys, values.split())}
for stem, values in {
    "き": "캬 큐 쿄", "ぎ": "갸 규 교", "し": "샤 슈 쇼", "じ": "자 주 조",
    "ち": "차 추 초", "ぢ": "자 주 조", "に": "냐 뉴 뇨", "ひ": "햐 휴 효",
    "び": "뱌 뷰 뵤", "ぴ": "퍄 퓨 표", "み": "먀 뮤 묘", "り": "랴 류 료",
    "ゔ": "뱌 뷰 뵤", "ふ": "퍄 퓨 표", "て": "탸 튜 툐", "で": "댜 듀 됴",
}.items():
    TABLE.update({stem + end: value for end, value in zip("ゃゅょ", values.split())})
TABLE.update(dict(zip(
    "いぇ うぁ うぃ うぇ うぉ ゔぁ ゔぃ ゔぇ ゔぉ くぁ くぃ くぇ くぉ ぐぁ ぐぃ ぐぇ ぐぉ しぇ じぇ ちぇ つぁ つぃ つぇ つぉ てぃ とぅ でぃ どぅ ふぁ ふぃ ふぇ ふぉ きぃ きぇ ぎぃ ぎぇ すぃ ずぃ にぇ ひぇ びぃ びぇ ぴぃ ぴぇ みぃ みぇ りぃ りぇ".split(),
    "예 와 위 웨 워 바 비 베 보 콰 퀴 퀘 쿼 과 귀 궤 궈 셰 제 체 차 치 체 초 티 투 디 두 파 피 페 포 키 켸 기 계 시 지 녜 혜 비 볘 피 폐 미 몌 리 례".split(),
)))
SMALL = dict(zip("ぁぃぅぇぉ", "あいうえお"))
SOKUON_NEXT = set("かきくけこさしすせそたちつてとぱぴぷぺぽ")


def hiragana(text: str) -> str:
    text = unicodedata.normalize("NFKC", text)
    return "".join(chr(ord(c) - 0x60) if "ァ" <= c <= "ヶ" else c for c in text)


def is_kana(text: str) -> bool:
    return bool(text) and all("ぁ" <= c <= "ゖ" or c in "ーんっ" for c in hiragana(text))


def _vowel(kana: str) -> str:
    last = SMALL.get(kana[-1], kana[-1])
    for row in ("あかさたなはまやらわがざだばぱぁゃ", "いきしちにひみりゐぎじぢびぴぃ", "うくすつぬふむゆるぐずづぶぷぅゅゔ", "えけせてねへめれゑげぜでべぺぇ", "おこそとのほもよろをごぞどぼぽぉょ"):
        if last in row:
            return row[0]
    return ""


def _extend(syllable: str) -> str:
    """Repeat the mapped Korean vowel (スー -> 스으, not 스우)."""
    vowel = (ord(syllable) - 0xAC00) // 28 % 21
    simple = {2: 0, 3: 1, 6: 4, 7: 5, 9: 0, 10: 1, 11: 20,
              12: 8, 14: 4, 15: 5, 16: 20, 17: 13, 19: 20}.get(vowel, vowel)
    return chr(0xAC00 + (11 * 21 + simple) * 28)


def _coda(out: list[str], coda: int) -> bool:
    if out and len(out[-1]) == 1 and "가" <= out[-1] <= "힣" and (ord(out[-1]) - 0xAC00) % 28 == 0:
        out[-1] = chr(ord(out[-1]) + coda)
        return True
    return False


def transliterate(reading: str) -> tuple[str, list[str]]:
    text = hiragana(reading)
    out: list[str] = []
    warnings: list[str] = []
    previous_vowel = ""
    i = 0
    while i < len(text):
        c = text[i]
        if c == "ん":
            if not _coda(out, 4):
                out.append("ん")
                warnings.append("단독 ん의 발음을 확인해 주세요.")
            previous_vowel = ""
        elif c == "っ":
            if i and text[i - 1] != "ん" and i + 1 < len(text) and text[i + 1] in SOKUON_NEXT:
                _coda(out, 19)
            previous_vowel = ""
        elif c == "ー" or (previous_vowel and (c == previous_vowel or previous_vowel == "お" and c == "う" or SMALL.get(c) == previous_vowel)):
            if out and "가" <= out[-1] <= "힣":
                out.append(_extend(out[-1]))
            else:
                out.append(c)
                warnings.append("장음의 앞 음절을 확인해 주세요.")
        else:
            pair = text[i:i + 2]
            unit = pair if pair in TABLE else c
            if unit in TABLE:
                out.append(TABLE[unit])
                previous_vowel = _vowel(unit)
                i += len(unit) - 1
            elif c in SMALL:
                out.append(TABLE[SMALL[c]])
                previous_vowel = SMALL[c]
            elif c.isspace() or unicodedata.category(c)[0] == "P":
                out.append(" ")
                previous_vowel = ""
            else:
                out.append(c)
                previous_vowel = ""
                warnings.append("지원하지 않는 문자의 발음을 확인해 주세요.")
        i += 1
    return " ".join("".join(out).split()), list(dict.fromkeys(warnings))
