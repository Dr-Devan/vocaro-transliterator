"""Analysis keeps original offsets; normalization never rewrites the source."""
from importlib.metadata import version
from threading import Lock
import unicodedata
from sudachipy import dictionary, tokenizer
from .transliteration import hiragana, is_kana, transliterate, RULE_VERSION


class Reader:
    def __init__(self):
        self.dictionary = dictionary.Dictionary(dict="core")
        self.tokenizer = self.dictionary.create()
        self.lock = Lock()

    def analyze(self, text: str) -> dict:
        lines = []
        # Tokenizer instances are not shared concurrently between requests.
        with self.lock:
            for line_index, source in enumerate(text.replace("\r\n", "\n").replace("\r", "\n").split("\n")):
                segments = []
                end = 0
                for token in self.tokenizer.tokenize(source, tokenizer.Tokenizer.SplitMode.B):
                    start, stop = token.begin(), token.end()
                    if start > end:
                        segments.append(self.literal(source[end:start], end, start))
                    surface = source[start:stop]
                    pos = token.part_of_speech()
                    if surface.isspace() or all(unicodedata.category(c)[0] == "P" for c in surface):
                        segment = self.literal(surface, start, stop)
                    else:
                        reasons = []
                        # Preserve kana orthography, including エイ; use context only for particles.
                        reading = hiragana(surface) if is_kana(surface) else hiragana(token.reading_form())
                        if pos[0] == "助詞" and surface in ("は", "へ", "を"):
                            reading = {"は": "わ", "へ": "え", "を": "お"}[surface]
                        if token.is_oov() and not is_kana(surface):
                            reasons.append("辞書にない語")
                        if any(c.isascii() and c.isalnum() for c in surface):
                            reasons.append("영문·숫자의 읽기를 확인해 주세요.")
                        if not reading or not is_kana(reading):
                            reading = ""
                            hangul = surface
                            reasons.append("읽기를 찾지 못했습니다. 가나 읽기를 입력해 주세요.")
                        else:
                            hangul, notes = transliterate(reading)
                            reasons.extend(notes)
                        reasons = ["사전에 없는 표현입니다." if r == "辞書にない語" else r for r in reasons]
                        segment = dict(start=start, end=stop, surface=surface, reading=reading,
                                       hangul=hangul, kind="word", attach=pos[0] in ("助詞", "助動詞", "接尾辞"),
                                       warnings=reasons)
                    segments.append(segment)
                    end = stop
                if end < len(source):
                    segments.append(self.literal(source[end:], end, len(source)))
                lines.append(dict(id=f"line-{line_index}", source=source, segments=segments))
        return dict(lines=lines, ruleVersion=RULE_VERSION, analyzerVersion=version("sudachipy"),
                    dictionaryVersion=version("sudachidict_core"), offsetUnit="unicode-code-point")

    @staticmethod
    def literal(surface, start, end):
        return dict(start=start, end=end, surface=surface, reading="", hangul=" ",
                    kind="separator", attach=False, warnings=[])
