import type {DictionaryEntry, Result, Segment} from './model';
import {hiragana, isKana, transliterate, RULE_VERSION, convertReading} from './transliteration';
export type Morpheme = {surface:string; readingForm:string; partOfSpeech:string[]; isOov:boolean; begin:number; end:number};
export type Engine = {tokenize(text:string):Morpheme[]; readings(surface:string,pos:string):string[]};
export type Override = {line:number; start:number; end:number; surface:string; reading:string; hangul:string};
export type AnalysisInput = {text:string; dictionary:DictionaryEntry[]; overrides:Override[]};

export function analyzeLocal(engine:Engine, input:AnalysisInput):Result {
  const sources=input.text.replace(/\r\n?/g,'\n').split('\n');
  if(Array.from(input.text).length>20000 || sources.length>500 || input.dictionary.length>100 || input.overrides.length>2000) throw new Error('입력 길이와 형식을 확인해 주세요. 원문은 최대 20,000자·500줄입니다.');
  if(new Set(input.dictionary.map(e=>e.surface)).size!==input.dictionary.length) throw new Error('같은 사전 표기는 하나만 등록해 주세요.');
  for(const e of input.dictionary) {
    if(!e.surface.trim() || Array.from(e.surface).length>128 || /[\r\n]/.test(e.surface)) throw new Error('사전 표기는 한 줄의 비어 있지 않은 문자열이어야 합니다.');
    convertReading(e.reading);
  }
  const previous=new Map<number,number>();
  for(const o of [...input.overrides].sort((a,b)=>a.line-b.line || a.start-b.start)) {
    if(!Number.isInteger(o.line)||!Number.isInteger(o.start)||!Number.isInteger(o.end)||o.start<0||o.end<=o.start||sources[o.line]===undefined || Array.from(sources[o.line]).slice(o.start,o.end).join('')!==o.surface || o.end>Array.from(sources[o.line]).length || o.start<(previous.get(o.line)||0) || !o.hangul || o.hangul.length>2000 || /[\r\n]/.test(o.hangul)) throw new Error('수정한 구간의 원문과 한 줄 발음을 확인해 주세요.');
    if(o.reading) convertReading(o.reading);previous.set(o.line,o.end);
  }
  const candidates=(s:Segment,pos='') => {
    const current=s.customReading || s.reading;
    const choices=[...new Set([current,...(isKana(s.surface)?[]:engine.readings(s.surface,pos).map(hiragana))].filter(r=>r&&isKana(r)))];
    s.candidates=choices.map(reading=>({reading,hangul:transliterate(reading).hangul}));return s;
  };
  const literal=(surface:string,start:number,end:number):Segment=>({surface,start,end,reading:'',hangul:' ',kind:'separator',attach:false,warnings:[]});
  const tokenize=(source:string,offset=0,fragment=false):Segment[] => {
    const result:Segment[]=[],chars=Array.from(source);let end=0;
    for(const token of engine.tokenize(source)) {
      const start=token.begin,stop=token.end;
      if(start>end) result.push(literal(chars.slice(end,start).join(''),offset+end,offset+start));
      const surface=chars.slice(start,stop).join(''),pos=token.partOfSpeech[0];
      if(/^\s+$/u.test(surface)||/^\p{P}+$/u.test(surface)) result.push(literal(surface,offset+start,offset+stop));
      else {
        let reading=hiragana(isKana(surface)?surface:token.readingForm);
        if(pos==='助詞' && ['は','へ','を'].includes(surface)) reading=({'は':'わ','へ':'え','を':'お'} as Record<string,string>)[surface];
        const warnings:string[]=[];
        if(fragment) warnings.push('사전 적용으로 나뉜 구간입니다. 읽기를 확인해 주세요.');
        else {
          if(token.isOov&&!isKana(surface)) warnings.push('사전에 없는 표현입니다.');
          if(/[a-zA-Z0-9]/.test(surface)) warnings.push('영문·숫자의 읽기를 확인해 주세요.');
        }
        let hangul=surface;
        if(!reading||!isKana(reading)) {reading='';if(!fragment) warnings.push('읽기를 찾지 못했습니다. 가나 읽기를 입력해 주세요.');}
        else {const converted=transliterate(reading);hangul=converted.hangul;warnings.push(...converted.warnings);}
        result.push(candidates({start:offset+start,end:offset+stop,surface,reading,hangul,kind:'word',attach:['助詞','助動詞','接尾辞'].includes(pos),warnings},pos));
      }
      end=stop;
    }
    if(end<chars.length) result.push(literal(chars.slice(end).join(''),offset+end,offset+chars.length));
    return result;
  };
  const lines=sources.map((source,line)=>{
    const chars=Array.from(source),original=tokenize(source);
    type Span=Override & {origin:'manual'|'dictionary';warnings?:string[]};
    const spans:Span[]=input.overrides.filter(o=>o.line===line).map(o=>({...o,origin:'manual'}));
    const manual=[...spans];
    const entries=[...input.dictionary].sort((a,b)=>Array.from(b.surface).length-Array.from(a.surface).length);
    for(let cursor=0;cursor<chars.length;) {
      const blocked=manual.find(o=>o.start<=cursor&&o.end>cursor);
      if(blocked) {cursor=blocked.end;continue;}
      const match=entries.find(e=>chars.slice(cursor,cursor+Array.from(e.surface).length).join('')===e.surface && !manual.some(o=>o.start<cursor+Array.from(e.surface).length&&o.end>cursor));
      if(match) {
        const converted=transliterate(match.reading);
        spans.push({line,start:cursor,end:cursor+Array.from(match.surface).length,surface:match.surface,reading:match.reading,hangul:converted.hangul,origin:'dictionary',warnings:converted.warnings});cursor+=Array.from(match.surface).length;
      } else cursor++;
    }
    let segments=original;
    if(spans.length) {
      segments=[];let cursor=0;
      const fragment=(start:number,end:number)=>{
        for(const s of original) {
          const left=Math.max(start,s.start),right=Math.min(end,s.end);if(left>=right)continue;
          if(left===s.start&&right===s.end)segments.push(s);
          else if(s.kind==='separator') segments.push(literal(chars.slice(left,right).join(''),left,right));
          else segments.push(...tokenize(chars.slice(left,right).join(''),left,true));
        }
      };
      for(const span of spans.sort((a,b)=>a.start-b.start)) {
        fragment(cursor,span.start);
        const old=original.find(s=>s.start===span.start);
        const notes=span.warnings || [];
        const s:Segment={start:span.start,end:span.end,surface:span.surface,reading:span.reading,hangul:span.hangul,origin:span.origin,kind:'word',attach:old?.attach||false,warnings:notes,reviewed:!notes.length};
        if(span.origin==='manual') {s.customReading=span.reading;s.customHangul=span.hangul;}
        if(old?.surface===span.surface) s.candidates=[{reading:span.reading,hangul:span.hangul},...(old.candidates||[]).filter(c=>c.reading!==span.reading)];
        else candidates(s);
        segments.push(s);cursor=span.end;
      }
      fragment(cursor,chars.length);
    }
    segments.forEach((s,i)=>{
      const next=segments[i+1];
      if(s.kind==='word'&&next?.kind==='word'&&s.end===next.start&&s.customHangul===undefined&&s.reading.endsWith('っ')) s.hangul=transliterate(s.reading,next.customReading??next.reading).hangul;
    });
    return {id:`line-${line}`,source,segments};
  });
  return {lines,ruleVersion:RULE_VERSION,analyzerVersion:'sudachi-wasm-42a5f2d',dictionaryVersion:'20250825',offsetUnit:'unicode-code-point'};
}
