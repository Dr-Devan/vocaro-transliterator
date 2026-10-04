import table from './kana-table.json';
export const RULE_VERSION = 'vocaro-2026-10-02.3';
export const hiragana = (s: string) => s.normalize('NFKC').replace(/[ァ-ヶ]/g,c => String.fromCharCode(c.charCodeAt(0)-0x60));
export const isKana = (s: string) => !!s && /^[ぁ-ゖー]+$/u.test(hiragana(s));
const vowels = ['あかさたなはまやらわがざだばぱぁゃ','いきしちにひみりゐぎじぢびぴぃ','うくすつぬふむゆるぐずづぶぷぅゅゔ','えけせてねへめれゑげぜでべぺぇ','おこそとのほもよろをごぞどぼぽぉょ'];
const small: Record<string,string> = {'ぁ':'あ','ぃ':'い','ぅ':'う','ぇ':'え','ぉ':'お'};
const mappings: Record<string,string> = table;
export function transliterate(reading: string, nextReading = '') {
  const text = hiragana(reading), out: string[] = [], warnings: string[] = [];
  let previous = '';
  const coda = (n: number) => {
    const last = out.at(-1) || '', code = last.charCodeAt(0);
    if (last.length === 1 && code >= 0xac00 && code <= 0xd7a3 && (code-0xac00)%28===0) {
      out[out.length-1]=String.fromCharCode(code+n); return true;
    } return false;
  };
  for(let i=0;i<text.length;i++) {
    const c=text[i];
    if(c==='ん') {if(!coda(4)) out.push('ㄴ');previous='';}
    else if(c==='っ') {
      const following=text[i+1] || hiragana(nextReading)[0];
      if(i && text[i-1]!=='ん' && 'かきくけこさしすせそたちつてとぱぴぷぺぽ'.includes(following || '\0')) coda(19);
      previous='';
    } else if(c==='ー' || previous && (c===previous || previous==='お'&&c==='う' || small[c]===previous)) {
      const last=out.at(-1) || '',code=last.charCodeAt(0);
      if(code>=0xac00&&code<=0xd7a3) {
        let vowel=Math.floor((code-0xac00)/28)%21;
        vowel=({2:0,3:1,6:4,7:5,9:0,10:1,11:20,12:8,14:4,15:5,16:20,17:13,19:20} as Record<number,number>)[vowel]??vowel;
        out.push(String.fromCharCode(0xac00+(11*21+vowel)*28));
      } else {out.push(c);warnings.push('장음의 앞 음절을 확인해 주세요.');}
    } else {
      const pair=text.slice(i,i+2),unit=mappings[pair]?pair:c;
      if(mappings[unit]) {
        out.push(mappings[unit]); const last=small[unit.at(-1)!] || unit.at(-1)!;
        previous=vowels.find(row=>row.includes(last))?.[0] || '';i+=unit.length-1;
      } else if(small[c]) {out.push(mappings[small[c]]);previous=small[c];}
      else if(/[\s\p{P}]/u.test(c)) {out.push(' ');previous='';}
      else {out.push(c);previous='';warnings.push('지원하지 않는 문자의 발음을 확인해 주세요.');}
    }
  }
  return {hangul:out.join('').trim().replace(/\s+/g,' '),warnings:[...new Set(warnings)],ruleVersion:RULE_VERSION};
}
export function convertReading(reading: string) {
  if(!reading.trim() || reading.length>1000 || !reading.trim().split(/\s+/).every(isKana)) throw new Error('히라가나 또는 가타카나 읽기를 입력해 주세요.');
  return transliterate(reading);
}
