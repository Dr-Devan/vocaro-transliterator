export type Segment = {
  start: number; end: number; surface: string; reading: string; hangul: string;
  kind: 'word' | 'separator'; attach: boolean; warnings: string[];
  customReading?: string; customHangul?: string; reviewed?: boolean;
};
export type Line = { id: string; source: string; segments: Segment[]; customOutput?: string };
export type Result = { lines: Line[]; ruleVersion: string; analyzerVersion: string; dictionaryVersion: string; offsetUnit: string };
export const normalize = (s: string) => s.replace(/\r\n?/g, '\n');
export function lineOutput(line: Line): string {
  if (line.customOutput !== undefined) return line.customOutput;
  let output = '';
  for (const s of line.segments) {
    if (s.kind === 'separator') { output += ' '; continue; }
    if (output && !output.endsWith(' ') && !s.attach) output += ' ';
    output += s.customHangul ?? s.hangul;
  }
  return output.trim().replace(/ +/g, ' ');
}
export function exportText(result: Result, mode: 'paired' | 'reading'): string {
  return result.lines.map(l => mode === 'reading' ? lineOutput(l) : l.source.trim() ? `${l.source}\n${lineOutput(l)}` : l.source).join('\n');
}
export function mergeResult(next: Result, old: Result | null): Result {
  if (!old) return next;
  // Preserve only identical lines at the same position. Never relocate repeated lyrics.
  return {...next, lines: next.lines.map((line, i) => {
    const prior = old.lines[i];
    if (!prior || prior.source !== line.source) return line;
    return {...line, customOutput: prior.customOutput, segments: line.segments.map(s => {
      const p = prior.segments.find(p => p.start === s.start && p.end === s.end && p.surface === s.surface);
      return p ? {...s, customReading: p.customReading, customHangul: p.customHangul, reviewed: p.reviewed} : s;
    })};
  })};
}
export function hasEdits(line: Line): boolean {
  return line.customOutput !== undefined || line.segments.some(s => s.customHangul !== undefined || s.reviewed);
}
export const pending = (s: Segment) => s.kind === 'word' && s.warnings.length > 0 && !s.reviewed;
