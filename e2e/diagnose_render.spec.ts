import { test, expect } from '@playwright/test';

test('diagnose painted DOM and review decorations', async ({ page }) => {
  const url = 'http://localhost:5175/annotation.html';
  await page.goto(url, { waitUntil: 'networkidle' });
  // give the app a moment to initialize
  await page.waitForTimeout(1000);

  const decorations = await page.evaluate(() => {
    try {
       
      // @ts-ignore
      return (window.__eigenpal_review_decorations as any) || null;
    } catch (e) {
      return { error: String(e) };
    }
  });

  const domMatchesCount = await page.evaluate(
    () => document.querySelectorAll('.hl-review-fail, .hl-review-pass').length
  );

  const pmElems = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-pm-start]'))
      .slice(0, 30)
      .map((el) => ({
        tag: el.tagName,
        pmStart: (el as HTMLElement).dataset.pmStart,
        pmEnd: (el as HTMLElement).dataset.pmEnd,
        classes: (el as HTMLElement).className,
      }))
  );

  const overlap = await page.evaluate(() => {
    try {
       
      // @ts-ignore
      const decs = (window.__eigenpal_review_decorations as Array<any>) || [];
      return decs.map((d) => ({
        deco: d,
        matches: Array.from(document.querySelectorAll('[data-pm-start]'))
          .filter((el) => {
            const s = parseInt((el as HTMLElement).dataset.pmStart || '-1', 10);
            const e = parseInt((el as HTMLElement).dataset.pmEnd || '-1', 10);
            return s < d.to && e > d.from;
          })
          .slice(0, 10)
          .map((el) => ({
            tag: el.tagName,
            pmStart: (el as HTMLElement).dataset.pmStart,
            pmEnd: (el as HTMLElement).dataset.pmEnd,
            classes: (el as HTMLElement).className,
          })),
      }));
    } catch (e) {
      return { error: String(e) };
    }
  });

  console.log('diagnose: decorations ->', JSON.stringify(decorations));
  console.log('diagnose: domMatchesCount ->', domMatchesCount);
  console.log('diagnose: pmElems ->', JSON.stringify(pmElems));
  console.log('diagnose: overlap ->', JSON.stringify(overlap));

  await page.screenshot({ path: 'screenshots/diagnose_render.png', fullPage: true });

  // ensure test passes so CI treats it as informational only
  expect(true).toBe(true);
});
