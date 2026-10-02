import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { applyRange, collectOverrides, dictionarySignature, exportText, hasEdits, lineOutput, normalize, pending, preserveLines, type DictionaryEntry, type ExportMode, type Result } from './model';
import { download, parseDraft, restore, STORAGE } from './draft';
import { useTheme } from './theme';
import { Icon, IconButton } from './Icon';
import './style.css';
import './prototype.css';
import './icons.css';

const SAMPLE = '青い空を見上げた\n風は静かに歌う\n\nきっと明日は晴れる';
async function post<T>(path: string, data: unknown): Promise<T> {
  let res: Response;
  try { res = await fetch(path, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data), signal: AbortSignal.timeout(30000)}); }
  catch { throw new Error('변환 서버에 연결하지 못했거나 응답 시간이 초과되었습니다. 입력은 유지되며 다시 시도할 수 있습니다.'); }
  if (!res.ok) { const body = await res.json().catch(() => ({})); throw new Error(typeof body.detail === 'string' ? body.detail : '입력 길이와 형식을 확인한 뒤 다시 시도해 주세요.'); }
  return res.json();
}
function App() {
  const [theme,setTheme] = useTheme();
  const [initial] = useState(restore);
  const [text, setText] = useState(initial.draft.text);
  const [result, setResult] = useState<Result | null>(initial.draft.result);
  const [serverRuleVersion, setServerRuleVersion] = useState('');
  const [dictionary, setDictionary] = useState<DictionaryEntry[]>(initial.draft.dictionary);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState(initial.warning);
  const [saved, setSaved] = useState(true);
  const [mode, setMode] = useState<ExportMode>('paired');
  const [selection, setSelection] = useState<{line: number; segment: number} | null>(null);
  const [reading, setReading] = useState('');
  const [hangul, setHangul] = useState('');
  const [editError, setEditError] = useState('');
  const [editBusy, setEditBusy] = useState(false);
  const [readingDirty, setReadingDirty] = useState(false);
  const [rangeEnd, setRangeEnd] = useState(0);
  const [allOccurrences, setAllOccurrences] = useState(false);
  const [dictSurface, setDictSurface] = useState('');
  const [dictReading, setDictReading] = useState('');
  const [translations, setTranslations] = useState(false);
  const [history, setHistory] = useState<{result:Result|null; dictionary:DictionaryEntry[]}[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const stale = !!result && (result.lines.map(l => l.source).join('\n') !== normalize(text) || (result.dictionarySignature ?? '[]') !== dictionarySignature(dictionary) || !!serverRuleVersion && result.ruleVersion !== serverRuleVersion);
  const count = result?.lines.reduce((n, l) => n + l.segments.filter(pending).length, 0) ?? 0;
  const selected = selection && result?.lines[selection.line]?.segments[selection.segment];
  const selectedRow = selection && result?.lines[selection.line];
  const rangeSurface = selectedRow && selected ? Array.from(selectedRow.source).slice(selected.start,selectedRow.segments[rangeEnd]?.end).join('') : '';
  const missingTranslations = result?.lines.filter(l => l.source.trim() && !l.translation?.trim()).length || 0;
  useEffect(() => {fetch('/api/health').then(r => r.json()).then(d => setServerRuleVersion(d.ruleVersion || '')).catch(() => {});}, []);

  useEffect(() => { const timer = setTimeout(() => {
    try { localStorage.setItem(STORAGE, JSON.stringify({version: 2, text, result, dictionary})); setSaved(true); }
    catch { setSaved(false); }
  }, 400); return () => clearTimeout(timer); }, [text, result, dictionary]);
  useEffect(() => { const save = () => {try {localStorage.setItem(STORAGE, JSON.stringify({version:2,text,result,dictionary}));} catch { /* handled by visible save state */ }};
    window.addEventListener('pagehide',save); return () => window.removeEventListener('pagehide',save); }, [text,result,dictionary]);
  useEffect(() => { if (selection) dialog.current?.showModal(); else dialog.current?.close(); }, [selection]);

  function change(next: Result, entries = dictionary) {
    setHistory(h => [...h.slice(-19), {result,dictionary}]);
    setDictionary(entries);
    setResult(next);
  }
  async function analyze() {
    setBusy(true); setError(''); setMessage('');
    try {
      const next = await post<Result>('/api/analyze', {text, dictionary, overrides:collectOverrides(result,text)});
      next.dictionarySignature = dictionarySignature(dictionary);
      const discarded = result?.lines.some((l, i) => hasEdits(l) && next.lines[i]?.source !== l.source);
      change(preserveLines(next, result));
      setMessage(discarded ? '원문이나 위치가 바뀐 행은 새로 분석했습니다. 해당 행의 발음을 다시 확인해 주세요.' : '발음을 생성했습니다. 단어를 눌러 읽기를 수정할 수 있습니다.');
    } catch (e) { setError(e instanceof Error ? e.message : '서버에 연결할 수 없습니다.'); }
    finally { setBusy(false); }
  }
  function openEditor(line: number, segment: number) {
    const s = result!.lines[line].segments[segment];
    setReading(s.customReading ?? s.reading); setHangul(s.customHangul ?? s.hangul); setReadingDirty(false); setEditError(''); setRangeEnd(segment); setAllOccurrences(false); setSelection({line, segment});
  }
  async function fromReading() {
    setEditBusy(true); setEditError('');
    try { const data = await post<{hangul: string; warnings: string[]}>('/api/transliterate', {reading}); setHangul(data.hangul); setReadingDirty(false); setEditError(data.warnings.join(' ')); }
    catch (e) { setEditError(e instanceof Error ? e.message : '변환하지 못했습니다.'); }
    finally { setEditBusy(false); }
  }
  async function applyEdit(reset = false) {
    if (!result || !selection) return;
    setEditBusy(true); setEditError('');
    try {
      if (reset) {
        const overrides = collectOverrides(result,text).filter(s => !(s.line === selection.line && s.start === selected!.start));
        const next = await post<Result>('/api/analyze',{text,dictionary,overrides});
        next.dictionarySignature = dictionarySignature(dictionary);
        change(preserveLines(next,result));
      } else {
        if (reading.trim()) await post('/api/transliterate',{reading});
        const edited = applyRange(result,selection.line,selection.segment,rangeEnd,reading,hangul);
        if (allOccurrences) {
          const entries = [...dictionary.filter(e => e.surface !== rangeSurface),{surface:rangeSurface,reading}];
          const next = await post<Result>('/api/analyze',{text,dictionary:entries,overrides:collectOverrides(edited,text)});
          next.dictionarySignature = dictionarySignature(entries);
          change(preserveLines(next,edited),entries);
        } else change(edited);
      }
      setSelection(null);
    } catch(e) { setEditError(e instanceof Error ? e.message : '수정을 적용하지 못했습니다.'); }
    finally {setEditBusy(false);}
  }
  async function addDictionary() {
    setBusy(true); setError('');
    try {
      if (!dictSurface.trim() || /[\r\n]/.test(dictSurface)) throw new Error('사전에 등록할 일본어 표기를 입력해 주세요.');
      if (dictionary.length >= 100 && !dictionary.some(e => e.surface === dictSurface)) throw new Error('사전에는 최대 100개까지 등록할 수 있습니다.');
      await post('/api/transliterate',{reading:dictReading});
      setDictionary([...dictionary.filter(e => e.surface !== dictSurface),{surface:dictSurface,reading:dictReading.trim()}]);
      setDictSurface(''); setDictReading(''); setMessage('사전에 등록했습니다. 다시 변환하면 곡 전체에 적용됩니다.');
    } catch(e) {setError(e instanceof Error ? e.message : '사전을 등록하지 못했습니다.');}
    finally {setBusy(false);}
  }
  async function importFile(file?:File) {
    if (!file) return;
    try {
      if (file.size > 10000000) throw new Error('프로젝트 파일은 10MB 이하만 지원합니다.');
      const draft = parseDraft(await file.text());
      if (text && !window.confirm('현재 작업을 불러온 프로젝트로 바꿀까요?')) return;
      setText(draft.text); setResult(draft.result); setDictionary(draft.dictionary); setHistory([]); setError(''); setMessage('프로젝트를 불러왔습니다.');
    } catch(e) {setError(e instanceof Error ? e.message : '파일을 불러오지 못했습니다.');}
    finally {if(fileInput.current) fileInput.current.value='';}
  }
  async function copy() {
    if (!result || stale) return;
    try { await navigator.clipboard.writeText(exportText(result, mode)); setMessage('클립보드에 복사했습니다.'); }
    catch { setError('복사 권한이 없습니다. 아래 출력 미리보기에서 직접 복사해 주세요.'); }
  }

  return <>
    <header className="topbar"><a className="brand" href="/" aria-label="Vocaro Transliterator 홈"><span className="mark">ア<span>가</span></span><span>vocaro<span className="brand-light"> / transliterator</span></span></a><div className="header-actions"><div className="theme-control" title={`화면 테마: ${theme === 'system' ? '시스템 설정' : theme === 'dark' ? '다크' : '라이트'}`}><Icon name={theme === 'system' ? 'brightness_auto' : theme === 'dark' ? 'dark_mode' : 'light_mode'}/><label className="sr-only" htmlFor="theme">화면 테마</label><select id="theme" value={theme} onChange={e => setTheme(e.target.value as 'system'|'light'|'dark')}><option value="system">시스템 설정</option><option value="light">라이트</option><option value="dark">다크</option></select></div><a aria-label="GitHub 저장소" title="GitHub 저장소" className="source-link icon-button" href="https://github.com/Dr-Devan/vocaro-transliterator" target="_blank" rel="noreferrer"><Icon name="code"/></a></div></header>
    <main>
      <h1 className="tool-title">가사 발음 변환</h1>
      <div className="project-toolbar"><span>시제품 v0.2</span><IconButton icon="note_add" label="새 곡" disabled={busy} onClick={() => {if (!text || window.confirm('현재 작업을 비우고 새 곡을 시작할까요? 프로젝트를 저장하면 나중에 복원할 수 있습니다.')) {setText('');setResult(null);setDictionary([]);setHistory([]);setMessage('새 곡을 시작합니다.');setError('');}}} /><IconButton icon="save" label="프로젝트 저장" disabled={busy} onClick={() => download(JSON.stringify({version:2,text,result,dictionary},null,2),'vocaro-project.json','application/json')} /><IconButton icon="folder_open" label="프로젝트 불러오기" disabled={busy} onClick={() => fileInput.current?.click()} /><input ref={fileInput} type="file" accept=".json,application/json" className="sr-only" aria-label="프로젝트 파일" onChange={e => importFile(e.target.files?.[0])}/></div>
      <div className="workspace">
        <section className="panel input-panel" aria-labelledby="input-heading">
          <div className="panel-title"><h2 id="input-heading"><span className="step">01</span> 일본어 원문</h2><button className="text-button" disabled={busy} onClick={() => {if (!text || window.confirm('입력한 원문을 예제로 바꿀까요?')) setText(SAMPLE);}}>예제 넣기</button></div>
          <label className="sr-only" htmlFor="lyrics">일본어 가사</label><textarea id="lyrics" className="lyrics-input" value={text} disabled={busy} maxLength={20000} onChange={e => setText(e.target.value)} placeholder={'여기에 일본어 가사를 붙여 넣으세요.\n\n줄바꿈과 빈 줄은 그대로 유지됩니다.'} spellCheck={false}/>
          <div className="input-meta"><span>{text ? normalize(text).split('\n').length : 0}줄</span><span>{text.length.toLocaleString()} / 20,000자</span></div>
          <div className="input-actions"><span className="local-note">{saved ? '초안은 이 브라우저에 저장됩니다' : '초안을 저장하지 못했습니다'}</span><button className="primary" disabled={busy || !text.trim()} onClick={analyze}>{busy ? '발음 생성 중…' : result ? '다시 변환' : '발음 변환'} <Icon name="arrow_forward"/></button></div>
        </section>
        <section className="panel result-panel" aria-labelledby="result-heading">
          <div className="panel-title"><h2 id="result-heading"><span className="step">02</span> 한글 발음</h2>{result && <span className={count ? 'badge warning' : 'badge'}>{count ? `${count}곳 확인 필요` : '변환 완료'}</span>}</div>
          {!result ? <div className="empty-state"><p>원문을 입력하고 ‘발음 변환’을 누르세요.</p></div> : <div className="result-content">
            {stale && <div className="notice">원문·사전 또는 변환 규칙이 바뀌었습니다. 다시 변환하면 복사할 수 있습니다.</div>}
            <div className="result-hint">단어를 누르면 읽기 수정 · 발음 줄에서 띄어쓰기 수정</div>
            {result.lines.map((line, i) => !line.source.trim() ? <div className="stanza-gap" key={line.id} aria-label="빈 줄"/> : <article className="lyric-line" key={line.id}>
              <div className="line-number">{String(i + 1).padStart(2, '0')}</div><div className="line-body">
                <div className="japanese" lang="ja">{line.segments.map((s, j) => s.kind === 'separator' ? <span key={j}>{s.surface}</span> : <button key={j} disabled={stale || busy || line.customOutput !== undefined} className={`word ${pending(s) ? 'needs-review' : ''} ${s.customHangul !== undefined || s.origin === 'dictionary' ? 'edited' : ''}`} title={pending(s) ? s.warnings.join(' ') : s.origin === 'dictionary' ? '곡 사전 적용 · 읽기 수정' : '읽기 수정'} onClick={() => openEditor(i, j)}>{s.surface}</button>)}</div>
                <input className="hangul-line" aria-label={`${i + 1}행 한글 발음`} disabled={stale || busy} value={lineOutput(line)} onChange={e => change({...result, lines: result.lines.map((l, idx) => idx === i ? {...l, customOutput: e.target.value} : l)})}/>
                {line.customOutput !== undefined && <button className="text-button small" disabled={stale || busy} onClick={() => change({...result, lines: result.lines.map((l, idx) => idx === i ? {...l, customOutput: undefined} : l)})}>행 직접 수정 중 · 단어별 결과로 복원</button>}
                {(translations || mode === 'triple' || mode === 'wikidot') && <input className="translation-line" aria-label={`${i+1}행 번역`} placeholder="한국어 번역 입력 (선택)" value={line.translation || ''} maxLength={2000} disabled={stale || busy} onChange={e => change({...result,lines:result.lines.map((l,idx) => idx === i ? {...l,translation:e.target.value} : l)})}/>}
              </div>
            </article>)}
          </div>}
          <div className="output-actions"><IconButton icon="undo" label="수정 취소" className="text-button" disabled={!history.length || busy} onClick={() => {const old=history[history.length-1];setResult(old.result);setDictionary(old.dictionary);setHistory(h => h.slice(0,-1));}} /><div className="copy-group"><select aria-label="복사 형식" value={mode} onChange={e => setMode(e.target.value as ExportMode)}><option value="paired">원문 + 발음</option><option value="reading">발음만</option><option value="triple">원문 + 발음 + 번역</option><option value="wikidot">Wikidot 표</option></select><IconButton icon="content_copy" label="복사하기" className="secondary" disabled={!result || stale || busy} onClick={copy} /></div></div>
        </section>
      </div>
      <div className="feedback" aria-live="polite">{error ? <p className="error" role="alert">{error}</p> : <p>{message}</p>}</div>
      <details className="dictionary-panel"><summary>곡별 읽기 사전 <span>{dictionary.length}개</span></summary><p>이 곡에서 같은 표기를 같은 읽기로 변환합니다. 긴 표현을 우선하며, 직접 수정한 위치는 유지됩니다.</p><div className="dictionary-form"><label>일본어 표기<input aria-label="사전 일본어 표기" value={dictSurface} maxLength={128} disabled={busy} onChange={e => setDictSurface(e.target.value)} placeholder="宇宙"/></label><label>가나 읽기<input aria-label="사전 가나 읽기" value={dictReading} maxLength={1000} disabled={busy} onChange={e => setDictReading(e.target.value)} placeholder="そら"/></label><button className="secondary" disabled={busy || !dictSurface || !dictReading} onClick={addDictionary}><Icon name="add"/>사전 등록</button></div><ul>{dictionary.map(entry => <li key={entry.surface}><span lang="ja">{entry.surface} → {entry.reading}</span><IconButton icon="delete" className="text-button" disabled={busy} label={`${entry.surface} 사전 삭제`} onClick={() => setDictionary(dictionary.filter(e => e.surface !== entry.surface))} /></li>)}</ul></details>
      {result && <><div className="export-options"><label><input type="checkbox" checked={translations} onChange={e => setTranslations(e.target.checked)}/> 번역 입력 칸 표시</label><IconButton icon="download" label="결과 TXT 저장" className="text-button" disabled={stale || busy} onClick={() => download(exportText(result,mode),'vocaro-lyrics.txt','text/plain;charset=utf-8')} /></div>{(mode === 'triple' || mode === 'wikidot') && missingTranslations > 0 && <div className="notice">번역 {missingTranslations}행이 비어 있는 초안입니다. 빈 번역 칸을 유지하여 출력합니다.</div>}<details className="preview"><summary>출력 미리보기</summary>{stale && <p className="error">이전 결과입니다. 원문과 사전을 다시 변환해 주세요.</p>}<textarea aria-label="출력 미리보기" readOnly value={exportText(result, mode)}/>{mode === 'wikidot' && <p>일반 텍스트를 가사 표로 출력합니다. 위키에 붙여 넣은 뒤 최종 미리보기를 확인해 주세요.</p>}</details></>}
    </main>
    <footer><span>Vocaro Transliterator <span className="muted">· v0.2</span></span><a href="https://vocaro.wikidot.com/guide:ja-ko-notation" target="_blank" rel="noreferrer">표기 기준 보기 ↗</a><span className="privacy">변환 시 원문이 서버로 전송됩니다. 서버에 가사를 저장하지 않습니다.</span></footer>
    <dialog ref={dialog} onCancel={e => {if (editBusy) e.preventDefault(); else setSelection(null);}} onClose={() => setSelection(null)} aria-labelledby="edit-title">
      <div className="dialog-header"><h2 id="edit-title">읽기 수정 <span lang="ja">{rangeSurface}</span></h2><IconButton icon="close" label="닫기"  disabled={editBusy} onClick={() => setSelection(null)} /></div>
      {selected && pending(selected) && <div className="notice">{selected.warnings.join(' ')}</div>}
      {selection && rangeEnd === selection.segment && (selected?.candidates?.length || 0) > 1 && <fieldset className="reading-candidates"><legend>읽기 후보</legend>{selected!.candidates!.map(c => <button type="button" key={c.reading} aria-pressed={reading === c.reading} disabled={editBusy} onClick={() => {setReading(c.reading);setHangul(c.hangul);setReadingDirty(false);setEditError('');}}><span lang="ja">{c.reading}</span><span>{c.hangul}</span></button>)}</fieldset>}
      <label htmlFor="range-end">수정 구간의 끝 <span>여러 단어를 하나로 읽을 때 선택</span></label><select id="range-end" disabled={editBusy} value={rangeEnd} onChange={e => {setRangeEnd(Number(e.target.value));setReadingDirty(true);setReading('');setHangul('');setAllOccurrences(false);}}>{selectedRow?.segments.map((s,i) => selection && i >= selection.segment && s.kind === 'word' ? <option key={i} value={i}>{s.surface}까지</option> : null)}</select>
      <label htmlFor="reading">일본어 읽기 <span>히라가나 / 가타카나</span></label><div className="reading-row"><input id="reading" lang="ja" value={reading} maxLength={1000} disabled={editBusy} onChange={e => {setReading(e.target.value); setReadingDirty(true);}}/><button className="secondary" disabled={editBusy || !reading.trim()} onClick={fromReading}>{editBusy ? '변환 중…' : '발음 계산'}</button></div>
      <label htmlFor="hangul">한글 발음 <span>직접 수정할 수도 있어요</span></label><input id="hangul" value={hangul} maxLength={2000} disabled={editBusy} onChange={e => {setHangul(e.target.value); setReadingDirty(false);}}/>
      <p className="edit-help">읽기를 바꾼 뒤 ‘발음 계산’을 눌러 주세요. 기본적으로 이 위치에만 적용됩니다.</p><label className="checkbox-label"><input type="checkbox" checked={allOccurrences} disabled={editBusy || !reading.trim() || rangeSurface.length > 128} onChange={e => setAllOccurrences(e.target.checked)}/> 이 읽기를 곡 사전에 등록하고 같은 표현에 적용</label><p role="status" className="error">{editError}</p>
      <div className="dialog-actions"><IconButton icon="restart_alt" label="자동 결과로 복원" className="text-button" disabled={editBusy} onClick={() => applyEdit(true)} /><button className="primary" disabled={editBusy || readingDirty || !hangul.trim()} onClick={() => applyEdit()}><Icon name="check"/>수정 적용</button></div>
    </dialog>
  </>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
