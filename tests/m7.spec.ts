import { test, expect } from '@playwright/test';

test('first visit prioritizes live upload; synthetic response supports human review, save, reopen and PDF action', async ({page})=>{
  let requests=0;
  await page.route('**/*',async route=>{const u=new URL(route.request().url());if(!['127.0.0.1','localhost'].includes(u.hostname))return route.abort();if(u.pathname==='/api/analyze'){requests++;expect(route.request().headers()['x-sitewitness-access']).toBe('SYNTHETIC TEST CODE');return route.fulfill({json:{model:'muse-spark-1.3',timestamp:'2026-11-03T00:00:00.000Z',report:{overview:'SYNTHETIC TEST: visible timber formwork.',findings:[{id:'f1',category:'observation',title:'Synthetic timber formwork',description:'SYNTHETIC TEST: boards are visible.',evidence:'SYNTHETIC TEST: timber boards.',limitation:'SYNTHETIC TEST: condition is unknown.'}],unanswered_questions:['SYNTHETIC TEST: verify drawings.'],notice:'SYNTHETIC TEST: not engineering certification.'}}});}return route.continue();});
  await page.goto('/');
  await expect(page.getByRole('link',{name:/Analyze a site photograph/})).toBeVisible();
  await expect(page.getByRole('region',{name:'Genuine captured findings'})).toHaveCount(0);
  await expect(page.getByText(/Optional example · previously generated Meta report/)).toBeVisible();
  await page.getByRole('link',{name:/Analyze a site photograph/}).click();
  await page.getByLabel('Site access code').fill('SYNTHETIC TEST CODE');
  await page.getByLabel('Construction photograph').setInputFiles('public/evidence/captured-construction.jpg');
  await page.getByRole('button',{name:'Analyze with Meta Muse Spark'}).click();
  await expect(page.getByText('SYNTHETIC TEST: visible timber formwork.').first()).toBeVisible();
  await page.getByLabel('Decision').selectOption('investigate');
  await page.getByLabel('Reviewer notes').fill('SYNTHETIC TEST: verify on site.');
  await page.getByRole('button',{name:'Save report and photograph'}).click();
  await expect(page.getByRole('status')).toContainText('saved in this browser');
  await page.reload();
  await page.getByRole('button',{name:/Describe visible construction elements/}).click();
  await expect(page.getByLabel('Reviewer notes')).toHaveValue('SYNTHETIC TEST: verify on site.');
  await expect(page.getByLabel('Decision')).toHaveValue('investigate');
  await expect(page.getByRole('button',{name:'Print / Save as PDF'})).toBeVisible();
  await page.emulateMedia({media:'print'});
  await expect(page.locator('.print-report')).toBeVisible();
  await expect(page.locator('.print-report img')).toBeVisible();
  await expect(page.locator('.print-report')).toContainText('Human reviewed description');
  expect(requests).toBe(1);
});
