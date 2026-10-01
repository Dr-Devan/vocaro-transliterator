import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { exportText, hasEdits, lineOutput, mergeResult, normalize, pending, type Result, type Segment } from './model';
import './style.css';

const STORAGE = 'vocaro-draft-v1';
const SAMPLE = '青い空を見上げた\n風は静かに歌う\n\nきっと明日は晴れる';
function restore(): {text: string; result: Result | null} {
  try { const value = JSON.parse(localStorage.getItem(STORAGE) || 'null');
    if (value?.version === 1 && typeof value.text === 'string' && (!value.result || Array.isArray(value.result.lines) && value.result.lines.every((l: {source?: unknown; segments?: unknown}) => typeof l.source === 'string' && Array.isArray(l.segments)))) return value;
  } catch { /* A damaged or unavailable local store must not prevent editing. */ }
  return {text: '', result: null};
}
async function post<T>(path: string, data: unknown): Promise<T> {
  const res = await fetch(path, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data), signal: AbortSignal.timeout(30000)});
  if (!res.ok) { const body = await res.json().catch(() => ({})); throw new Error(typeof body.detail === 'string' ? body.detail : '입력 길이와 형식을 확인한 뒤 다시 시도해 주세요.'); }
  return res.json();
}
function App() {
  const [initial] = useState(restore);
  const [text, setText] = useState(initial.text);
  const [result, setResult] = useState<Result | null>(initial.result);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(true);
  const [mode, setMode] = useState<'paired' | 'reading'>('paired');
  const [selection, setSelection] = useState<{line: number; segment: number} | null>(null);
  const [reading, setReading] = useState('');
  const [hangul, setHangul] = useState('');
  const [editError, setEditError] = useState('');
  const [editBusy, setEditBusy] = useState(false);
  const [readingDirty, setReadingDirty] = useState(false);
  const [history, setHistory] = useState<Result[]>([]);
  const dialog = useRef<HTMLDialogElement>(null);
  const stale = !!result && result.lines.map(l => l.source).join('\n') !== normalize(text);
  const count = result?.lines.reduce((n, l) => n + l.segments.filter(pending).length, 0) ?? 0;
  const selected = selection && result?.lines[selection.line]?.segments[selection.segment];

  useEffect(() => { const timer = setTimeout(() => {
    try { localStorage.setItem(STORAGE, JSON.stringify({version: 1, text, result})); setSaved(true); }
    catch { setSaved(false); }
  }, 400); return () => clearTimeout(timer); }, [text, result]);
  useEffect(() => { if (selection) dialog.current?.showModal(); else dialog.current?.close(); }, [selection]);

  function change(next: Result) {
    if (result) setHistory(h => [...h.slice(-19), result]);
    setResult(next);
  }
  async function analyze() {
    setBusy(true); setError(''); setMessage('');
    try {
      const next = await post<Result>('/api/analyze', {text});
      const discarded = result?.lines.some((l, i) => hasEdits(l) && next.lines[i]?.source !== l.source);
      change(mergeResult(next, result));
      setMessage(discarded ? '원문이나 위치가 바뀐 행은 새로 분석했습니다. 해당 행의 발음을 다시 확인해 주세요.' : '발음을 생성했습니다. 단어를 눌러 읽기를 수정할 수 있습니다.');
    } catch (e) { setError(e instanceof Error ? e.message : '서버에 연결할 수 없습니다.'); }
    finally { setBusy(false); }
  }
  function openEditor(line: number, segment: number) {
    const s = result!.lines[line].segments[segment];
    setReading(s.customReading ?? s.reading); setHangul(s.customHangul ?? s.hangul); setReadingDirty(false); setEditError(''); setSelection({line, segment});
  }
  async function fromReading() {
    setEditBusy(true); setEditError('');
    try { const data = await post<{hangul: string; warnings: string[]}>('/api/transliterate', {reading}); setHangul(data.hangul); setReadingDirty(false); setEditError(data.warnings.join(' ')); }
    catch (e) { setEditError(e instanceof Error ? e.message : '변환하지 못했습니다.'); }
    finally { setEditBusy(false); }
  }
  function applyEdit(reset = false) {
    if (!result || !selection) return;
    change({...result, lines: result.lines.map((l, i) => i !== selection.line ? l : {...l, segments: l.segments.map((s, j) => j !== selection.segment ? s : {...s,
      customReading: reset ? undefined : reading, customHangul: reset ? undefined : hangul, reviewed: !reset,
    })})});
    setSelection(null);
  }
  async function copy() {
    if (!result || stale) return;
    try { await navigator.clipboard.writeText(exportText(result, mode)); setMessage('클립보드에 복사했습니다.'); }
    catch { setError('복사 권한이 없습니다. 아래 출력 미리보기에서 직접 복사해 주세요.'); }
  }

  return <>
    <header className="topbar"><a className="brand" href="/" aria-label="Vocaro Transliterator 홈"><span className="mark">ア<span>가</span></span><span>vocaro<span className="brand-light"> / transliterator</span></span></a><a className="source-link" href="https://github.com/Dr-Devan/vocaro-transliterator" target="_blank" rel="noreferrer">GitHub ↗</a></header>
    <main>
      <section className="intro"><div className="eyebrow"><span className="dot"/> VOCARO LYRICS TOOL</div><h1>가사에 발음을 붙이다<span>.</span></h1><p>일본어 가사를 넣으면 위키 표기법에 맞춰 한글 발음을 정리합니다.<br className="desktop-break"/> 읽기가 다른 곳은 직접 고치고, 그대로 복사하세요.</p></section>
      <div className="workspace">
        <section className="panel input-panel" aria-labelledby="input-heading">
          <div className="panel-title"><h2 id="input-heading"><span className="step">01</span> 일본어 원문</h2><button className="text-button" disabled={busy} onClick={() => {if (!text || window.confirm('입력한 원문을 예제로 바꿀까요?')) setText(SAMPLE);}}>예제 넣기</button></div>
          <label className="sr-only" htmlFor="lyrics">일본어 가사</label><textarea id="lyrics" className="lyrics-input" value={text} disabled={busy} maxLength={20000} onChange={e => setText(e.target.value)} placeholder={'여기에 일본어 가사를 붙여 넣으세요.\n\n줄바꿈과 빈 줄은 그대로 유지됩니다.'} spellCheck={false}/>
          <div className="input-meta"><span>{text ? normalize(text).split('\n').length : 0}줄</span><span>{text.length.toLocaleString()} / 20,000자</span></div>
          <div className="input-actions"><span className="local-note">{saved ? '초안은 이 브라우저에 저장됩니다' : '초안을 저장하지 못했습니다'}</span><button className="primary" disabled={busy || !text.trim()} onClick={analyze}>{busy ? '발음 생성 중…' : result ? '다시 변환' : '발음 변환'} <span aria-hidden="true">→</span></button></div>
        </section>
        <section className="panel result-panel" aria-labelledby="result-heading">
          <div className="panel-title"><h2 id="result-heading"><span className="step">02</span> 한글 발음</h2>{result && <span className={count ? 'badge warning' : 'badge'}>{count ? `${count}곳 확인 필요` : '변환 완료'}</span>}</div>
          {!result ? <div className="empty-state"><div className="empty-symbol" aria-hidden="true">あ <span>→</span> 아</div><h3>읽기 쉬운 가사의 시작</h3><p>원문을 넣고 발음 변환을 눌러 주세요.<br/>이곳에서 결과를 확인하고 수정할 수 있어요.</p><div className="empty-lines"><i/><i/><i/></div></div> : <div className="result-content">
            {stale && <div className="notice">원문이 바뀌었습니다. 다시 변환하면 복사할 수 있습니다.</div>}
            <div className="result-hint">단어를 누르면 읽기 수정 · 발음 줄에서 띄어쓰기 수정</div>
            {result.lines.map((line, i) => !line.source.trim() ? <div className="stanza-gap" key={line.id} aria-label="빈 줄"/> : <article className="lyric-line" key={line.id}>
              <div className="line-number">{String(i + 1).padStart(2, '0')}</div><div className="line-body">
                <div className="japanese" lang="ja">{line.segments.map((s, j) => s.kind === 'separator' ? <span key={j}>{s.surface}</span> : <button key={j} disabled={stale || busy || line.customOutput !== undefined} className={`word ${pending(s) ? 'needs-review' : ''} ${s.customHangul !== undefined ? 'edited' : ''}`} title={pending(s) ? s.warnings.join(' ') : '읽기 수정'} onClick={() => openEditor(i, j)}>{s.surface}</button>)}</div>
                <input className="hangul-line" aria-label={`${i + 1}행 한글 발음`} disabled={stale || busy} value={lineOutput(line)} onChange={e => change({...result, lines: result.lines.map((l, idx) => idx === i ? {...l, customOutput: e.target.value} : l)})}/>
                {line.customOutput !== undefined && <button className="text-button small" disabled={stale || busy} onClick={() => change({...result, lines: result.lines.map((l, idx) => idx === i ? {...l, customOutput: undefined} : l)})}>행 직접 수정 중 · 단어별 결과로 복원</button>}
              </div>
            </article>)}
          </div>}
          <div className="output-actions"><button className="text-button" disabled={!history.length || busy} onClick={() => {setResult(history[history.length - 1]); setHistory(h => h.slice(0, -1));}}>↶ 수정 취소</button><div className="copy-group"><select aria-label="복사 형식" value={mode} onChange={e => setMode(e.target.value as typeof mode)}><option value="paired">원문 + 발음</option><option value="reading">발음만</option></select><button className="secondary" disabled={!result || stale || busy} onClick={copy}>복사하기</button></div></div>
        </section>
      </div>
      <div className="feedback" aria-live="polite">{error ? <p className="error" role="alert">{error}</p> : <p>{message}</p>}</div>
      {result && <details className="preview"><summary>출력 미리보기</summary><textarea aria-label="출력 미리보기" readOnly value={exportText(result, mode)}/></details>}
      <section className="notes"><div><span className="note-index">A</span><h3>위키 기준으로</h3><p>장음과 촉음, 가나 조합에<br/>보카로 가사 위키 표기법을 적용합니다.</p></div><div><span className="note-index">B</span><h3>곡에 맞게 다듬기</h3><p>한자의 특별한 읽기는 자동으로 알 수 없어요.<br/>노래와 대조하며 읽기를 수정해 주세요.</p></div><div><span className="note-index">C</span><h3>입력한 모양 그대로</h3><p>원문과 빈 줄을 보존하고,<br/>완성된 발음은 한 번에 복사합니다.</p></div></section>
    </main>
    <footer><span>Vocaro Transliterator <span className="muted">· v0.1</span></span><a href="https://vocaro.wikidot.com/guide:ja-ko-notation" target="_blank" rel="noreferrer">표기 기준 보기 ↗</a><span className="privacy">변환 시 원문이 서버로 전송됩니다. 서버에 가사를 저장하지 않습니다.</span></footer>
    <dialog ref={dialog} onCancel={e => {if (editBusy) e.preventDefault(); else setSelection(null);}} onClose={() => setSelection(null)} aria-labelledby="edit-title">
      <div className="dialog-header"><div><div className="eyebrow">READING EDITOR</div><h2 id="edit-title">읽기 수정 <span lang="ja">{selected?.surface}</span></h2></div><button className="close" aria-label="닫기" disabled={editBusy} onClick={() => setSelection(null)}>×</button></div>
      {selected && pending(selected as Segment) && <div className="notice">{selected.warnings.join(' ')}</div>}
      <label htmlFor="reading">일본어 읽기 <span>히라가나 / 가타카나</span></label><div className="reading-row"><input id="reading" lang="ja" value={reading} disabled={editBusy} onChange={e => {setReading(e.target.value); setReadingDirty(true);}}/><button className="secondary" disabled={editBusy || !reading.trim()} onClick={fromReading}>{editBusy ? '변환 중…' : '발음 계산'}</button></div>
      <label htmlFor="hangul">한글 발음 <span>직접 수정할 수도 있어요</span></label><input id="hangul" value={hangul} disabled={editBusy} onChange={e => {setHangul(e.target.value); setReadingDirty(false);}}/>
      <p className="edit-help">읽기를 바꾼 뒤 ‘발음 계산’을 눌러 주세요. 이 위치에만 적용됩니다.</p><p role="status" className="error">{editError}</p>
      <div className="dialog-actions"><button className="text-button" disabled={editBusy} onClick={() => applyEdit(true)}>자동 결과로 복원</button><button className="primary" disabled={editBusy || readingDirty || !hangul.trim()} onClick={() => applyEdit()}>수정 적용</button></div>
    </dialog>
  </>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
