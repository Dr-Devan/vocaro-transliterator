# Vocaro Transliterator

일본어 가사에 [보카로 가사 위키 표기법](https://vocaro.wikidot.com/guide:ja-ko-notation)에 따른 한글 발음을 붙이는 웹앱입니다.

원문 입력 → 발음 생성 → 읽기 수정 → 복사. 한자 읽기는 SudachiPy로 추정하고, 한글 표기는 독립 규칙 엔진에서 처리합니다.

## 실행

Python 3.12, Node.js 22가 필요합니다.

```sh
python -m venv .venv
# macOS/Linux: source .venv/bin/activate
# Windows PowerShell: .\.venv\Scripts\Activate.ps1
pip install -r backend/requirements-dev.txt
cd backend
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

별도 터미널에서:

```sh
cd frontend
npm ci
npm run dev
```

[http://127.0.0.1:5173](http://127.0.0.1:5173)을 엽니다. 개발 서버가 `/api`를 Python 서버로 연결합니다.

## 사용

- 일본어 원문을 입력하고 **발음 변환**을 누릅니다. 최대 20,000자, 500줄입니다.
- 결과의 일본어 단어를 누르면 가나 읽기와 한글 발음을 수정할 수 있습니다.
- 가나를 바꾸고 **발음 계산**, **수정 적용** 순으로 누릅니다.
- 발음 줄을 직접 편집하면 해당 행의 출력이 고정됩니다. **단어별 결과로 복원**으로 해제합니다.
- 수정은 동일 위치의 동일 원문에만 유지합니다. 원문이나 행 위치가 바뀐 경우 다시 검수합니다.
- 초안은 브라우저 저장소에 보관합니다. 서버는 가사를 저장하거나 외부 AI로 보내지 않습니다.
- 변환을 위해 원문이 앱 서버로 전송됩니다. 초안은 공유 기기의 브라우저에 남을 수 있습니다.

## 테스트

```sh
cd backend
python -m pytest tests -q
cd ../frontend
npm test
npm run build
npx playwright install chromium
# API 서버가 실행된 상태에서:
npm run test:e2e
```

## 컨테이너 배포

```sh
docker build -t vocaro-transliterator .
docker run --rm -p 8000:8000 vocaro-transliterator
```

컨테이너가 화면과 API를 함께 제공합니다. `/api/health`로 상태를 확인합니다. 공개 운영 시 HTTPS와 프록시의 요청 크기·속도 제한을 적용하세요. GitHub Pages만으로는 Python API를 실행할 수 없습니다.

## 정확도와 현재 범위

- 자동 분석은 곡의 실제 발음과 다를 수 있습니다. 사전에 있는 단어도 검수가 필요합니다.
- 가사에만 쓰이는 특별한 읽기는 사용자가 지정합니다. 음원 분석·AI 추론은 포함하지 않습니다.
- 읽기를 찾지 못한 구간은 삭제하지 않고 원문과 확인 표시를 남깁니다.
- 띄어쓰기는 형태소와 조사·어미 결합을 바탕으로 한 초안입니다. 직접 수정할 수 있습니다.
- 위키 발음 칸 원칙에 따라 부호는 발음 출력에서 생략하며 원문에는 보존합니다.
- 범용 루비 파싱, 여러 토큰을 합치는 구간 편집, 곡별 사전, 번역과 Wikidot 표 출력은 후속 작업입니다.
- 규칙과 애매한 사례의 결정은 [표기 규칙](docs/notation-rules.md)과 [구현 결정](docs/decisions.md)에 기록합니다.

## 출처

표기 기준: [보카로 가사 위키 일본어 표기법](https://vocaro.wikidot.com/guide:ja-ko-notation), [곡 작성 안내](https://vocaro.wikidot.com/guide:song-page), 확인일 2026-10-02.

형태소 분석: [SudachiPy / Sudachi.rs](https://github.com/WorksApplications/sudachi.rs), 사전: [SudachiDict](https://github.com/WorksApplications/SudachiDict). 해당 프로젝트의 라이선스를 따릅니다. 위키 표기 문서는 일부 기여 내용에 별도 라이선스를 명시하므로 문서·표의 재배포 조건을 구분해야 합니다. 이 저장소는 위키 문서 전문을 포함하지 않습니다.
