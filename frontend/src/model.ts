export type Segment = {
  start: number; end: number; surface: string; reading: string; hangul: string;
  kind: 'word' | 'separator'; attach: boolean; warnings: string[];
  customReading?: string; customHangul?: string; reviewed?: boolean;
  origin?: 'dictionary' | 'manual';
  candidates?: {reading:string; hangul:string}[];
};
export type Line = { id: string; source: string; segments: Segment[]; customOutput?: string; translation?: string };
export type DictionaryEntry = { surface: string; reading: string };
export type Result = { lines: Line[]; ruleVersion: string; analyzerVersion: string; dictionaryVersion: string; offsetUnit: string; dictionarySignature?: string };
export type ExportMode = 'paired' | 'reading' | 'triple' | 'wikidot';
export const normalize = (s: string) => s.replace(/\r\n?/g, '\n');
export function lineOutput(line: Line): string {
  if (line.customOutput !== undefined) return line.customOutput;
  let output = '';
  for (const s of line.segments) {
    if (s.kind === 'separator') { output += ' '; continue; }
    let value = s.customHangul ?? s.hangul;
    // ん always maps to ㄴ, including when the analyzer splits it off.
    // Compose across contiguous tokens, but never across an explicit space.
    if (value.startsWith('ㄴ') && output && !output.endsWith(' ')) {
      const last = output.charCodeAt(output.length - 1);
      if (last >= 0xAC00 && last <= 0xD7A3 && (last - 0xAC00) % 28 === 0) {
        output = output.slice(0,-1) + String.fromCharCode(last + 4);
        value = value.slice(1);
      }
    } else if (output && !output.endsWith(' ') && !s.attach) output += ' ';
    output += value;
  }
  return output.trim().replace(/ +/g, ' ');
}
export function wikiLiteral(value: string): string {
  // Explicit entity escapes keep input from becoming table cells, links or markup.
  return value.replace(/[&<>[\]|@#*_\/{}\\=~^`:]+/g, chunk => `@<${Array.from(chunk).map(c => `&#${c.codePointAt(0)};`).join('')}>@`);
}
export function exportText(result: Result, mode: ExportMode): string {
  if (mode === 'wikidot') return '+ 가사\n' + result.lines.map(l => {
    if (!l.source.trim()) return ['|| @@ @@ ||','|| @@ @@ ||','|| @@ @@ ||'].join('\n');
    return [l.source, lineOutput(l), l.translation || ''].map(s => `|| ${s ? wikiLiteral(s) : '@@ @@'} ||`).join('\n');
  }).join('\n');
  return result.lines.map(l => mode === 'reading' ? lineOutput(l) : l.source.trim() ?
    `${l.source}\n${lineOutput(l)}${mode === 'triple' ? `\n${l.translation || ''}` : ''}` : l.source).join('\n');
}
export function mergeResult(next: Result, old: Result | null): Result {
  if (!old) return next;
  // Preserve only identical lines at the same position. Never relocate repeated lyrics.
  return {...next, lines: next.lines.map((line, i) => {
    const prior = old.lines[i];
    if (!prior || prior.source !== line.source) return line;
    return {...line, customOutput: prior.customOutput, translation: prior.translation, segments: line.segments.map(s => {
      const p = prior.segments.find(p => p.start === s.start && p.end === s.end && p.surface === s.surface);
      return p ? {...s, customReading: p.customReading, customHangul: p.customHangul, reviewed: p.reviewed} : s;
    })};
  })};
}
export function hasEdits(line: Line): boolean {
  return line.customOutput !== undefined || !!line.translation || line.segments.some(s => s.customHangul !== undefined);
}
export const pending = (s: Segment) => s.kind === 'word' && s.warnings.length > 0 && !s.reviewed;

export const dictionarySignature = (entries: DictionaryEntry[]) => JSON.stringify([...entries].sort((a,b) => a.surface.localeCompare(b.surface)));
export function collectOverrides(result: Result | null, text: string) {
  const sources = normalize(text).split('\n');
  return (result?.lines || []).flatMap((l, line) => l.source !== sources[line] ? [] : l.segments.flatMap(s =>
    s.customHangul === undefined ? [] : [{line, start:s.start, end:s.end, surface:s.surface, reading:s.customReading || '', hangul:s.customHangul}]));
}
export function preserveLines(next: Result, prior: Result | null): Result {
  return {...next, lines: next.lines.map((l,i) => prior?.lines[i]?.source === l.source ?
    {...l, customOutput:prior.lines[i].customOutput, translation:prior.lines[i].translation} : l)};
}
export function applyRange(result: Result, line: number, first: number, last: number, reading: string, hangul: string): Result {
  const row = result.lines[line];
  const head = row.segments[first], tail = row.segments[last];
  const merged: Segment = {...head, end:tail.end, surface:Array.from(row.source).slice(head.start,tail.end).join(''),
    customReading:reading, customHangul:hangul, reviewed:true, origin:'manual', candidates:first === last ? head.candidates : undefined};
  return {...result, lines:result.lines.map((l,i) => i !== line ? l : {...l, segments:[...l.segments.slice(0,first), merged, ...l.segments.slice(last+1)]})};
}
