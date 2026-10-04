> **AI 사용 고지:** 이 앱은 AI 코딩 도구를 활용하여 제작되었습니다.

# Vocaro Transliterator

일본어 가사에 [보카로 가사 위키 표기법](https://vocaro.wikidot.com/guide:ja-ko-notation)에 따른 한국어 발음을 붙이는 웹앱입니다.

**[웹앱 열기](https://dr-devan.github.io/vocaro-transliterator/)**

Sudachi를 WebAssembly로 실행하고 한글 표기는 TypeScript 규칙 엔진에서 처리합니다. 첫 방문에 원본 SudachiDict Core 20250825를 압축한 약 72MB의 사전을 다운로드합니다. 다운로드 중에도 원문 입력과 프로젝트 불러오기가 가능합니다. 준비가 끝나면 변환 버튼을 사용할 수 있습니다. 사전은 브라우저에 캐시하며, 저장 공간이 부족하면 현재 탭에서만 사용합니다. 원문은 서버로 전송하지 않습니다.

## 사용

- 원문 입력 → 발음 변환 → 확인 필요 구간 검수 → 복사 또는 저장.
- 私·明日처럼 여러 읽기가 있는 단어는 단어를 눌러 후보를 선택합니다. 특수 읽기는 직접 입력할 수 있습니다.
- 구간 편집, 곡별 읽기 사전, 행별 발음 수정, 번역 입력을 지원합니다.
- 원문·발음·번역 및 Wikidot 표로 출력하고 프로젝트 JSON으로 저장·복원합니다.
- 시스템·라이트·다크 테마를 지원합니다. 초안과 테마는 브라우저에 보관합니다.
- 최대 20,000자·500줄입니다. 자동 결과는 음원과 다를 수 있으므로 검수가 필요합니다.

사전 압축 해제 후 크기는 약 217MB이며 분석 엔진과 다운로드 버퍼도 메모리를 사용합니다. 실제 저사양 모바일 기기의 메모리 한계는 별도 검증이 필요합니다. 사전 준비 후 같은 탭의 변환은 인터넷 없이도 가능하지만, 오프라인에서 페이지를 처음 열거나 새로고침하는 기능은 제공하지 않습니다. 브라우저가 캐시를 지우면 사전을 다시 다운로드합니다.

## 빌드 및 로컬 실행

Python 3.12, Node.js 22, Rust와 wasm-bindgen CLI 0.2.129가 필요합니다. 배포용 바이너리는 저장소에 넣지 않고 CI에서 재현합니다.

```sh
python -m venv .venv
# macOS/Linux: source .venv/bin/activate
# Windows PowerShell: .\.venv\Scripts\Activate.ps1
pip install -r backend/requirements-dev.txt
rustup target add wasm32-unknown-unknown
cargo install wasm-bindgen-cli --version 0.2.129 --locked
cargo build --manifest-path wasm/Cargo.toml --release --locked --target wasm32-unknown-unknown
wasm-bindgen wasm/target/wasm32-unknown-unknown/release/vocaro_sudachi.wasm --target web --out-dir frontend/public/engine --out-name vocaro_sudachi
python scripts/prepare-browser.py
cd frontend
npm ci
npm run dev
```

개발 주소는 http://127.0.0.1:5173 입니다. 준비한 자산이 있으면 `scripts/start.ps1` 또는 `sh scripts/start.sh`로 빌드 후 정적 서버를 실행할 수 있습니다. Python API는 필요하지 않습니다. backend는 기존 구현과의 비교 검사 용도로 유지합니다.

## 검사와 배포

```sh
python -m pytest backend/tests -q  # PYTHONPATH=backend 설정
cd frontend
npm test
npx playwright install chromium
npm run test:e2e
```

GitHub Actions가 원본 사전 압축과 WASM 빌드, Python 및 TypeScript 검사, Pages 하위 경로의 정적 서버에서 브라우저 검사를 수행합니다. main 브랜치의 검사가 통과하면 GitHub Pages에 배포합니다. 사전과 WASM은 앱과 같은 사이트에서 제공합니다. 사전의 압축 파일은 SHA-256으로 검사합니다.

브라우저 검사는 기존 Python 결과와 24행의 단어 구간·읽기·후보·한글 표기를 비교하고, 다운로드 실패 후 재시도·캐시 재사용·구간 수정·곡 사전·프로젝트 저장 및 복원·Wikidot 출력·테마·모바일 화면을 확인합니다. 이 비교가 모든 가사의 자동 읽기 정확도를 보장하지는 않습니다.

[표기 규칙](docs/notation-rules.md), [구현 결정](docs/decisions.md), [예제 프로젝트](fixtures/demo-project.json)를 참고하세요.

## 출처 및 라이선스

- 아이콘: Google Material Symbols Rounded, [Apache 2.0](frontend/public/material-symbols-LICENSE.txt).
- 분석기: [Sudachi.rs](https://github.com/WorksApplications/sudachi.rs)의 [WASM 대응 포크](https://github.com/nyanrus/sudachi.rs/tree/42a5f2debb9785794eac9cd5eb0b730a47be0f97), [Apache 2.0](frontend/public/sudachi-LICENSE.txt). 포크의 커밋과 Rust 의존성을 고정합니다.
- 사전: [SudachiDict Core](https://github.com/WorksApplications/SudachiDict), 20250825. 원본 사전의 변환·축소 없이 gzip 압축만 적용합니다. [법적 고지](frontend/public/sudachidict-LEGAL.txt)와 [Apache 2.0](frontend/public/sudachi-LICENSE.txt)을 사이트에 함께 배포합니다.
- 표기 기준: [보카로 가사 위키 일본어 표기법](https://vocaro.wikidot.com/guide:ja-ko-notation), [곡 작성 안내](https://vocaro.wikidot.com/guide:song-page). 위키 문서 전문은 포함하지 않습니다.
