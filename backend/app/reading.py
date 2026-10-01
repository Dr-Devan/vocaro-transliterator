"""Analysis keeps original offsets; normalization never rewrites the source."""
from importlib.metadata import version
from threading import Lock
from bisect import bisect_left, bisect_right
from functools import lru_cache
import unicodedata
from sudachipy import dictionary, tokenizer
from .transliteration import hiragana, is_kana, transliterate, RULE_VERSION


class Reader:
    def __init__(self):
        self.dictionary = dictionary.Dictionary(dict="core")
        self.tokenizer = self.dictionary.create()
        self.lock = Lock()

    @lru_cache(maxsize=2048)
    def candidate_readings(self, surface, pos):
        # Exact surface and contextual major POS avoid unrelated readings such as
        # the noun シ for the pronoun 私. Kana spelling itself is not ambiguous.
        if is_kana(surface):
            return ()
        return tuple(dict.fromkeys(hiragana(m.reading_form()) for m in self.dictionary.lookup(surface)
                                   if (not pos or m.part_of_speech()[0] == pos) and is_kana(m.reading_form())))

    def add_candidates(self, segment, pos=""):
        readings = self.candidate_readings(segment["surface"], pos)
        current = segment.get("customReading") or segment["reading"]
        choices = list(dict.fromkeys(([current] if current else []) + list(readings)))
        segment["candidates"] = [dict(reading=r, hangul=transliterate(r)[0]) for r in choices if r]
        return segment

    def analyze(self, text: str, entries=(), overrides=()) -> dict:
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
                        self.add_candidates(segment, pos[0])
                    segments.append(segment)
                    end = stop
                if end < len(source):
                    segments.append(self.literal(source[end:], end, len(source)))
                manual = [item for item in overrides if item.line == line_index]
                spans = [dict(start=m.start, end=m.end, surface=m.surface, reading=m.reading,
                              hangul=m.hangul, origin="manual") for m in manual]
                # Longest exact surface wins; explicit per-occurrence edits always win.
                ordered = sorted(entries, key=lambda entry: len(entry.surface), reverse=True)
                manual_spans = sorted(spans, key=lambda s: s["start"])
                manual_index = 0
                cursor = 0
                while cursor < len(source):
                    while manual_index < len(manual_spans) and manual_spans[manual_index]["end"] <= cursor:
                        manual_index += 1
                    blocked = manual_spans[manual_index] if manual_index < len(manual_spans) else None
                    if blocked and blocked["start"] <= cursor:
                        cursor = blocked["end"]
                        continue
                    match = next((e for e in ordered if source.startswith(e.surface, cursor)
                                  and (blocked is None or cursor + len(e.surface) <= blocked["start"])), None)
                    if match:
                        value, notes = transliterate(match.reading)
                        spans.append(dict(start=cursor, end=cursor + len(match.surface), surface=match.surface,
                                          reading=match.reading, hangul=value, origin="dictionary", warnings=notes))
                        cursor += len(match.surface)
                    else:
                        cursor += 1
                if spans:
                    segments = self.overlay(source, segments, spans)
                lines.append(dict(id=f"line-{line_index}", source=source, segments=segments))
        return dict(lines=lines, ruleVersion=RULE_VERSION, analyzerVersion=version("sudachipy"),
                    dictionaryVersion=version("sudachidict_core"), offsetUnit="unicode-code-point")

    def overlay(self, source, segments, spans):
        output = []
        cursor = 0
        starts = [s["start"] for s in segments]
        ends = [s["end"] for s in segments]
        by_start = {s["start"]: s for s in segments}
        for span in sorted(spans, key=lambda item: item["start"]):
            output.extend(self.fragment(source, segments[bisect_right(ends,cursor):bisect_left(starts,span["start"])], cursor, span["start"]))
            original = by_start.get(span["start"])
            notes = span.get("warnings", [])
            item = dict(span, kind="word", attach=original["attach"] if original else False,
                        warnings=notes, reviewed=not notes)
            if span["origin"] == "manual":
                item.update(customReading=span["reading"], customHangul=span["hangul"])
            if original and original["surface"] == span["surface"]:
                choices = original.get("candidates", [])
                item["candidates"] = [dict(reading=span["reading"], hangul=span["hangul"])] + [c for c in choices if c["reading"] != span["reading"]]
            else:
                self.add_candidates(item)
            output.append(item)
            cursor = span["end"]
        output.extend(self.fragment(source, segments[bisect_right(ends,cursor):], cursor, len(source)))
        return output

    def fragment(self, source, segments, start, end):
        """Retain full tokens and their context; re-read only sliced token edges."""
        output = []
        for token in segments:
            left, right = max(start, token["start"]), min(end, token["end"])
            if left >= right:
                continue
            if left == token["start"] and right == token["end"]:
                output.append(token)
                continue
            surface = source[left:right]
            if token["kind"] == "separator":
                output.append(self.literal(surface, left, right))
                continue
            pieces = self.tokenizer.tokenize(surface, tokenizer.Tokenizer.SplitMode.B)
            for piece in pieces:
                part = surface[piece.begin():piece.end()]
                reading = hiragana(part) if is_kana(part) else hiragana(piece.reading_form())
                notes = ["사전 적용으로 나뉜 구간입니다. 읽기를 확인해 주세요."]
                hangul, warnings = transliterate(reading) if is_kana(reading) else (part, [])
                output.append(self.add_candidates(dict(start=left + piece.begin(), end=left + piece.end(), surface=part,
                                   reading=reading if is_kana(reading) else "", hangul=hangul,
                                   kind="word", attach=piece.part_of_speech()[0] in ("助詞", "助動詞", "接尾辞"),
                                   warnings=notes + warnings), piece.part_of_speech()[0]))
        return output

    @staticmethod
    def literal(surface, start, end):
        return dict(start=start, end=end, surface=surface, reading="", hangul=" ",
                    kind="separator", attach=False, warnings=[])
