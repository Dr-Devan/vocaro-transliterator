import {expect,it} from 'vitest';
import {analyzeLocal, type Engine} from './analyzer';
import {supplementTokens} from './supplemental-readings';
import {lineOutput} from './model';

const tokens=[
  {surface:'短',readingForm:'タン',partOfSpeech:['名詞'],isOov:false,begin:0,end:1},
  {surface:'し',readingForm:'シ',partOfSpeech:['動詞'],isOov:false,begin:1,end:2},
];
const engine:Engine={tokenize:()=>tokens,readings:()=>[]};
it('repairs a confirmed archaic lexical gap, exposes its candidate, and keeps offsets',()=>{
  const result=analyzeLocal(engine,{text:'短し',dictionary:[],overrides:[]});
  const segment=result.lines[0].segments[0];
  expect(result.lines[0].segments).toHaveLength(1);
  expect(segment).toMatchObject({surface:'短し',start:0,end:2,reading:'みじかし',hangul:'미지카시',candidates:[{reading:'みじかし',hangul:'미지카시'}]});
  expect(segment.warnings).toHaveLength(1);
  expect(lineOutput(result.lines[0])).toBe('미지카시');
});
it('lets the song dictionary and explicit edits override the supplement',()=>{
  expect(lineOutput(analyzeLocal(engine,{text:'短し',dictionary:[{surface:'短し',reading:'たんし'}],overrides:[]}).lines[0])).toBe('탄시');
  const result=analyzeLocal(engine,{text:'短し',dictionary:[{surface:'短し',reading:'たんし'}],overrides:[{line:0,start:0,end:2,surface:'短し',reading:'みじかし',hangul:'미지카시'}]});
  expect(result.lines[0].segments[0]).toMatchObject({origin:'manual',reviewed:true});
  expect(lineOutput(result.lines[0])).toBe('미지카시');
});
it('does not cut a larger token or combine across whitespace',()=>{
  const longer={...tokens[0],surface:'短しろ',end:3};
  expect(supplementTokens('短しろ',[longer])).toEqual([longer]);
  const spaced=[tokens[0],{...tokens[1],begin:2,end:3}];
  expect(supplementTokens('短 し',spaced)).toEqual(spaced);
});
