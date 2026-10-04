import {expect,it} from 'vitest';
import fixtures from './notation-fixtures.json';
import {convertReading,transliterate} from './transliteration';
it('matches the pinned Python notation engine for every mapped kana and edge cases',()=>{
  for(const c of fixtures) {
    const actual=transliterate(c.reading);
    expect([actual.hangul,actual.warnings],c.reading).toEqual(c.expected);
  }
  expect(transliterate('まっ','て').hangul).toBe('맛');
  expect(()=>convertReading('空')).toThrow();
});
