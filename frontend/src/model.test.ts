import { describe, it, expect } from 'vitest';
import { mergeResult, lineOutput, exportText, type Result, type Line } from './model';
const line: Line = {id:'line-0',source:'空へ',segments:[
  {start:0,end:1,surface:'空',reading:'そら',hangul:'소라',kind:'word',attach:false,warnings:[]},
  {start:1,end:2,surface:'へ',reading:'え',hangul:'에',kind:'word',attach:true,warnings:[]},
]};
const result: Result = {lines:[line],ruleVersion:'v1',analyzerVersion:'1',dictionaryVersion:'1',offsetUnit:'unicode-code-point'};
describe('editing and export', () => {
  it('attaches particles', () => expect(lineOutput(line)).toBe('소라에'));
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
});
