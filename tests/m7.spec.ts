import { test, expect } from '@playwright/test';
import source from '../lib/evidence/captured.json';

test('first visit shows genuine evidence and one-click review preserves saved decisions', async ({page,context})=>{
  const apiRequests:string[]=[];
  await context.route('**/*',route=>{
    const u=new URL(route.request().url());
    if(u.pathname.startsWith('/api/')){apiRequests.push(u.pathname);return route.abort();}
    if(!['127.0.0.1','localhost'].includes(u.hostname))return route.abort();
    return route.continue();
  });
  await page.setViewportSize({width:1440,height:1000});
  await page.goto('/');
  const preview=page.getByRole('region',{name:'Genuine captured findings'});
  for(const finding of source.report.findings)await expect(preview.getByRole('heading',{name:finding.title})).toBeVisible();
  await expect(page.getByRole('img',{name:/Construction site with timber/})).toBeVisible();
  await expect(page.getByText('Previously generated real Meta AI report; new live analysis disabled.',{exact:true})).toBeVisible();
  await expect(page.getByText('AI analysis is unavailable.',{exact:true})).toHaveCount(0);
  await page.screenshot({path:'test-results/m7-home-desktop.png',fullPage:true});
  for(const width of [320,390,768]){
    await page.setViewportSize({width,height:844});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  }
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:'test-results/m7-home-mobile.png',fullPage:true});
  await page.getByRole('link',{name:'Explore AI inspection'}).click();
  await expect(page.getByLabel('Reviewer decision')).toBeVisible();
  await page.getByLabel('Reviewer decision').selectOption('investigate');
  await page.getByLabel('Reviewer notes').fill('SYNTHETIC M7: verify on site');
  await page.getByRole('button',{name:'Save review and photograph',exact:true}).click();
  await expect(page.getByRole('status')).toContainText('Review and photograph saved');
  await page.reload();
  await expect(page.getByLabel('Reviewer notes')).toHaveValue('SYNTHETIC M7: verify on site');
  await expect(page.getByRole('navigation',{name:'Select captured finding'}).getByRole('button').first()).toContainText('Investigate');
  for(const width of [320,390,768,1440]){
    await page.setViewportSize({width,height:1000});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  }
  await page.screenshot({path:'test-results/m7-review-desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:'test-results/m7-review-mobile.png',fullPage:true});
  expect(apiRequests).toEqual([]);
});
