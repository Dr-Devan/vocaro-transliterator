from pydantic import BaseModel, Field, field_validator, model_validator
from .transliteration import is_kana


def valid_reading(value: str) -> str:
    value = value.strip()
    if not value or not all(is_kana(part) for part in value.split()):
        raise ValueError("히라가나 또는 가타카나 읽기를 입력해 주세요.")
    return value


class DictionaryEntry(BaseModel):
    surface: str = Field(min_length=1, max_length=128)
    reading: str = Field(min_length=1, max_length=1000)

    @field_validator("surface")
    @classmethod
    def check_surface(cls, value):
        if not value.strip() or "\n" in value or "\r" in value:
            raise ValueError("사전 표기는 한 줄의 비어 있지 않은 문자열이어야 합니다.")
        return value

    @field_validator("reading")
    @classmethod
    def check_reading(cls, value):
        return valid_reading(value)


class Override(BaseModel):
    line: int = Field(ge=0, lt=500)
    start: int = Field(ge=0, le=20000)
    end: int = Field(gt=0, le=20000)
    surface: str = Field(min_length=1, max_length=20000)
    reading: str = Field(default="", max_length=1000)
    hangul: str = Field(min_length=1, max_length=2000)

    @model_validator(mode="after")
    def check(self):
        if self.end <= self.start or "\n" in self.hangul or "\r" in self.hangul:
            raise ValueError("구간과 한 줄 발음을 확인해 주세요.")
        if self.reading:
            self.reading = valid_reading(self.reading)
        return self


class AnalyzeRequest(BaseModel):
    text: str = Field(max_length=20000)
    dictionary: list[DictionaryEntry] = Field(default_factory=list, max_length=100)
    overrides: list[Override] = Field(default_factory=list, max_length=2000)

    @model_validator(mode="after")
    def check(self):
        lines = self.text.replace("\r\n", "\n").replace("\r", "\n").split("\n")
        if len(lines) > 500:
            raise ValueError("500줄 이내로 입력해 주세요.")
        if len({entry.surface for entry in self.dictionary}) != len(self.dictionary):
            raise ValueError("같은 사전 표기는 하나만 등록해 주세요.")
        previous = {}
        for item in sorted(self.overrides, key=lambda item: (item.line, item.start)):
            if item.line >= len(lines) or lines[item.line][item.start:item.end] != item.surface or item.end > len(lines[item.line]):
                raise ValueError("수정한 구간의 원문이 달라졌습니다. 다시 분석해 주세요.")
            if item.start < previous.get(item.line, 0):
                raise ValueError("수정 구간이 서로 겹칩니다.")
            previous[item.line] = item.end
        return self
