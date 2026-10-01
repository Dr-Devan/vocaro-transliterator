import { describe, it, expect } from 'vitest';
import { applyRange, collectOverrides, dictionarySignature, mergeResult, lineOutput, exportText, preserveLines, wikiLiteral, type Result, type Line } from './model';
import { parseDraft } from './draft';
const line: Line = {id:'line-0',source:'空へ',segments:[
  {start:0,end:1,surface:'空',reading:'そら',hangul:'소라',kind:'word',attach:false,warnings:[]},
  {start:1,end:2,surface:'へ',reading:'え',hangul:'에',kind:'word',attach:true,warnings:[]},
]};
const result: Result = {lines:[line],ruleVersion:'v1',analyzerVersion:'1',dictionaryVersion:'1',offsetUnit:'unicode-code-point'};
describe('editing and export', () => {
  it('attaches particles', () => expect(lineOutput(line)).toBe('소라에'));
  it('composes a split ん into ㄴ without assimilating to ㅇ or ㅁ', () => {
    const base = line.segments[0];
    const word = {...base,surface:'痛い',hangul:'이타이'};
    const nasal = {...base,surface:'ん',hangul:'ㄴ',attach:true};
    const end = {...base,surface:'だ',hangul:'다',attach:true};
    expect(lineOutput({...line,segments:[word,nasal,end]})).toBe('이타인다');
    expect(lineOutput({...line,segments:[{...word,hangul:'시'},nasal,{...end,hangul:'파이'}]})).toBe('신파이');
    expect(lineOutput({...line,segments:[word,{...base,kind:'separator',surface:' ',hangul:' '},nasal,end]})).toBe('이타이 ㄴ다');
    expect(lineOutput({...line,segments:[nasal]})).toBe('ㄴ');
  });
  it('keeps blank lines and original source', () => {
    const data = {...result,lines:[line,{id:'line-1',source:'',segments:[]},line]};
    expect(exportText(data,'paired')).toBe('空へ\n소라에\n\n空へ\n소라에');
  });
  it('retains overrides on unchanged text', () => {
    const old = {...result,lines:[{...line,customOutput:'소라 에'}]};
    expect(lineOutput(mergeResult(result,old).lines[0])).toBe('소라 에');
  });
  it('does not move an edit onto changed source', () => {
    const next = {...result,lines:[{...line,source:'夢へ'}]};
    expect(mergeResult(next,{...result,lines:[{...line,customOutput:'edited'}]}).lines[0].customOutput).toBeUndefined();
  });
  it('retains token edits without altering original', () => {
    const edited = {...line,segments:line.segments.map((s,i) => i ? s : {...s,customReading:'くう',customHangul:'쿠우',reviewed:true})};
    const merged = mergeResult(result,{...result,lines:[edited]});
    expect(lineOutput(merged.lines[0])).toBe('쿠우에');
    expect(merged.lines[0].source).toBe('空へ');
  });
  it('merges a range and supplies one override to the API', () => {
    const edited = applyRange(result,0,0,1,'ゆめ','유메');
    expect(edited.lines[0].segments).toHaveLength(1);
    expect(collectOverrides(edited,'空へ')).toEqual([{line:0,start:0,end:2,surface:'空へ',reading:'ゆめ',hangul:'유메'}]);
    expect(collectOverrides(edited,'夢へ')).toEqual([]);
  });
  it('keeps translation only when source is unchanged', () => {
    const previous = {...result,lines:[{...line,translation:'하늘로'}]};
    expect(preserveLines(result,previous).lines[0].translation).toBe('하늘로');
    expect(preserveLines({...result,lines:[{...line,source:'海へ'}]},previous).lines[0].translation).toBeUndefined();
  });
  it('exports three rows even for blank stanzas and empty translations', () => {
    const data = {...result,lines:[line,{id:'blank',source:'',segments:[]},line]};
    const rows = exportText(data,'wikidot').split('\n').slice(1);
    expect(rows).toHaveLength(9);
    expect(rows.every(s => s.startsWith('|| ') && s.endsWith(' ||'))).toBe(true);
    expect(exportText(result,'triple')).toBe('空へ\n소라에\n');
  });
  it('escapes table separators, links, HTML and escape markers', () => {
    const escaped = wikiLiteral('空||[[html]]<script>@@**&');
    expect(escaped).not.toContain('||');
    expect(escaped).not.toContain('[[html]]');
    expect(escaped).not.toContain('<script>');
    expect(escaped).not.toContain('@@');
    expect(escaped).toContain('&#124;');
    expect(escaped.replace(/@<((?:&#\d+;)+)>@/g, (_, entities:string) => entities.replace(/&#(\d+);/g, (_,code:string) => String.fromCodePoint(Number(code))))).toBe('空||[[html]]<script>@@**&');
  });
  it('dictionary order does not mark an unchanged result stale', () => {
    const a={surface:'宇宙',reading:'そら'}, b={surface:'明日',reading:'あす'};
    expect(dictionarySignature([a,b])).toBe(dictionarySignature([b,a]));
  });
  it('round trips a v2 project and migrates v1', () => {
    const draft={version:2,text:'空へ',result,dictionary:[{surface:'空',reading:'そら'}]};
    expect(parseDraft(JSON.stringify(draft))).toEqual(draft);
    expect(parseDraft(JSON.stringify({version:1,text:'空へ',result})).dictionary).toEqual([]);
  });
  it('rejects corrupted segments rather than crashing at render', () => {
    const corrupt={...result,lines:[{...line,segments:[{}]}]};
    expect(() => parseDraft(JSON.stringify({version:2,text:'空へ',result:corrupt,dictionary:[]}))).toThrow();
  });
  it('rejects missing source coverage and unsupported versions', () => {
    const corrupt={...result,lines:[{...line,segments:line.segments.slice(1)}]};
    expect(() => parseDraft(JSON.stringify({version:2,text:'空へ',result:corrupt,dictionary:[]}))).toThrow();
    expect(() => parseDraft('{"version":99}')).toThrow();
  });
});
