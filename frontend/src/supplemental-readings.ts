import type {Morpheme} from './analyzer';

// Confirmed lexical gaps only. Never infer an archaic reading by replacing い with し.
export const supplementalReadings = [{
  surface: '短し', readings: ['みじかし'], pos: '形容詞',
  note: '문어형 읽기를 보완했습니다. 곡의 실제 발음을 확인해 주세요.',
  source: 'https://kotobank.jp/word/短し-3139156',
}];

export function supplementTokens(source:string, tokens:Morpheme[]):(Morpheme & {readingNote?:string})[] {
  const chars=Array.from(source), result:(Morpheme & {readingNote?:string})[]=[];
  for(let i=0;i<tokens.length;i++) {
    const token=tokens[i];
    const entry=supplementalReadings.find(e=>chars.slice(token.begin,token.begin+Array.from(e.surface).length).join('')===e.surface);
    if(entry) {
      const end=token.begin+Array.from(entry.surface).length;
      let last=i;while(last<tokens.length && tokens[last].end<end)last++;
      // Only replace complete tokens; don't cut a longer word or cross a separator.
      if(tokens[last]?.end===end) {
        result.push({surface:entry.surface,readingForm:entry.readings[0],partOfSpeech:[entry.pos],isOov:false,begin:token.begin,end,readingNote:entry.note});
        i=last;continue;
      }
    }
    result.push(token);
  }
  return result;
}
