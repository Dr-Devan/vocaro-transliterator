import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
const parity=JSON.parse(readFileSync(new URL('./parity.json',import.meta.url),'utf8'));

test('matches Python Sudachi tokens, readings and candidates without sending lyrics to an API',async({page})=>{
  const api:string[]=[];
  page.on('request',r=>{if(r.url().includes('/api/'))api.push(r.url());});
  await page.goto('./');
  await page.getByLabel('일본어 가사',{exact:true}).fill(parity.lines.map((l:{source:string})=>l.source).join('\n'));
  await page.getByRole('button',{name:'발음 변환'}).click();
  await expect(page.getByLabel('1행 한글 발음',{exact:true})).toHaveValue('이타인다');
  const [download]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'프로젝트 저장',exact:true}).click()]);
  const stream=await download.createReadStream();let text='';for await(const chunk of stream!)text+=chunk.toString();
  expect(JSON.parse(text).result.lines).toEqual(parity.lines);
  expect(api).toEqual([]);
});

test('input remains available during download and cached dictionary works on return',async({page,context})=>{
  let downloads=0;
  await page.route('**/dictionary/*.gz',async route=>{downloads++;await new Promise(r=>setTimeout(r,500));await route.continue();});
  await page.goto('./');
  await page.getByLabel('일본어 가사',{exact:true}).fill('待って');
  await expect(page.getByLabel('일본어 가사',{exact:true})).toBeEnabled();
  await page.getByRole('button',{name:'발음 변환'}).click();
  await expect(page.getByLabel('1행 한글 발음')).toHaveValue('맛테');
  expect(downloads).toBe(1);
  await page.reload();
  await expect(page.getByText('분석 준비 완료 · 발음 변환은 이 기기에서 처리됩니다.',{exact:true})).toBeVisible();
  expect(downloads).toBe(1);
  await context.setOffline(true);
  await page.getByLabel('일본어 가사',{exact:true}).fill('痛いんだ');
  await page.getByRole('button',{name:'다시 변환'}).click();
  await expect(page.getByLabel('1행 한글 발음')).toHaveValue('이타인다');
});
