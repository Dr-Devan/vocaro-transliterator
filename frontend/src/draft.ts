import { type DictionaryEntry, type Line, type Result, type Segment } from './model';
export const STORAGE = 'vocaro-draft-v1';
export type Draft = { version:2; text:string; result:Result|null; dictionary:DictionaryEntry[] };
const record = (v: unknown): v is Record<string,unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown, max=20000): v is string => typeof v === 'string' && v.length <= max;
const optional = (v: unknown, max=2000) => v === undefined || str(v,max);
function segment(v: unknown, points: string[]): v is Segment {
  if (!record(v) || !Number.isInteger(v.start) || !Number.isInteger(v.end)) return false;
  return (v.start as number) >= 0 && (v.end as number) > (v.start as number) && (v.end as number) <= points.length &&
    str(v.surface) && points.slice(v.start as number,v.end as number).join('') === v.surface &&
    str(v.reading,20000) && str(v.hangul,20000) && ['word','separator'].includes(v.kind as string) && typeof v.attach === 'boolean' &&
    Array.isArray(v.warnings) && v.warnings.length < 30 && v.warnings.every(s => str(s,2000)) &&
    optional(v.customReading,1000) && optional(v.customHangul,2000) && (v.reviewed === undefined || typeof v.reviewed === 'boolean') &&
    (v.origin === undefined || ['manual','dictionary'].includes(v.origin as string)) &&
    (v.candidates === undefined || Array.isArray(v.candidates) && v.candidates.length <= 200 && v.candidates.every(c => record(c) && str(c.reading,20000) && str(c.hangul,20000)));
}
function line(v: unknown): v is Line {
  if (!record(v) || !str(v.id,100) || !str(v.source) || !Array.isArray(v.segments) || v.segments.length > 20000 ||
      !optional(v.customOutput,20000) || !optional(v.translation,2000)) return false;
  let end = 0;
  const points = Array.from(v.source);
  for (const s of v.segments) {
    if (!segment(s,points) || s.start !== end) return false;
    end = s.end;
  }
  return end === points.length;
}
function result(v: unknown): v is Result {
  return record(v) && Array.isArray(v.lines) && v.lines.length <= 500 && v.lines.every(line) &&
    (v.lines as Line[]).reduce((n,l) => n+l.source.length,0) <= 20000 && str(v.ruleVersion,100) && str(v.analyzerVersion,100) && str(v.dictionaryVersion,100) && v.offsetUnit === 'unicode-code-point' &&
    optional(v.dictionarySignature,150000);
}
export function parseDraft(raw: string): Draft {
  if (raw.length > 10000000) throw new Error('프로젝트 파일은 10MB 이하만 지원합니다.');
  let v: unknown;
  try { v = JSON.parse(raw); } catch { throw new Error('올바른 프로젝트 JSON 파일이 아닙니다.'); }
  if (!record(v) || ![1,2].includes(v.version as number) || !str(v.text) || (v.result !== null && !result(v.result)))
    throw new Error('프로젝트 형식이 올바르지 않거나 지원하지 않는 버전입니다.');
  const dictionary = v.version === 1 ? [] : v.dictionary;
  if (!Array.isArray(dictionary) || dictionary.length > 100 || !dictionary.every(e => record(e) && str(e.surface,128) && e.surface.trim() && !/[\r\n]/.test(e.surface) && str(e.reading,1000) && e.reading.trim()) ||
      new Set(dictionary.map(e => e.surface)).size !== dictionary.length) throw new Error('곡별 사전 형식이 올바르지 않습니다.');
  return {version:2,text:v.text,result:v.result as Result|null,dictionary};
}
export function restore(): {draft:Draft; warning:string} {
  const empty:Draft = {version:2,text:'',result:null,dictionary:[]};
  try {
    const raw = localStorage.getItem(STORAGE);
    return {draft:raw ? parseDraft(raw) : empty, warning:''};
  } catch {
    return {draft:empty,warning:'저장된 초안을 읽지 못했습니다. 새 작업을 시작하거나 프로젝트 파일을 불러와 주세요.'};
  }
}
export function download(content:string, name:string, type:string) {
  const url = URL.createObjectURL(new Blob([content],{type}));
  const a = document.createElement('a'); a.href=url; a.download=name; a.click();
  setTimeout(() => URL.revokeObjectURL(url),1000);
}
