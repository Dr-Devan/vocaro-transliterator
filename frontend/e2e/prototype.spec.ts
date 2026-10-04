import { test, expect } from '@playwright/test';

test('song dictionary, range edit, translation, project round trip and wiki export', async ({page,context}) => {
  await context.grantPermissions(['clipboard-read','clipboard-write']);
  await page.goto('./');
  await page.getByLabel('일본어 가사',{exact:true}).fill('青い空へ\n\n宇宙へ\n宇宙を');
  await page.getByRole('button',{name:'발음 변환'}).click();
  await expect(page.getByLabel('1행 한글 발음')).toHaveValue('아오이 소라에');
  await page.getByText('곡별 읽기 사전',{exact:false}).first().click();
  await page.getByLabel('사전 일본어 표기').fill('宇宙');
  await page.getByLabel('사전 가나 읽기').fill('そら');
  await page.getByRole('button',{name:'사전 등록',exact:true}).click();
  await expect(page.getByRole('button',{name:'복사하기'})).toBeDisabled();
  await page.getByRole('button',{name:'다시 변환'}).click();
  await expect(page.getByLabel('3행 한글 발음')).toHaveValue('소라에');
  await expect(page.getByLabel('4행 한글 발음')).toHaveValue('소라오');

  await page.getByRole('button',{name:'青い',exact:true}).click();
  await page.getByLabel('수정 구간의 끝').selectOption({label:'空까지'});
  await page.getByLabel('일본어 읽기').fill('せかい');
  await page.getByRole('button',{name:'발음 계산'}).click();
  await expect(page.locator('#hangul')).toHaveValue('세카이');
  await page.getByRole('button',{name:'수정 적용'}).click();
  await expect(page.getByRole('button',{name:'青い空',exact:true})).toBeVisible();
  await expect(page.getByLabel('1행 한글 발음')).toHaveValue('세카이에');
  await page.getByRole('button',{name:'다시 변환'}).click();
  await expect(page.getByLabel('1행 한글 발음')).toHaveValue('세카이에');

  await page.getByLabel('복사 형식').selectOption('wikidot');
  await page.getByLabel('1행 번역').fill('푸른 하늘로');
  await page.getByLabel('3행 번역').fill('우주로');
  await page.getByLabel('4행 번역').fill('우주를');
  await page.getByRole('button',{name:'복사하기'}).click();
  await expect.poll(async () => (await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g,'\n')).toContain('|| 青い空へ ||\n|| 세카이에 ||\n|| 푸른 하늘로 ||');

  const downloadPromise=page.waitForEvent('download');
  await page.getByRole('button',{name:'프로젝트 저장',exact:true}).click();
  const project=await downloadPromise;
  const file=await project.path();
  page.on('dialog',d => d.accept());
  await page.getByRole('button',{name:'새 곡',exact:true}).click();
  await expect(page.getByLabel('일본어 가사',{exact:true})).toHaveValue('');
  await page.getByLabel('프로젝트 파일',{exact:true}).setInputFiles(file!);
  await expect(page.getByLabel('1행 한글 발음')).toHaveValue('세카이에');
  await expect(page.getByLabel('1행 번역')).toHaveValue('푸른 하늘로');
  await expect(page.getByText('宇宙 → そら',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'다시 변환'}).click();
  await expect(page.getByLabel('1행 번역')).toHaveValue('푸른 하늘로');
  await page.getByRole('button',{name:'青い空',exact:true}).click();
  await page.getByRole('button',{name:'자동 결과로 복원'}).click();
  await expect(page.getByLabel('1행 한글 발음')).toHaveValue('아오이 소라에');
  await page.screenshot({path:'test-results/prototype-desktop.png',fullPage:true});
});

test('apply to all adds a dictionary entry without replacing explicit edits', async ({page}) => {
  await page.goto('./');
  await page.getByLabel('일본어 가사',{exact:true}).fill('宇宙へ\n宇宙へ');
  await page.getByRole('button',{name:'발음 변환'}).click();
  await page.getByRole('button',{name:'宇宙',exact:true}).first().click();
  await page.getByLabel('일본어 읽기').fill('そら');
  await page.getByRole('button',{name:'발음 계산'}).click();
  await expect(page.locator('#hangul')).toHaveValue('소라');
  await page.getByLabel('이 읽기를 곡 사전에 등록하고 같은 표현에 적용').check();
  await page.getByRole('button',{name:'수정 적용'}).click();
  await expect(page.getByLabel('1행 한글 발음')).toHaveValue('소라에');
  await expect(page.getByLabel('2행 한글 발음')).toHaveValue('소라에');
  await page.getByRole('button',{name:'宇宙',exact:true}).first().click();
  await page.locator('#hangul').fill('우주');
  await page.getByRole('button',{name:'수정 적용'}).click();
  await page.getByRole('button',{name:'다시 변환'}).click();
  await expect(page.getByLabel('1행 한글 발음')).toHaveValue('우주에');
  await expect(page.getByLabel('2행 한글 발음')).toHaveValue('소라에');
});

test('dictionary download failure preserves input and allows retry', async ({page}) => {
  await page.route('**/dictionary/*.gz',route => route.abort(),{times:1});
  await page.goto('./');
  await page.getByLabel('일본어 가사',{exact:true}).fill('空へ');
  await expect(page.getByRole('button',{name:'다시 다운로드'})).toBeVisible();
  await expect(page.getByLabel('일본어 가사',{exact:true})).toHaveValue('空へ');
  await page.getByRole('button',{name:'다시 다운로드'}).click();
  await page.getByRole('button',{name:'발음 변환'}).click();
  await expect(page.getByLabel('1행 한글 발음')).toHaveValue('소라에');
});

test('corrupt local data does not crash the app', async ({page}) => {
  await page.addInitScript(() => localStorage.setItem('vocaro-draft-v1','{"version":2,"text":"broken","result":{"lines":[{}]}}'));
  await page.goto('./');
  await expect(page.getByRole('alert')).toContainText('저장된 초안을 읽지 못');
  await expect(page.getByLabel('일본어 가사',{exact:true})).toBeVisible();
});

test('mobile range editor and translated result fit viewport', async ({page}) => {
  await page.setViewportSize({width:390,height:844});
  await page.goto('./');
  await page.getByLabel('일본어 가사',{exact:true}).fill('青い空へ');
  await page.getByRole('button',{name:'발음 변환'}).click();
  await page.getByRole('button',{name:'青い',exact:true}).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({path:'test-results/prototype-mobile-editor.png',fullPage:true});
  await page.getByRole('button',{name:'닫기',exact:true}).click();
  await page.getByLabel('복사 형식').selectOption('wikidot');
  await page.getByLabel('1행 번역').fill('푸른 하늘로');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
